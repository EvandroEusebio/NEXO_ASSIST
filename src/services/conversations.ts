import { z } from "zod"
import { Prisma, type PrismaClient } from "../generated/prisma/client"
import { createTicketService, ticketFields } from "./tickets"
import { MESSAGE_LIMIT } from "../contracts/chat"

export class ConversationError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = "ConversationError"
  }
}
const uuid = z.uuid()
const draftFields = ticketFields.omit({ affectedUserId: true })
const action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tickets") }).strict(),
  z
    .object({ type: z.literal("ticket"), number: z.string().min(1).max(32) })
    .strict(),
  z.object({ type: z.literal("help") }).strict(),
  z.object({ type: z.literal("handoff") }).strict(),
  z
    .object({
      type: z.literal("draft"),
      fields: draftFields,
      draftId: uuid.optional(),
      version: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      type: z.enum(["confirm", "cancel"]),
      draftId: uuid,
      version: z.number().int().positive(),
    })
    .strict(),
])
const sendInput = z
  .object({
    requestId: uuid,
    content: z.string().trim().min(1).max(4000),
    action: action.optional(),
  })
  .strict()
function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success)
    throw new ConversationError(
      400,
      "Dados inválidos. Verifique os campos e tente novamente."
    )
  return result.data
}

export function createConversationService(db: PrismaClient) {
  async function employee(id: string) {
    parse(uuid, id)
    const user = await db.user.findUnique({
      where: { id },
      select: { role: true },
    })
    if (user?.role !== "EMPLOYEE")
      throw new ConversationError(403, "Funcionário inválido.")
  }
  async function snapshot(employeeId: string, id: string) {
    parse(uuid, id)
    await employee(employeeId)
    return db.$transaction(
      async (tx) => {
        const conversation = await tx.conversation.findFirst({
          where: { id, employeeId },
          include: {
            messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
            drafts: {
              orderBy: { createdAt: "asc" },
              include: { targetTicket: { select: { number: true } } },
            },
          },
        })
        if (!conversation)
          throw new ConversationError(404, "Conversa não encontrada.")
        const tickets = await tx.ticket.findMany({
          where: { openedById: employeeId },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
        return {
          ...conversation,
          tickets,
          messageCount: conversation.messages.filter(
            (m) => m.author === "EMPLOYEE"
          ).length,
          limit: MESSAGE_LIMIT,
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    )
  }
  return {
    snapshot,
    async list(employeeId: string) {
      await employee(employeeId)
      const conversations = await db.conversation.findMany({
        where: { employeeId },
        orderBy: { updatedAt: "desc" },
        take: 100,
        include: {
          messages: {
            where: { author: "EMPLOYEE" },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      })
      return conversations.map((c) => ({
        id: c.id,
        status: c.status,
        updatedAt: c.updatedAt,
        title: c.messages[0]?.content.slice(0, 70) ?? "Nova conversa",
      }))
    },
    async create(employeeId: string, input: unknown) {
      await employee(employeeId)
      const { id } = parse(z.object({ id: uuid }).strict(), input)
      const existing = await db.conversation.findUnique({ where: { id } })
      if (existing && existing.employeeId !== employeeId)
        throw new ConversationError(404, "Conversa não encontrada.")
      if (!existing)
        await db.conversation.create({
          data: {
            id,
            employeeId,
            messages: {
              create: {
                author: "SYSTEM",
                content:
                  "Olá! Como posso ajudar? Consulte os seus chamados, abra um novo pedido ou procure orientação na central de ajuda.",
                metadata: { kind: "welcome" },
              },
            },
          },
        })
      return snapshot(employeeId, id)
    },
    async send(employeeId: string, id: string, input: unknown) {
      parse(uuid, id)
      await employee(employeeId)
      const data = parse(sendInput, input)
      await db.$transaction(
        async (tx) => {
          // The row update serializes all writes for this conversation, including count and confirmation.
          const locked = await tx.conversation.updateMany({
            where: { id, employeeId },
            data: { revision: { increment: 1 } },
          })
          if (!locked.count)
            throw new ConversationError(404, "Conversa não encontrada.")
          const replay = await tx.message.findUnique({
            where: { requestId: data.requestId },
          })
          if (replay) {
            if (
              replay.conversationId !== id ||
              replay.authorUserId !== employeeId
            )
              throw new ConversationError(409, "Pedido já utilizado.")
            return
          }
          const conversation = await tx.conversation.findUniqueOrThrow({
            where: { id },
          })
          if (conversation.status === "CLOSED")
            throw new ConversationError(
              409,
              "Esta conversa foi encerrada. Inicie uma nova conversa."
            )
          const count = await tx.message.count({
            where: { conversationId: id, author: "EMPLOYEE" },
          })
          if (count >= MESSAGE_LIMIT)
            throw new ConversationError(
              409,
              "Limite de 30 mensagens atingido. Inicie uma nova conversa."
            )
          if (data.action?.type === "draft" && count >= MESSAGE_LIMIT - 1)
            throw new ConversationError(
              409,
              "Inicie uma nova conversa para preparar um rascunho e ter espaço para o confirmar."
            )
          if (
            count === MESSAGE_LIMIT - 1 &&
            !["confirm", "cancel"].includes(data.action?.type ?? "") &&
            (await tx.ticketDraft.count({
              where: { conversationId: id, status: "PENDING" },
            }))
          )
            throw new ConversationError(
              409,
              "Use a última mensagem para confirmar ou cancelar o rascunho pendente."
            )
          if (conversation.status !== "AGENT_ACTIVE" && data.action)
            throw new ConversationError(
              409,
              "A conversa está com o atendimento humano."
            )
          const latest = await tx.message.findFirst({
            where: { conversationId: id },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          })
          const sent = await tx.message.create({
            data: {
              conversationId: id,
              author: "EMPLOYEE",
              authorUserId: employeeId,
              content: data.content,
              requestId: data.requestId,
              createdAt: new Date(
                Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1)
              ),
            },
          })
          const reply = (
            content: string,
            metadata: Prisma.InputJsonObject = {}
          ) =>
            tx.message.create({
              data: {
                conversationId: id,
                author: "SYSTEM",
                content,
                metadata,
                createdAt: new Date(
                  Math.max(Date.now(), sent.createdAt.getTime() + 1)
                ),
              },
            })
          if (conversation.status !== "AGENT_ACTIVE") return
          const tickets = createTicketService(db, { transaction: tx })
          const command = data.action
          if (command?.type === "tickets") {
            const list = await tickets.list(employeeId)
            await reply(
              list.length
                ? "Estes são os seus chamados. Selecione um para consultar os detalhes."
                : "Não encontrei chamados abertos por si. Pode preparar um novo chamado.",
              { kind: "tickets", activity: "consultou seus chamados" }
            )
          } else if (command?.type === "ticket") {
            const ticket = await tickets.get(employeeId, command.number)
            await reply(`Consulte os detalhes do chamado ${ticket.number}.`, {
              kind: "ticket",
              number: ticket.number,
              activity: `consultou ${ticket.number}`,
            })
          } else if (command?.type === "draft") {
            let draft
            if (command.draftId) {
              draft = await tx.ticketDraft.findFirst({
                where: {
                  id: command.draftId,
                  conversationId: id,
                  status: "PENDING",
                  version: command.version ?? 0,
                },
              })
              if (!draft)
                throw new ConversationError(
                  409,
                  "O rascunho mudou. Atualize a conversa antes de editar."
                )
              draft = await tx.ticketDraft.update({
                where: { id: draft.id },
                data: {
                  payload: { ...command.fields, affectedUserId: employeeId },
                  version: { increment: 1 },
                },
              })
            } else {
              await tx.ticketDraft.updateMany({
                where: { conversationId: id, status: "PENDING" },
                data: { status: "EXPIRED" },
              })
              draft = await tx.ticketDraft.create({
                data: {
                  conversationId: id,
                  operation: "CREATE",
                  payload: { ...command.fields, affectedUserId: employeeId },
                },
              })
            }
            await reply(
              "Confira os dados antes de criar o chamado. Pode confirmar, editar ou cancelar.",
              {
                kind: "draft",
                draftId: draft.id,
                activity: "preparou o rascunho",
              }
            )
          } else if (
            command?.type === "confirm" ||
            command?.type === "cancel"
          ) {
            const draft = await tx.ticketDraft.findFirst({
              where: { id: command.draftId, conversationId: id },
            })
            if (!draft)
              throw new ConversationError(404, "Rascunho não encontrado.")
            if (draft.status === "CONFIRMED" && command.type === "confirm") {
              await reply(
                "Este rascunho já foi confirmado; o chamado não foi duplicado."
              )
              return
            }
            if (draft.status !== "PENDING" || draft.version !== command.version)
              throw new ConversationError(
                409,
                "O rascunho mudou. Atualize a conversa antes de continuar."
              )
            if (command.type === "cancel") {
              await tx.ticketDraft.update({
                where: { id: draft.id },
                data: { status: "CANCELLED" },
              })
              await reply("Rascunho cancelado. Nenhum chamado foi criado.")
            } else {
              const fields = parse(ticketFields, draft.payload)
              const ticket = await tickets.create(employeeId, fields)
              await tx.ticketDraft.update({
                where: { id: draft.id },
                data: {
                  status: "CONFIRMED",
                  confirmedAt: new Date(),
                  targetTicketId: ticket.id,
                },
              })
              await reply(
                `Chamado ${ticket.number} criado com os dados confirmados.`,
                {
                  kind: "ticket",
                  number: ticket.number,
                  activity: "criou o chamado após confirmação",
                }
              )
            }
          } else if (command?.type === "handoff") {
            await tx.conversation.update({
              where: { id },
              data: { status: "WAITING_ANALYST" },
            })
            await reply(
              "Solicitação de atendimento humano registada. A conversa está a aguardar um analista; pode acrescentar informações enquanto espera.",
              { kind: "handoff", activity: "encaminhou a conversa" }
            )
          } else if (command?.type === "help") {
            const articles = await tx.helpArticle.findMany({
              orderBy: { title: "asc" },
              take: 10,
            })
            await reply(
              articles.map((a) => `${a.title}\n${a.content}`).join("\n\n") ||
                "A central de ajuda ainda não tem artigos.",
              { activity: "consultou a central de ajuda" }
            )
          } else {
            await reply(
              "Recebi a sua mensagem. Use as opções abaixo para consultar chamados, preparar um novo chamado ou procurar orientações na central de ajuda.",
              { kind: "welcome" }
            )
          }
        },
        { timeout: 15000 }
      )
      return snapshot(employeeId, id)
    },
  }
}
