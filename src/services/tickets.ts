import { randomUUID } from "node:crypto"
import { z } from "zod"
import { Prisma, type PrismaClient } from "../generated/prisma/client"
import {
  TicketCategory,
  TicketPriority,
  TicketStatus,
  TicketType,
} from "../generated/prisma/enums"
import { responseDueAt } from "./sla"
import {
  canReopen,
  problemMatchScore,
  REOPEN_WINDOW_MS,
  type Problem,
} from "./ticket-matching"

export type TicketErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "CONFLICT"
  | "UNAVAILABLE"

export class TicketServiceError extends Error {
  constructor(
    public readonly code: TicketErrorCode,
    message: string
  ) {
    super(message)
    this.name = "TicketServiceError"
  }
}

const uuid = z.uuid()
const text = z.string().trim().min(1).max(20_000)
export const ticketFields = z
  .object({
    title: text.max(240),
    description: text,
    type: z.enum(TicketType),
    category: z.enum(TicketCategory),
    priority: z.enum(TicketPriority),
    affectedUserId: uuid,
  })
  .strict()
const fields = ticketFields
const update = fields
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0)
const filters = z
  .object({
    status: z.enum(TicketStatus).optional(),
    take: z.number().int().min(1).max(100).default(50),
    skip: z.number().int().min(0).default(0),
  })
  .strict()

export type CreateTicketInput = z.infer<typeof fields>
export type UpdateTicketInput = z.infer<typeof update>
export type TicketFilters = z.input<typeof filters>

type Transaction = Prisma.TransactionClient

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success)
    throw new TicketServiceError("INVALID_INPUT", "Dados do chamado inválidos.")
  return result.data
}

