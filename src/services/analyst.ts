import { conversationActivity } from "./activity"
import { canReadAnalystMessages } from "./analyst-access"
import { decisionSelect, publicMessage } from "./decisions"
import { z } from "zod"
import { Prisma, type PrismaClient } from "../generated/prisma/client"
import { responseDueAt } from "./sla"

export class AnalystError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = "AnalystError"
  }
}
const inputSchema = z
  .object({
    action: z.enum(["claim", "reply", "return", "close", "transfer"]),
    toAnalystId: z.uuid().optional(),
    requestId: z.uuid(),
    revision: z.number().int().nonnegative(),
    content: z.string().trim().min(1).max(4000).optional(),
    resolveTicket: z.boolean().optional(),
  })
  .strict()
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new AnalystError(400, "Dados inválidos.")
  return result.data
}

export function createAnalystService(db: PrismaClient) {
  async function authorize(analystId: string) {
    parse(z.uuid(), analystId)
    const analyst = await db.user.findUnique({
      where: { id: analystId },
      select: { role: true, name: true },
    })
    if (analyst?.role !== "ANALYST")
      throw new AnalystError(403, "Acesso reservado a analistas.")
    return analyst
  }
  async function detail(analystId: string, id: string, metadataOnly = false) {
    await authorize(analystId)
    parse(z.uuid(), id)
    return db.$transaction(
      async (tx) => {
        const conversation = await tx.conversation.findUnique({
          where: { id },
          include: {
            employee: {
              select: {
                id: true,
                name: true,
                email: true,
                openedTickets: { select: { number: true } },
              },
            },
            assignedAnalyst: { select: { id: true, name: true } },
          },
        })
        if (!conversation)
          throw new AnalystError(404, "Conversa não encontrada.")
        const canReadMessages = canReadAnalystMessages(conversation, analystId)
        if (
          !canReadMessages &&
          !metadataOnly &&
          !["WAITING_ANALYST", "AGENT_ACTIVE"].includes(conversation.status)
        )
          throw new AnalystError(
            403,
            "Este atendimento pertence a outro analista."
          )
        // Query private data only after checking the current assignment.
        const messages = canReadMessages
          ? await tx.message.findMany({
              where: { conversationId: id },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              include: {
                authorUser: { select: { name: true } },
                decision: { select: decisionSelect },
              },
            })
          : []
        const drafts = canReadMessages
          ? await tx.ticketDraft.findMany({
              where: { conversationId: id, status: "PENDING" },
              orderBy: { createdAt: "asc" },
            })
          : []
        const tickets = canReadMessages
          ? await tx.ticket.findMany({
              where: { openedById: conversation.employeeId },
              orderBy: { updatedAt: "desc" },
              include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
            })
          : []
        const handoff = messages
          .slice()
          .reverse()
          .find(
            (message) =>
              (message.metadata as { kind?: string } | null)?.kind === "handoff"
          )?.metadata as
          { summary?: string; reason?: string; number?: string } | undefined
        const availableAnalysts =
          canReadMessages && conversation.status === "ANALYST_ACTIVE"
            ? await tx.user.findMany({
                where: {
                  role: "ANALYST",
                  demoLoginEnabled: true,
                  passwordHash: { not: null },
                  id: { not: analystId },
                },
                select: { id: true, name: true },
                orderBy: { name: "asc" },
              })
            : []
        return {
          ...conversation,
          canReadMessages,
          messages: messages.map(publicMessage),
          drafts,
          tickets,
          handoff: handoff ?? null,
          availableAnalysts,
          activity: (
            await conversationActivity(tx, analystId, "ANALYST", [conversation])
          ).get(id)!,
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    )
  }
  return {
    detail: (analystId: string, id: string) => detail(analystId, id),
    async start(analystId: string, sourceId: string, input: unknown) {
      const analyst = await authorize(analystId)
      parse(z.uuid(), sourceId)
      const data = parse(
        z
          .object({
            action: z.literal("start"),
            requestId: z.uuid(),
            revision: z.number().int().nonnegative(),
          })
          .strict(),
        input
      )
      const targetId = await db.$transaction(
        async (tx) => {
          const locked = await tx.conversation.updateMany({
            where: { id: sourceId },
            data: { revision: { increment: 1 } },
          })
          if (!locked.count)
            throw new AnalystError(404, "Conversa não encontrada.")
          const replay = await tx.message.findUnique({
            where: { requestId: data.requestId },
          })
          if (replay) {
            const metadata = replay.metadata as {
              action?: string
              conversationId?: string
            } | null
            if (
              replay.conversationId !== sourceId ||
              replay.authorUserId !== analystId ||
              metadata?.action !== "start" ||
              !metadata.conversationId
            )
              throw new AnalystError(409, "Pedido já utilizado.")
            return metadata.conversationId
          }
          const source = await tx.conversation.findUniqueOrThrow({
            where: { id: sourceId },
          })
          if (source.revision !== data.revision + 1)
            throw new AnalystError(
              409,
              "A conversa mudou. Atualize antes de continuar."
            )
          if (source.assignedAnalystId !== analystId)
            throw new AnalystError(
              403,
              "Este atendimento pertence a outro analista."
            )
          if (source.status !== "CLOSED")
            throw new AnalystError(
              409,
              "Inicie um novo atendimento a partir de uma conversa encerrada."
            )
          // Serialize starts for the same contact, including starts from different old threads.
          await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${source.employeeId}::uuid FOR UPDATE`
          const active = await tx.conversation.findFirst({
            where: {
              employeeId: source.employeeId,
              status: { in: ["ANALYST_ACTIVE", "WAITING_ANALYST"] },
            },
            orderBy: { createdAt: "desc" },
          })
          if (
            active &&
            (active.status !== "ANALYST_ACTIVE" ||
              active.assignedAnalystId !== analystId)
          )
            throw new AnalystError(
              409,
              "Este utilizador já tem um atendimento humano ativo. Abra-o na lista de conversas."
            )
          const target =
            active ??
            (await tx.conversation.create({
              data: {
                employeeId: source.employeeId,
                status: "ANALYST_ACTIVE",
                assignedAnalystId: analystId,
                messages: {
                  create: {
                    author: "ANALYST",
                    authorUserId: analystId,
                    content: `Olá! Sou ${analyst.name} e iniciei um novo atendimento. Pode escrever por aqui.`,
                    metadata: {
                      kind: "analyst-action",
                      action: "start",
                      previousConversationId: sourceId,
                    },
                  },
                },
              },
            }))
          await tx.message.create({
            data: {
              conversationId: sourceId,
              author: "SYSTEM",
              authorUserId: analystId,
              content: `${analyst.name} iniciou um novo atendimento. Esta conversa permanece encerrada.`,
              requestId: data.requestId,
              metadata: {
                kind: "analyst-action",
                action: "start",
                conversationId: target.id,
              },
            },
          })
          return target.id
        },
        { timeout: 15000 }
      )
      return detail(analystId, targetId)
    },
    async list(analystId: string) {
      await authorize(analystId)
      return db.$transaction(
        async (tx) => {
          const contacts = await tx.conversation.findMany({
            distinct: ["employeeId"],
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: 100,
            select: { employeeId: true },
          })
          const conversations = await tx.conversation.findMany({
            where: { employeeId: { in: contacts.map((c) => c.employeeId) } },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            include: {
              employee: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  openedTickets: { select: { number: true } },
                },
              },
              assignedAnalyst: { select: { id: true, name: true } },
            },
          })
          const readable = conversations.filter((c) =>
            canReadAnalystMessages(c, analystId)
          )
          const previews = readable.length
            ? await tx.conversation.findMany({
                where: {
                  id: { in: readable.map((c) => c.id) },
                  assignedAnalystId: analystId,
                },
                select: {
                  id: true,
                  messages: {
                    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                    take: 1,
                    select: {
                      id: true,
                      content: true,
                      author: true,
                      createdAt: true,
                    },
                  },
                  drafts: {
                    where: { targetTicketId: { not: null } },
                    select: { targetTicket: { select: { number: true } } },
                  },
                },
              })
            : []
          const activity = await conversationActivity(
            tx,
            analystId,
            "ANALYST",
            conversations
          )
          return conversations.map((c) => {
            const preview = previews.find((p) => p.id === c.id)
            return {
              ...c,
              canReadMessages: canReadAnalystMessages(c, analystId),
              messages: preview?.messages ?? [],
              drafts: preview?.drafts ?? [],
              activity: activity.get(c.id)!,
            }
          })
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
      )
    },
    async act(analystId: string, id: string, input: unknown) {
      const analyst = await authorize(analystId)
      parse(z.uuid(), id)
      const data = parse(inputSchema, input)
      if (data.action === "reply" && !data.content)
        throw new AnalystError(400, "Escreva uma resposta.")
      if (data.resolveTicket && data.action !== "close")
        throw new AnalystError(
          400,
          "A resolução deve acompanhar o encerramento."
        )
      if ((data.action === "transfer") !== !!data.toAnalystId)
        throw new AnalystError(
          400,
          "Selecione o analista para a transferência."
        )
      await db.$transaction(
        async (tx) => {
          // Serialize claims, transfers, employee messages and read acknowledgements.
          const locked = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM "Conversation" WHERE id = ${id}::uuid FOR UPDATE`
          if (!locked.length)
            throw new AnalystError(404, "Conversa não encontrada.")
          const conversation = await tx.conversation.findUniqueOrThrow({
            where: { id },
          })
          const replay = await tx.message.findUnique({
            where: { requestId: data.requestId },
          })
          if (replay) {
            const metadata = replay.metadata as {
              action?: string
              toAnalystId?: string
            } | null
            if (
              replay.conversationId !== id ||
              replay.authorUserId !== analystId ||
              metadata?.action !== data.action ||
              (data.action === "reply" && replay.content !== data.content) ||
              (data.action === "transfer" &&
                metadata?.toAnalystId !== data.toAnalystId)
            )
              throw new AnalystError(409, "Pedido já utilizado.")
            if (
              !canReadAnalystMessages(conversation, analystId) &&
              !["return", "transfer"].includes(data.action)
            )
              throw new AnalystError(
                403,
                "Este atendimento pertence a outro analista."
              )
            return
          }
          const owned =
            conversation.status === "ANALYST_ACTIVE" &&
            conversation.assignedAnalystId === analystId
          if (data.action === "claim") {
            if (
              conversation.status !== "WAITING_ANALYST" ||
              conversation.assignedAnalystId
            )
              throw new AnalystError(
                409,
                "Esta conversa já foi assumida ou não aguarda atendimento."
              )
          } else if (data.action === "return") {
            if (
              !owned &&
              !(
                conversation.status === "WAITING_ANALYST" &&
                !conversation.assignedAnalystId
              )
            )
              throw new AnalystError(
                403,
                "Só o analista responsável pode devolver esta conversa."
              )
          } else if (!owned) {
            throw new AnalystError(
              403,
              "Assuma a conversa antes de responder ou encerrar."
            )
          }
          if (conversation.revision !== data.revision)
            throw new AnalystError(
              409,
              "A conversa mudou. Atualize antes de continuar."
            )
          const recipient =
            data.action === "transfer"
              ? await tx.user.findFirst({
                  where: {
                    id: data.toAnalystId,
                    role: "ANALYST",
                    demoLoginEnabled: true,
                    passwordHash: { not: null },
                  },
                  select: { id: true, name: true },
                })
              : null
          if (
            data.action === "transfer" &&
            (!recipient || recipient.id === analystId)
          )
            throw new AnalystError(400, "Selecione outro analista ativo.")
          await tx.conversation.update({
            where: { id },
            data: { revision: { increment: 1 } },
          })
          const handoff = await tx.message.findFirst({
            where: {
              conversationId: id,
              metadata: { path: ["kind"], equals: "handoff" },
            },
            orderBy: { createdAt: "desc" },
          })
          const number = (handoff?.metadata as { number?: string } | null)
            ?.number
          const ticket = number
            ? await tx.ticket.findFirst({
                where: { number, openedById: conversation.employeeId },
              })
            : null
          if (
            data.resolveTicket &&
            (!ticket || ["RESOLVED", "CLOSED"].includes(ticket.status))
          )
            throw new AnalystError(
              409,
              "Não há chamado ativo associado para resolver."
            )
          const now = new Date()
          if (data.action !== "reply") {
            await tx.conversation.update({
              where: { id },
              data:
                data.action === "claim"
                  ? { status: "ANALYST_ACTIVE", assignedAnalystId: analystId }
                  : data.action === "return"
                    ? { status: "AGENT_ACTIVE", assignedAnalystId: null }
                    : data.action === "transfer"
                      ? { assignedAnalystId: recipient!.id }
                      : { status: "CLOSED", closedAt: now },
            })
          }
          if (data.action === "close") {
            await tx.ticketDraft.updateMany({
              where: { conversationId: id, status: "PENDING" },
              data: { status: "EXPIRED" },
            })
          }
          if (ticket && !["RESOLVED", "CLOSED"].includes(ticket.status)) {
            const update =
              data.action === "reply"
                ? {
                    lastResponseAt: now,
                    nextResponseDueAt: responseDueAt(ticket.priority, now),
                  }
                : data.resolveTicket
                  ? {
                      status: "RESOLVED" as const,
                      resolvedAt: now,
                      lastResponseAt: now,
                      nextResponseDueAt: null,
                    }
                  : data.action === "claim" ||
                      data.action === "return" ||
                      data.action === "transfer"
                    ? { status: "IN_PROGRESS" as const }
                    : null
            if (update)
              await tx.ticket.update({
                where: { id: ticket.id },
                data: {
                  ...update,
                  events: {
                    create: {
                      actorId: analystId,
                      action: data.resolveTicket
                        ? "RESOLVED"
                        : data.action === "reply"
                          ? "ANALYST_RESPONSE"
                          : data.action === "claim" ||
                              data.action === "transfer"
                            ? "ASSIGNED"
                            : "RETURNED_TO_AGENT",
                      metadata: {
                        conversationId: id,
                        ...(data.action === "transfer"
                          ? { toAnalystId: recipient!.id }
                          : {}),
                        ...(data.content ? { content: data.content } : {}),
                      },
                    },
                  },
                },
              })
          }
          const latest = await tx.message.findFirst({
            where: { conversationId: id },
            orderBy: { createdAt: "desc" },
          })
          const content =
            data.action === "transfer"
              ? `${analyst.name} transferiu o atendimento para ${recipient!.name}.`
              : data.action === "reply"
                ? data.content!
                : data.action === "claim"
                  ? `${analyst.name} assumiu o atendimento. O assistente permanece pausado.`
                  : data.action === "return"
                    ? `${analyst.name} devolveu a conversa ao assistente. Pode continuar a conversa.`
                    : `${analyst.name} encerrou o atendimento.${data.resolveTicket ? " O chamado associado foi resolvido." : ""}`
          await tx.message.create({
            data: {
              conversationId: id,
              author: data.action === "reply" ? "ANALYST" : "SYSTEM",
              authorUserId: analystId,
              content,
              requestId: data.requestId,
              metadata: {
                kind: "analyst-action",
                action: data.action,
                ...(data.action === "transfer"
                  ? { toAnalystId: recipient!.id }
                  : {}),
              },
              createdAt: new Date(
                Math.max(now.getTime(), (latest?.createdAt.getTime() ?? 0) + 1)
              ),
            },
          })
        },
        { timeout: 15000 }
      )
      return detail(
        analystId,
        id,
        data.action === "transfer" || data.action === "return"
      )
    },
  }
}
