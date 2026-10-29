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
    action: z.enum(["claim", "reply", "return", "close"]),
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
  async function detail(analystId: string, id: string) {
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
            drafts: {
              where: { status: "PENDING" },
              orderBy: { createdAt: "asc" },
            },
            messages: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              include: { authorUser: { select: { name: true } } },
            },
          },
        })
        if (!conversation)
          throw new AnalystError(404, "Conversa não encontrada.")
        const tickets = await tx.ticket.findMany({
          where: { openedById: conversation.employeeId },
          orderBy: { updatedAt: "desc" },
          include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
        })
        const handoff = [...conversation.messages]
          .reverse()
          .find(
            (message) =>
              (message.metadata as { kind?: string } | null)?.kind === "handoff"
          )?.metadata as
          { summary?: string; reason?: string; number?: string } | undefined
        return { ...conversation, tickets, handoff: handoff ?? null }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    )
  }
  return {
    detail,
    async list(analystId: string) {
      await authorize(analystId)
      return db.conversation.findMany({
        orderBy: { updatedAt: "desc" },
        take: 100,
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
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true },
          },
          drafts: {
            where: { targetTicketId: { not: null } },
            select: { targetTicket: { select: { number: true } } },
          },
        },
      })
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
      await db.$transaction(
        async (tx) => {
          // Same row lock used by employee messages and model proposals.
          const locked = await tx.conversation.updateMany({
            where: { id },
            data: { revision: { increment: 1 } },
          })
          if (!locked.count)
            throw new AnalystError(404, "Conversa não encontrada.")
          const replay = await tx.message.findUnique({
            where: { requestId: data.requestId },
          })
          if (replay) {
            const metadata = replay.metadata as { action?: string } | null
            if (
              replay.conversationId !== id ||
              replay.authorUserId !== analystId ||
              metadata?.action !== data.action ||
              (data.action === "reply" && replay.content !== data.content)
            )
              throw new AnalystError(409, "Pedido já utilizado.")
            return
          }
          const conversation = await tx.conversation.findUniqueOrThrow({
            where: { id },
          })
          if (conversation.revision !== data.revision + 1)
            throw new AnalystError(
              409,
              "A conversa mudou. Atualize antes de continuar."
            )
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
                  : data.action === "claim" || data.action === "return"
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
                          : data.action === "claim"
                            ? "ASSIGNED"
                            : "RETURNED_TO_AGENT",
                      metadata: {
                        conversationId: id,
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
            data.action === "reply"
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
              metadata: { kind: "analyst-action", action: data.action },
              createdAt: new Date(
                Math.max(now.getTime(), (latest?.createdAt.getTime() ?? 0) + 1)
              ),
            },
          })
        },
        { timeout: 15000 }
      )
      return detail(analystId, id)
    },
  }
}
