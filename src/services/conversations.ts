import { z } from "zod"
import { Prisma, type PrismaClient } from "../generated/prisma/client"
import {
  createTicketService,
  ticketFields,
  TicketServiceError,
} from "./tickets"
import { MESSAGE_LIMIT } from "../contracts/chat"
import { agentPlan, type AgentPlanner, type AgentRun } from "../contracts/agent"
import { searchHelp } from "./knowledge"

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

export function createConversationService(
  db: PrismaClient,
  options: { plan?: AgentPlanner } = {}
) {
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
      let run: AgentRun | undefined
      let plannedRevision: number | undefined
      let command:
        | z.infer<typeof action>
        | { type: "agent-help"; query: string }
        | { type: "agent-update"; number: string; addition: string }
        | { type: "clarify"; question: string }
        | undefined = data.action
      if (!data.action) {
        const context = await db.conversation.findFirst({
          where: { id, employeeId },
          include: {
            messages: {
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 10,
            },
            _count: {
              select: {
                messages: { where: { author: "EMPLOYEE" } },
                drafts: { where: { status: "PENDING" } },
              },
            },
          },
        })
        if (!context)
          throw new ConversationError(404, "Conversa não encontrada.")
        const replay = await db.message.findUnique({
          where: { requestId: data.requestId },
        })
        if (replay) {
          if (
            replay.conversationId !== id ||
            replay.authorUserId !== employeeId
          )
            throw new ConversationError(409, "Pedido já utilizado.")
          return snapshot(employeeId, id)
        }
        if (
          context.status === "CLOSED" ||
          context._count.messages >= MESSAGE_LIMIT
        )
          throw new ConversationError(
            409,
            "Conversa encerrada ou limite atingido. Inicie uma nova conversa."
          )
        if (
          context._count.messages === MESSAGE_LIMIT - 1 &&
          context._count.drafts
        )
          throw new ConversationError(
            409,
            "Use a última mensagem para confirmar ou cancelar o rascunho pendente."
          )
        if (context.status === "AGENT_ACTIVE") {
          // No database transaction/row lock is held while waiting for Groq.
          const planner = options.plan ?? (await import("./agent")).planWithNexo
          run = await planner({
            content: data.content,
            history: context.messages.reverse(),
          })
          const plan = parse(agentPlan, run.plan)
          plannedRevision = context.revision
          if (plan.confidence < 0.65) {
            command = {
              type: "clarify",
              question:
                "Preciso de mais detalhes para agir com segurança. Quer orientação, consultar um chamado, abrir um pedido ou falar com um analista?",
            }
          } else {
            switch (plan.intent) {
              case "help":
                command = { type: "agent-help", query: plan.query }
                break
              case "tickets":
                command = plan.number
                  ? { type: "ticket", number: plan.number }
                  : { type: "tickets" }
                break
              case "create":
                command = {
                  type: "draft",
                  fields: { ...plan.fields, priority: "MEDIUM" },
                }
                break
              case "update":
                command = {
                  type: "agent-update",
                  number: plan.number,
                  addition: plan.addition,
                }
                break
              case "handoff":
                command = { type: "handoff" }
                break
              case "clarify":
                command = { type: "clarify", question: plan.question }
                break
            }
          }
        }
      }
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
          if (
            plannedRevision !== undefined &&
            conversation.revision !== plannedRevision + 1
          )
            throw new ConversationError(
              409,
              "A conversa mudou enquanto o assistente respondia. Atualize e tente novamente."
            )
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
          if (
            ["draft", "agent-update"].includes(command?.type ?? "") &&
            count >= MESSAGE_LIMIT - 1
          )
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
                author: run ? "AGENT" : "SYSTEM",
                content,
                metadata: {
                  ...metadata,
                  ...(run
                    ? {
                        agent: {
                          model: run.model,
                          tool: run.tool,
                          inputTokens: run.inputTokens ?? 0,
                          outputTokens: run.outputTokens ?? 0,
                        },
                      }
                    : {}),
                },
                ...(run
                  ? {
                      decision: {
                        create: {
                          intent: run.plan.intent,
                          action: String(
                            metadata.kind ?? command?.type ?? "clarify"
                          ),
                          confidence: run.plan.confidence,
                          reasonSummary: run.plan.reason,
                          evidenceSummary: metadata.sourceIds
                            ? JSON.stringify(metadata.sourceIds)
                            : null,
                          resultSummary: content.slice(0, 500),
                        },
                      },
                    }
                  : {}),
                createdAt: new Date(
                  Math.max(Date.now(), sent.createdAt.getTime() + 1)
                ),
              },
            })
          if (conversation.status !== "AGENT_ACTIVE") return
          const tickets = createTicketService(db, { transaction: tx })
          if (command?.type === "tickets") {
            const list = await tickets.list(employeeId)
            await reply(
              list.length
                ? "Estes são os seus chamados. Selecione um para consultar os detalhes."
                : "Não encontrei chamados abertos por si. Pode preparar um novo chamado.",
              { kind: "tickets", activity: "consultou seus chamados" }
            )
          } else if (command?.type === "ticket") {
            const ticket = await tickets
              .get(employeeId, command.number)
              .catch((error: unknown) => {
                if (
                  run &&
                  error instanceof TicketServiceError &&
                  error.code === "NOT_FOUND"
                )
                  return null
                throw error
              })
            if (!ticket) {
              await reply(
                "Não encontrei esse chamado entre os seus chamados.",
                { kind: "not-found" }
              )
              return
            }
            await reply(`Consulte os detalhes do chamado ${ticket.number}.`, {
              kind: "ticket",
              number: ticket.number,
              activity: `consultou ${ticket.number}`,
            })
          } else if (command?.type === "agent-update") {
            const ticket = await tickets
              .get(employeeId, command.number)
              .catch((error: unknown) => {
                if (
                  error instanceof TicketServiceError &&
                  error.code === "NOT_FOUND"
                )
                  return null
                throw error
              })
            if (!ticket) {
              await reply(
                "Não encontrei esse chamado entre os seus chamados.",
                { kind: "not-found" }
              )
              return
            }
            if (["RESOLVED", "CLOSED"].includes(ticket.status)) {
              await reply(
                "Este chamado está resolvido ou encerrado. Peça atendimento a um analista para avaliar a reabertura.",
                { kind: "clarify" }
              )
              return
            }
            const fields = parse(ticketFields, {
              title: ticket.title,
              description: `${ticket.description}\n\nComplemento: ${command.addition}`,
              type: ticket.type,
              category: ticket.category,
              priority: ticket.priority,
              affectedUserId: ticket.affectedUserId,
            })
            await tx.ticketDraft.updateMany({
              where: { conversationId: id, status: "PENDING" },
              data: { status: "EXPIRED" },
            })
            const draft = await tx.ticketDraft.create({
              data: {
                conversationId: id,
                operation: "UPDATE",
                targetTicketId: ticket.id,
                payload: {
                  ...fields,
                  expectedUpdatedAt: ticket.updatedAt.toISOString(),
                },
              },
            })
            await reply(
              `Confira o complemento do chamado ${ticket.number}. A alteração só será aplicada depois de confirmar.`,
              {
                kind: "draft",
                draftId: draft.id,
                activity: "preparou um complemento para confirmação",
              }
            )
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
              let preserved: {
                affectedUserId: string
                expectedUpdatedAt?: string
              } = { affectedUserId: employeeId }
              if (draft.operation === "UPDATE") {
                const stored = parse(
                  ticketFields.extend({ expectedUpdatedAt: z.string() }),
                  draft.payload
                )
                if (command.fields.type !== stored.type)
                  throw new ConversationError(
                    400,
                    "O tipo de um chamado existente não pode ser alterado."
                  )
                preserved = {
                  affectedUserId: stored.affectedUserId,
                  expectedUpdatedAt: stored.expectedUpdatedAt,
                }
              }
              draft = await tx.ticketDraft.update({
                where: { id: draft.id },
                data: {
                  payload: { ...command.fields, ...preserved },
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
              "Confira os dados antes de confirmar a operação. Pode confirmar, editar ou cancelar.",
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
                "Este rascunho já foi confirmado; a operação não foi repetida."
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
              await reply("Rascunho cancelado. Nenhuma alteração foi aplicada.")
            } else {
              const { expectedUpdatedAt, ...fields } = parse(
                ticketFields.extend({
                  expectedUpdatedAt: z.string().optional(),
                }),
                draft.payload
              )
              let ticket
              if (draft.operation === "UPDATE") {
                if (!draft.targetTicketId)
                  throw new ConversationError(404, "Chamado não encontrado.")
                const target = await tx.ticket.findFirst({
                  where: { id: draft.targetTicketId, openedById: employeeId },
                })
                if (!target)
                  throw new ConversationError(404, "Chamado não encontrado.")
                if (target.updatedAt.toISOString() !== expectedUpdatedAt)
                  throw new ConversationError(
                    409,
                    "O chamado mudou. Cancele este rascunho e prepare um novo complemento."
                  )
                // Lock against concurrent service updates before applying the approved snapshot.
                const lockedTicket = await tx.ticket.updateMany({
                  where: { id: target.id, updatedAt: target.updatedAt },
                  data: { updatedAt: new Date() },
                })
                if (!lockedTicket.count)
                  throw new ConversationError(
                    409,
                    "O chamado mudou. Prepare um novo complemento."
                  )
                ticket = await tickets.update(employeeId, target.number, fields)
              } else if (draft.operation === "CREATE") {
                ticket = await tickets.create(employeeId, fields)
              } else
                throw new ConversationError(
                  409,
                  "Operação ainda não disponível."
                )
              await tx.ticketDraft.update({
                where: { id: draft.id },
                data: {
                  status: "CONFIRMED",
                  confirmedAt: new Date(),
                  targetTicketId: ticket.id,
                },
              })
              await reply(
                `Chamado ${ticket.number} ${draft.operation === "UPDATE" ? "atualizado" : "criado"} com os dados confirmados.`,
                {
                  kind: "ticket",
                  number: ticket.number,
                  activity: `${draft.operation === "UPDATE" ? "atualizou" : "criou"} o chamado após confirmação`,
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
          } else if (command?.type === "agent-help") {
            const articles = await searchHelp(tx, command.query)
            await reply(
              articles.length
                ? articles
                    .map(
                      (article) => `Fonte: ${article.title}\n${article.content}`
                    )
                    .join("\n\n")
                : "Não encontrei uma orientação correspondente na central de ajuda. Pode descrever melhor o problema ou pedir um analista.",
              {
                kind: "help",
                activity: "pesquisou a central de ajuda",
                sourceIds: articles.map((article) => article.id),
              }
            )
          } else if (command?.type === "clarify") {
            await reply(command.question, {
              kind: "welcome",
              activity: "pediu esclarecimento",
            })
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
