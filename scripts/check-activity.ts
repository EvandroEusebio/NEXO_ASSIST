import "dotenv/config"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createPrismaClient } from "../src/lib/prisma"
import { createAuthService } from "../src/services/auth"
import { createConversationService } from "../src/services/conversations"
import { createAnalystService } from "../src/services/analyst"
import {
  conversationActivity,
  createActivityService,
  PRESENCE_TTL_MS,
  TYPING_TTL_MS,
} from "../src/services/activity"
const db = createPrismaClient()
const users: string[] = []
let at = new Date()
const activity = createActivityService(db, () => at)
const auth = createAuthService(db)
const conversations = createConversationService(db)
const analysts = createAnalystService(db)
const sessions: string[] = []
const tabs = [randomUUID(), randomUUID(), randomUUID()]
async function main() {
  for (const role of ["EMPLOYEE", "EMPLOYEE", "ANALYST", "ANALYST"] as const) {
    const user = await db.user.create({
      data: {
        name: "Teste atividade",
        email: `activity-${randomUUID()}@nexo.com.br`,
        role,
        demoLoginEnabled: true,
      },
    })
    users.push(user.id)
    sessions.push(
      (await auth.login({ email: user.email, password: "demo" })).token
    )
  }
  const [employee, other, analyst, second] = users as [
    string,
    string,
    string,
    string,
  ]
  const cid = randomUUID()
  await conversations.create(employee, { id: cid })
  const sent = await conversations.send(employee, cid, {
    content: "Preciso de um analista",
    requestId: randomUUID(),
    action: { type: "handoff" },
  })
  const message = sent.messages.find((m) => m.author === "EMPLOYEE")!
  const signal = async (
    viewer = analyst,
    role: "EMPLOYEE" | "ANALYST" = "ANALYST"
  ) => {
    const c = await db.conversation.findUniqueOrThrow({ where: { id: cid } })
    return (await conversationActivity(db, viewer, role, [c], at)).get(cid)!
  }
  const pulse = (
    index: number,
    sequence: number,
    overrides: Record<string, unknown> = {}
  ) =>
    activity.heartbeat(sessions[index], {
      tabId: tabs[index % 3],
      sequence,
      active: true,
      typing: false,
      conversationId: cid,
      ...overrides,
    })
  assert.equal((await signal()).unreadCount, 1)
  assert.equal((await signal()).employee.online, false)
  await pulse(0, 1, { typing: true })
  assert.equal((await signal()).employee.online, true)
  assert.equal((await signal()).employee.typing, true)
  await assert.rejects(pulse(1, 1), { status: 404 })
  await assert.rejects(pulse(2, 1, { typing: true }), { status: 403 })
  await assert.rejects(activity.heartbeat(undefined, {}), { status: 401 })
  // Typing expires sooner than online presence, even after a disconnected client.
  at = new Date(at.getTime() + TYPING_TTL_MS + 1)
  assert.equal((await signal()).employee.typing, false)
  assert.equal((await signal()).employee.online, true)
  await pulse(0, 3, { typing: false })
  await pulse(0, 2, { typing: true })
  assert.equal(
    (await signal()).employee.typing,
    false,
    "Delayed request must not restore typing"
  )
  await pulse(0, 4, { tabId: tabs[1] })
  await pulse(0, 5, { active: false })
  assert.equal(
    (await signal()).employee.online,
    true,
    "Another tab is still active"
  )
  at = new Date(at.getTime() + PRESENCE_TTL_MS + 1)
  assert.equal((await signal()).employee.online, false)
  const revision = (
    await db.conversation.findUniqueOrThrow({ where: { id: cid } })
  ).revision
  await pulse(2, 2, { readThrough: message.id })
  assert.equal((await signal()).unreadCount, 0)
  assert.equal(
    (await signal(second)).unreadCount,
    1,
    "Readers have independent counts"
  )
  assert.equal(
    (await db.conversation.findUniqueOrThrow({ where: { id: cid } })).revision,
    revision,
    "Presence/read receipts must not invalidate model proposals"
  )
  // New incoming message between the fetch and its read acknowledgement must stay unread.
  const next = await conversations.send(employee, cid, {
    content: "Outra informação",
    requestId: randomUUID(),
  })
  const latest = next.messages.at(-1)!
  await pulse(2, 3, { readThrough: message.id })
  assert.equal((await signal()).unreadCount, 1)
  await pulse(2, 4, { readThrough: latest.id })
  await pulse(2, 5, { readThrough: message.id })
  assert.equal((await signal()).unreadCount, 0)
  assert.equal((await signal()).analystRead?.messageId, latest.id)
  const otherConversation = await conversations.create(other, {
    id: randomUUID(),
  })
  await assert.rejects(
    pulse(2, 6, { readThrough: otherConversation.messages[0]!.id }),
    { status: 400 }
  )
  let detail = await analysts.detail(analyst, cid)
  detail = await analysts.act(analyst, cid, {
    action: "claim",
    requestId: randomUUID(),
    revision: detail.revision,
  })
  await pulse(2, 7, { typing: true })
  assert.equal((await signal(employee, "EMPLOYEE")).analyst.typing, true)
  await assert.rejects(pulse(3, 1, { typing: true }), { status: 403 })
  detail = await analysts.act(analyst, cid, {
    action: "reply",
    content: "Vou verificar",
    requestId: randomUUID(),
    revision: detail.revision,
  })
  assert.equal((await signal(employee, "EMPLOYEE")).unreadCount, 1)
  await pulse(0, 6, { readThrough: detail.messages.at(-1)!.id })
  assert.equal((await signal(employee, "EMPLOYEE")).unreadCount, 0)
  assert.equal(
    (await signal()).employeeRead?.messageId,
    detail.messages.at(-1)!.id
  )
  detail = await analysts.act(analyst, cid, {
    action: "return",
    requestId: randomUUID(),
    revision: detail.revision,
  })
  assert.equal((await signal(employee, "EMPLOYEE")).analyst.typing, false)
  await auth.logout(sessions[0])
  assert.equal(
    (await signal()).employee.online,
    false,
    "Logout revokes all leases in the session"
  )
  await assert.rejects(pulse(0, 7), { status: 401 })
  // Persisted read marker survives a new DB connection/reload.
  const reconnected = createPrismaClient()
  try {
    assert.equal(
      (
        await reconnected.conversationReadState.findUniqueOrThrow({
          where: {
            conversationId_userId: { conversationId: cid, userId: analyst },
          },
        })
      ).lastReadMessageId,
      latest.id
    )
  } finally {
    await reconnected.$disconnect()
  }
  console.log(
    "Atividade: isolamento, presença, expiração, múltiplas abas, digitação, leitura individual, concorrência, persistência e logout: OK"
  )
}
try {
  await main()
} finally {
  if (users.length) {
    await db.conversation.deleteMany({ where: { employeeId: { in: users } } })
    await db.user.deleteMany({ where: { id: { in: users } } })
  }
  await db.$disconnect()
}
