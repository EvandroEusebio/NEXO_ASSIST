import { canReadAnalystMessages } from "./analyst-access"
import { createHash } from "node:crypto"
import { z } from "zod"
import { Prisma, type PrismaClient } from "../generated/prisma/client"
import type { ConversationActivity, ReadCursor } from "../contracts/activity"

export const PRESENCE_TTL_MS = 90_000
export const TYPING_TTL_MS = 6_000
export class ActivityError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = "ActivityError"
  }
}
const heartbeat = z
  .object({
    tabId: z.uuid(),
    sequence: z.number().int().min(1).max(2_147_483_647),
    conversationId: z.uuid().nullable(),
    active: z.boolean(),
    typing: z.boolean(),
    readThrough: z.uuid().optional(),
  })
  .strict()

export function createActivityService(
  db: PrismaClient,
  now = () => new Date()
) {
  return {
    async heartbeat(token: string | undefined, input: unknown) {
      if (!token || !/^[a-f0-9]{64}$/.test(token))
        throw new ActivityError(401, "Entre novamente.")
      const parsed = heartbeat.safeParse(input)
      if (!parsed.success) throw new ActivityError(400, "Atividade inválida.")
      const data = parsed.data
      if (
        (data.typing || data.readThrough) &&
        (!data.active || !data.conversationId)
      )
        throw new ActivityError(400, "Selecione uma conversa ativa.")
      const tokenHash = createHash("sha256").update(token).digest("hex")
      const at = now()
      await db.$transaction(async (tx) => {
        const session = await tx.authSession.findUnique({
          where: { tokenHash },
          include: { user: true },
        })
        if (
          !session ||
          session.expiresAt <= at ||
          !session.user.demoLoginEnabled
        )
          throw new ActivityError(401, "Entre novamente.")
        const user = session.user
        if (data.conversationId) {
          if (user.role === "ANALYST")
            await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${data.conversationId}::uuid FOR UPDATE`
          const conversation = await tx.conversation.findUnique({
            where: { id: data.conversationId },
          })
          if (
            !conversation ||
            (user.role === "EMPLOYEE" && conversation.employeeId !== user.id)
          )
            throw new ActivityError(404, "Conversa não encontrada.")
          if (
            user.role === "ANALYST" &&
            !canReadAnalystMessages(conversation, user.id)
          )
            throw new ActivityError(
              403,
              "Este atendimento pertence a outro analista."
            )
          if (
            data.typing &&
            (conversation.status === "CLOSED" ||
              (user.role === "ANALYST" &&
                (conversation.status !== "ANALYST_ACTIVE" ||
                  conversation.assignedAnalystId !== user.id)))
          )
            throw new ActivityError(403, "Não pode responder nesta conversa.")
        }
        // A late request from this tab cannot reactivate typing after its stop event.
        const changed = await tx.$executeRaw`
          INSERT INTO "PresenceLease" ("sessionTokenHash", "tabId", "sequence", "conversationId", "expiresAt", "typingUntil")
          VALUES (${tokenHash}, ${data.tabId}::uuid, ${data.sequence}, ${data.conversationId}::uuid,
            ${data.active ? new Date(at.getTime() + PRESENCE_TTL_MS) : at}, ${data.typing ? new Date(at.getTime() + TYPING_TTL_MS) : null})
          ON CONFLICT ("sessionTokenHash", "tabId") DO UPDATE SET
            "sequence" = EXCLUDED."sequence", "conversationId" = EXCLUDED."conversationId",
            "expiresAt" = EXCLUDED."expiresAt", "typingUntil" = EXCLUDED."typingUntil"
          WHERE "PresenceLease"."sequence" < EXCLUDED."sequence"`
        if (changed && data.readThrough && data.conversationId) {
          const message = await tx.message.findFirst({
            where: {
              id: data.readThrough,
              conversationId: data.conversationId,
            },
            select: { id: true, createdAt: true },
          })
          if (!message)
            throw new ActivityError(400, "Mensagem não pertence à conversa.")
          // Tuple order matches the history. Concurrent older receipts never move backwards.
          await tx.$executeRaw`
            INSERT INTO "ConversationReadState" ("conversationId", "userId", "lastReadAt", "lastReadMessageId")
            VALUES (${data.conversationId}::uuid, ${user.id}::uuid, ${message.createdAt}, ${message.id}::uuid)
            ON CONFLICT ("conversationId", "userId") DO UPDATE SET
              "lastReadAt" = EXCLUDED."lastReadAt", "lastReadMessageId" = EXCLUDED."lastReadMessageId"
            WHERE ("ConversationReadState"."lastReadAt", "ConversationReadState"."lastReadMessageId") < (EXCLUDED."lastReadAt", EXCLUDED."lastReadMessageId")`
        }
        await tx.presenceLease.deleteMany({
          where: { expiresAt: { lt: new Date(at.getTime() - 86_400_000) } },
        })
      })
      return { ok: true }
    },
  }
}

type Conversation = {
  id: string
  employeeId: string
  assignedAnalystId: string | null
  status: string
}
/** Call only after the parent service authorizes access to these conversations. */
export async function conversationActivity(
  db: Prisma.TransactionClient,
  viewerId: string,
  role: "EMPLOYEE" | "ANALYST",
  conversations: Conversation[],
  at = new Date()
) {
  const result = new Map<string, ConversationActivity>()
  if (!conversations.length) return result
  const ids = conversations.map((c) => c.id)
  const userIds = [
    ...new Set(
      conversations.flatMap((c) => [
        c.employeeId,
        ...(c.assignedAnalystId ? [c.assignedAnalystId] : []),
      ])
    ),
  ]
  const leases = await db.presenceLease.findMany({
    where: {
      expiresAt: { gt: at },
      session: {
        expiresAt: { gt: at },
        userId: { in: userIds },
        user: { demoLoginEnabled: true },
      },
    },
    select: {
      conversationId: true,
      typingUntil: true,
      session: { select: { userId: true } },
    },
  })
  const reads = await db.conversationReadState.findMany({
    where: { conversationId: { in: ids } },
    include: { user: { select: { role: true } } },
    orderBy: [{ lastReadAt: "asc" }, { lastReadMessageId: "asc" }],
  })
  const assignmentJoin =
    role === "ANALYST"
      ? Prisma.sql`
    LEFT JOIN LATERAL (
      SELECT a."createdAt", a."id", a."authorUserId", a."metadata"
      FROM "Message" a WHERE a."conversationId" = c."id"
        AND a."metadata"->>'kind' = 'analyst-action'
        AND a."metadata"->>'action' IN ('claim', 'transfer', 'start')
      ORDER BY a."createdAt" DESC, a."id" DESC LIMIT 1
    ) assignment ON TRUE`
      : Prisma.empty
  const incoming =
    role === "ANALYST"
      ? Prisma.sql`
    m."author" = 'EMPLOYEE' AND c."status" = 'ANALYST_ACTIVE' AND c."assignedAnalystId" = ${viewerId}::uuid
    AND COALESCE(assignment."metadata"->>'toAnalystId', assignment."authorUserId"::text) = ${viewerId}
    AND (m."createdAt", m."id") > (assignment."createdAt", assignment."id")`
      : Prisma.sql`m."author" IN ('AGENT', 'ANALYST')`
  const counts = await db.$queryRaw<
    { conversationId: string; count: number }[]
  >(Prisma.sql`
    SELECT m."conversationId", COUNT(*)::int AS count FROM "Message" m
    JOIN "Conversation" c ON c.id = m."conversationId"
    ${assignmentJoin}
    LEFT JOIN "ConversationReadState" r ON r."conversationId" = m."conversationId" AND r."userId" = ${viewerId}::uuid
    WHERE m."conversationId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) AND ${incoming}
      AND (r."userId" IS NULL OR (m."createdAt", m."id") > (r."lastReadAt", r."lastReadMessageId"))
    GROUP BY m."conversationId"`)
  for (const c of conversations) {
    const status = (userId: string | null, allowed: boolean) => ({
      online: !!userId && leases.some((l) => l.session.userId === userId),
      typing:
        allowed &&
        !!userId &&
        leases.some(
          (l) =>
            l.session.userId === userId &&
            l.conversationId === c.id &&
            l.typingUntil &&
            l.typingUntil > at
        ),
    })
    const cursor = (
      reader: (typeof reads)[number] | undefined
    ): ReadCursor | null =>
      reader
        ? {
            at: reader.lastReadAt.toISOString(),
            messageId: reader.lastReadMessageId,
          }
        : null
    const ownReads = reads.filter((r) => r.conversationId === c.id)
    const canRead = role === "EMPLOYEE" || canReadAnalystMessages(c, viewerId)
    result.set(c.id, {
      employee: status(c.employeeId, canRead && c.status !== "CLOSED"),
      analyst: status(c.assignedAnalystId, c.status === "ANALYST_ACTIVE"),
      unreadCount:
        counts.find((count) => count.conversationId === c.id)?.count ?? 0,
      employeeRead: canRead
        ? cursor(ownReads.find((r) => r.userId === c.employeeId))
        : null,
      analystRead: canRead
        ? cursor(
            role === "EMPLOYEE"
              ? ownReads.filter((r) => r.user.role === "ANALYST").at(-1)
              : ownReads.find((r) => r.userId === viewerId)
          )
        : null,
    })
  }
  return result
}