/** Backend-only: employeeId must come from the trusted session, never model/user input. */
export function createTicketService(
  db: PrismaClient,
  options: {
    /** Deterministic failure injection before any database access; no random failures. */
    isUnavailable?: () => boolean
    transaction?: Prisma.TransactionClient
  } = {}
) {
  async function run<T>(
    employeeId: string,
    operation: (tx: Transaction) => Promise<T>
  ): Promise<T> {
    parse(uuid, employeeId)
    if (options.isUnavailable?.())
      throw new TicketServiceError(
        "UNAVAILABLE",
        "Serviço de chamados temporariamente indisponível."
      )
    try {
      const execute = async (tx: Transaction) => {
        const employee = await tx.user.findUnique({
          where: { id: employeeId },
          select: { role: true },
        })
        if (employee?.role !== "EMPLOYEE")
          throw new TicketServiceError("FORBIDDEN", "Funcionário inválido.")
        return operation(tx)
      }
      return options.transaction
        ? await execute(options.transaction)
        : await db.$transaction(execute, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          })
    } catch (error) {
      if (error instanceof TicketServiceError) throw error
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (["P2034", "P2002"].includes(error.code))
          throw new TicketServiceError(
            "CONFLICT",
            "Alteração concorrente. Consulte o chamado antes de tentar novamente."
          )
        if (["P1001", "P1002", "P1008", "P1017", "P2024"].includes(error.code))
          throw new TicketServiceError(
            "UNAVAILABLE",
            "Serviço de chamados temporariamente indisponível."
          )
      }
      if (error instanceof Prisma.PrismaClientInitializationError)
        throw new TicketServiceError(
          "UNAVAILABLE",
          "Serviço de chamados temporariamente indisponível."
        )
      throw error
    }
  }

  async function owned(tx: Transaction, employeeId: string, number: string) {
    const ticket = await tx.ticket.findFirst({
      where: { number, openedById: employeeId },
    })
    // Identical response for absent tickets and tickets owned by someone else.
    if (!ticket)
      throw new TicketServiceError("NOT_FOUND", "Chamado não encontrado.")
    return ticket
  }

  async function affected(tx: Transaction, id: string) {
    const user = await tx.user.findUnique({
      where: { id },
      select: { role: true },
    })
    if (user?.role !== "EMPLOYEE")
      throw new TicketServiceError("INVALID_INPUT", "Pessoa afetada inválida.")
  }

  function editable(status: TicketStatus) {
    if (status === "CLOSED" || status === "RESOLVED")
      throw new TicketServiceError(
        "INVALID_STATE",
        "Chamado resolvido ou encerrado não pode ser alterado por esta operação."
      )
  }

  async function related(
    tx: Transaction,
    employeeId: string,
    problem: Problem & { affectedUserId: string }
  ) {
    const recent = new Date(Date.now() - REOPEN_WINDOW_MS)
    const candidates = await tx.ticket.findMany({
      where: {
        openedById: employeeId,
        affectedUserId: problem.affectedUserId,
        type: problem.type,
        category: problem.category,
        OR: [
          {
            status: {
              in: ["OPEN", "IN_PROGRESS", "WAITING_ANALYST", "APPROVED"],
            },
          },
          { status: "RESOLVED", resolvedAt: { gte: recent, lte: new Date() } },
        ],
      },
      orderBy: { updatedAt: "desc" },
    })
    return candidates
      .map((ticket) => ({ ticket, score: problemMatchScore(problem, ticket) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
  }

  return {
    findRelated(
      employeeId: string,
      problem: Problem & { affectedUserId: string }
    ) {
      const data = parse(
        fields.pick({
          title: true,
          description: true,
          type: true,
          category: true,
          affectedUserId: true,
        }),
        {
          title: problem.title,
          description: problem.description,
          type: problem.type,
          category: problem.category,
          affectedUserId: problem.affectedUserId,
        }
      )
      return run(employeeId, (tx) => related(tx, employeeId, data))
    },
    list(employeeId: string, input: TicketFilters = {}) {
      const query = parse(filters, input)
      return run(employeeId, (tx) =>
        tx.ticket.findMany({
          where: { openedById: employeeId, status: query.status },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: query.take,
          skip: query.skip,
        })
      )
    },
    get(employeeId: string, number: string) {
      const reference = parse(text.max(32), number)
      return run(employeeId, async (tx) => {
        const ticket = await owned(tx, employeeId, reference)
        const events = await tx.ticketEvent.findMany({
          where: { ticketId: ticket.id },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
        return { ...ticket, events }
      })
    },
    /** Internal persistence primitive. The caller must enforce draft confirmation (step 11). */
    create(employeeId: string, input: CreateTicketInput) {
      const data = parse(fields, input)
      return run(employeeId, async (tx) => {
        await affected(tx, data.affectedUserId)
        // Serialize creations by the same employee, including across conversations.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${employeeId}))`
        if ((await related(tx, employeeId, data)).length)
          throw new TicketServiceError(
            "CONFLICT",
            "Já existe um chamado para este problema. Consulte-o antes de criar outro."
          )
        const now = new Date()
        return tx.ticket.create({
          data: {
            ...data,
            createdAt: now,
            nextResponseDueAt: responseDueAt(data.priority, now),
            openedById: employeeId,
            number: `${data.type}-${randomUUID().replaceAll("-", "").slice(0, 28)}`,
            events: {
              create: {
                actorId: employeeId,
                action: "CREATED",
                metadata: { ...data, status: "OPEN" },
              },
            },
          },
        })
      })
    },
    /** Updates content/classification only; status and SLA have dedicated lifecycle rules. */
    update(employeeId: string, number: string, input: UpdateTicketInput) {
      const reference = parse(text.max(32), number)
      const data = parse(update, input)
      return run(employeeId, async (tx) => {
        const ticket = await owned(tx, employeeId, reference)
        editable(ticket.status)
        if (data.type && data.type !== ticket.type)
          throw new TicketServiceError(
            "INVALID_INPUT",
            "O tipo do chamado não pode ser alterado após a criação."
          )
        if (data.affectedUserId) await affected(tx, data.affectedUserId)
        const nextResponseDueAt =
          data.priority && data.priority !== ticket.priority
            ? responseDueAt(
                data.priority,
                ticket.lastResponseAt ?? ticket.createdAt
              )
            : ticket.nextResponseDueAt
        return tx.ticket.update({
          where: { id: ticket.id },
          data: {
            ...data,
            nextResponseDueAt,
            events: {
              create: {
                actorId: employeeId,
                action: "UPDATED",
                metadata: data,
              },
            },
          },
        })
      })
    },
    reopen(employeeId: string, number: string, input: CreateTicketInput) {
      const reference = parse(text.max(32), number)
      const data = parse(fields, input)
      return run(employeeId, async (tx) => {
        const ticket = await owned(tx, employeeId, reference)
        const now = new Date()
        if (!canReopen(ticket, now))
          throw new TicketServiceError(
            "INVALID_STATE",
            "Este chamado não pode ser reaberto; o prazo de 7 dias terminou ou o estado mudou."
          )
        if (
          data.type !== ticket.type ||
          data.affectedUserId !== ticket.affectedUserId ||
          data.priority !== ticket.priority
        )
          throw new TicketServiceError(
            "INVALID_INPUT",
            "A reabertura deve manter tipo, pessoa afetada e prioridade do chamado."
          )
        return tx.ticket.update({
          where: { id: ticket.id },
          data: {
            title: data.title,
            description: data.description,
            category: data.category,
            status: "OPEN",
            resolvedAt: null,
            nextResponseDueAt: responseDueAt(ticket.priority, now),
            events: {
              create: {
                actorId: employeeId,
                action: "REOPENED",
                metadata: {
                  previousStatus: ticket.status,
                  resolvedAt: ticket.resolvedAt!.toISOString(),
                },
              },
            },
          },
        })
      })
    },
    transfer(
      employeeId: string,
      number: string,
      input: { reason: string; summary: string }
    ) {
      const reference = parse(text.max(32), number)
      const context = parse(
        z.object({ reason: text, summary: text }).strict(),
        input
      )
      return run(employeeId, async (tx) => {
        const ticket = await owned(tx, employeeId, reference)
        editable(ticket.status)
        if (ticket.status === "WAITING_ANALYST") return ticket
        return tx.ticket.update({
          where: { id: ticket.id },
          data: {
            status: "WAITING_ANALYST",
            events: {
              create: {
                actorId: employeeId,
                action: "TRANSFERRED",
                metadata: { ...context, previousStatus: ticket.status },
              },
            },
          },
        })
      })
    },
  }
}
