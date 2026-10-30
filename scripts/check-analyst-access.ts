import "dotenv/config"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createPrismaClient } from "../src/lib/prisma"
import { hashPassword } from "../src/lib/password"
import { createAuthService } from "../src/services/auth"
import { createAnalystService } from "../src/services/analyst"
import { createConversationService } from "../src/services/conversations"
import { createActivityService } from "../src/services/activity"
import { groupAnalystQueue } from "../src/contracts/analyst-queue"
import type { AnalystConversation } from "../src/contracts/analyst"
const db = createPrismaClient(),
  auth = createAuthService(db),
  analysts = createAnalystService(db),
  chat = createConversationService(db),
  activity = createActivityService(db)
const users: string[] = [],
  tokens = new Map<string, string>(),
  sequences = new Map<string, number>(),
  tabs = new Map<string, string>()
async function send(employee: string, cid: string, content: string) {
  return chat.send(employee, cid, { content, requestId: randomUUID() })
}
async function pending(employee: string, content: string, number?: string) {
  const cid = randomUUID()
  await chat.create(employee, { id: cid })
  await chat.send(employee, cid, {
    requestId: randomUUID(),
    content,
    action: { type: "handoff", ...(number ? { number } : {}) },
  })
  return cid
}
async function pulse(user: string, cid: string, messageId?: string) {
  const sequence = (sequences.get(user) ?? 0) + 1
  sequences.set(user, sequence)
  return activity.heartbeat(tokens.get(user), {
    tabId: tabs.get(user),
    sequence,
    conversationId: cid,
    active: true,
    typing: false,
    ...(messageId ? { readThrough: messageId } : {}),
  })
}
async function count(user: string, cid: string) {
  return (await analysts.list(user)).find((c) => c.id === cid)!.activity
    .unreadCount
}
async function action(
  user: string,
  cid: string,
  type: "claim" | "close" | "transfer",
  toAnalystId?: string
) {
  const revision = (
    await db.conversation.findUniqueOrThrow({ where: { id: cid } })
  ).revision
  return analysts.act(user, cid, {
    action: type,
    requestId: randomUUID(),
    revision,
    ...(toAnalystId ? { toAnalystId } : {}),
  })
}
async function main() {
  for (const role of ["EMPLOYEE", "ANALYST", "ANALYST", "ANALYST"] as const) {
    const user = await db.user.create({
      data: {
        name: `Teste acesso ${users.length}`,
        email: `access-${randomUUID()}@nexo.com.br`,
        role,
        demoLoginEnabled: true,
        passwordHash: await hashPassword("Access-check-password-2026!"),
      },
    })
    users.push(user.id)
    tokens.set(
      user.id,
      (
        await auth.login({
          email: user.email,
          password: "Access-check-password-2026!",
        })
      ).token
    )
    tabs.set(user.id, randomUUID())
  }
  const [employee, first, second, third] = users as [
    string,
    string,
    string,
    string,
  ]
  const secret = `PRIVATE-${randomUUID()}`
  const ticket = await db.ticket.create({
    data: {
      number: `INC-${randomUUID().slice(0, 8)}`,
      openedById: employee,
      affectedUserId: employee,
      type: "INC",
      category: "HARDWARE",
      priority: "MEDIUM",
      title: secret,
      description: secret,
    },
  })
  const cid = await pending(employee, secret, ticket.number)
  await db.ticketDraft.create({
    data: {
      conversationId: cid,
      operation: "CREATE",
      payload: { title: secret, description: secret },
    },
  })
  for (const id of [first, second, third]) {
    const preview = (await analysts.list(id)).find((c) => c.id === cid)!
    assert.deepEqual(preview.messages, [])
    assert.deepEqual(preview.drafts, [])
    assert.equal(preview.activity.unreadCount, 0)
    const detail = await analysts.detail(id, cid)
    assert.equal(detail.canReadMessages, false)
    assert.deepEqual(detail.messages, [])
    assert.deepEqual(detail.drafts, [])
    assert.deepEqual(detail.tickets, [])
    assert.equal(detail.handoff, null)
    assert.equal(JSON.stringify(detail).includes(secret), false)
    await assert.rejects(pulse(id, cid), { status: 403 })
  }
  const revision = (await analysts.detail(first, cid)).revision
  const race = await Promise.allSettled(
    [first, second].map((id) =>
      analysts.act(id, cid, {
        action: "claim",
        requestId: randomUUID(),
        revision,
      })
    )
  )
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1)
  let owner = (await db.conversation.findUniqueOrThrow({ where: { id: cid } }))
    .assignedAnalystId!
  let other = owner === first ? second : first
  assert.equal(
    (await analysts.detail(owner, cid)).messages.some((m) =>
      m.content.includes(secret)
    ),
    true
  )
  assert.equal(
    await count(owner, cid),
    0,
    "Old messages must not become unread on claim"
  )
  await assert.rejects(analysts.detail(other, cid), { status: 403 })
  const firstIncoming = await send(employee, cid, "Mensagem após atribuição")
  const firstMessage = firstIncoming.messages.at(-1)!
  assert.equal(await count(owner, cid), 1)
  assert.equal(await count(other, cid), 0)
  await assert.rejects(pulse(other, cid, firstMessage.id), { status: 403 })
  const beforeRead = (
    await db.conversation.findUniqueOrThrow({ where: { id: cid } })
  ).revision
  await pulse(owner, cid, firstMessage.id)
  assert.equal(await count(owner, cid), 0)
  assert.equal(
    (await db.conversation.findUniqueOrThrow({ where: { id: cid } })).revision,
    beforeRead
  )
  const nextIncoming = await send(
    employee,
    cid,
    "Mensagem concorrente com confirmação antiga"
  )
  const nextMessage = nextIncoming.messages.at(-1)!
  await pulse(owner, cid, firstMessage.id)
  assert.equal(await count(owner, cid), 1)
  await pulse(owner, cid, nextMessage.id)
  assert.equal(await count(owner, cid), 0)
  const reply = {
    action: "reply",
    requestId: randomUUID(),
    revision: (await analysts.detail(owner, cid)).revision,
    content: "Resposta privada do responsável",
  }
  await analysts.act(owner, cid, reply)
  const previous = await pending(employee, "Outro atendimento da mesma pessoa")
  await action(owner, previous, "claim")
  for (let i = 0; i < 3; i++)
    await send(employee, previous, `Não lida do outro atendimento ${i}`)
  await send(employee, cid, "Não lida do atendimento apresentado")
  const queue = JSON.parse(
    JSON.stringify(await analysts.list(owner))
  ) as AnalystConversation[]
  assert.equal(
    groupAnalystQueue(queue, owner, "all", "", cid).find(
      (c) => c.employee.id === employee
    )!.activity.unreadCount,
    1,
    "Do not sum different sessions of the same person"
  )
  assert.equal(
    groupAnalystQueue(queue, owner, "all", "", previous).find(
      (c) => c.employee.id === employee
    )!.activity.unreadCount,
    3
  )
  await action(owner, previous, "close")
  assert.equal(await count(owner, previous), 0, "Closed sessions do not count")
  const transfer = await action(owner, cid, "transfer", other)
  const assignedEvent = await db.ticketEvent.findFirstOrThrow({
    where: { ticketId: ticket.id, action: "ASSIGNED" },
    orderBy: { createdAt: "desc" },
  })
  assert.equal(
    (assignedEvent.metadata as { toAnalystId?: string }).toAnalystId,
    other
  )
  assert.equal(transfer.canReadMessages, false)
  assert.deepEqual(transfer.messages, [])
  assert.equal(await count(owner, cid), 0)
  assert.equal(
    await count(other, cid),
    0,
    "The recipient must not inherit unread history"
  )
  await assert.rejects(analysts.detail(owner, cid), { status: 403 })
  await assert.rejects(pulse(owner, cid, nextMessage.id), { status: 403 })
  const afterTransferRevision = (
    await db.conversation.findUniqueOrThrow({ where: { id: cid } })
  ).revision
  await assert.rejects(analysts.act(owner, cid, reply), { status: 403 })
  assert.equal(
    (await db.conversation.findUniqueOrThrow({ where: { id: cid } })).revision,
    afterTransferRevision,
    "A replay by a former owner must not change revision"
  )
  assert.equal(
    (await analysts.detail(other, cid)).messages.some((m) =>
      m.content.includes(secret)
    ),
    true
  )
  const recipientMessage = (
    await send(employee, cid, "Recebida apenas pelo novo responsável")
  ).messages.at(-1)!
  assert.equal(await count(other, cid), 1)
  assert.equal(await count(owner, cid), 0)
  await assert.rejects(action(other, cid, "transfer", employee), {
    status: 400,
  })
  await assert.rejects(action(other, cid, "transfer", other), { status: 400 })
  await action(other, cid, "transfer", owner)
  assert.equal(
    await count(owner, cid),
    0,
    "Returning ownership must reset the assignment boundary too"
  )
  await send(
    employee,
    cid,
    "Nova mensagem depois da devolução de responsabilidade"
  )
  assert.equal(await count(owner, cid), 1)
  assert.equal(await count(other, cid), 0)
  // A late read acknowledgement and a transfer serialize on the same conversation row.
  const current = (await analysts.detail(owner, cid)).revision
  const raceTransfer = await Promise.allSettled([
    analysts.act(owner, cid, {
      action: "transfer",
      toAnalystId: third,
      requestId: randomUUID(),
      revision: current,
    }),
    pulse(owner, cid, recipientMessage.id),
  ])
  assert.equal(raceTransfer[0]!.status, "fulfilled")
  assert.equal(await count(third, cid), 0)
  await assert.rejects(pulse(owner, cid, recipientMessage.id), { status: 403 })
  const newMessage = (
    await send(employee, cid, "Mensagem só para o terceiro analista")
  ).messages.at(-1)!
  assert.equal(await count(third, cid), 1)
  if (process.argv.includes("--http")) {
    const base = process.env.ANALYST_CHECK_URL ?? "http://localhost:3101"
    const request = (user: string, path: string, body?: unknown) =>
      fetch(new URL(path, base), {
        method: body ? "POST" : "GET",
        headers: {
          Cookie: `nexo_session=${tokens.get(user)}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    assert.equal(
      (await request(third, `/api/analyst/conversations/${cid}`)).status,
      200
    )
    assert.equal(
      (await request(owner, `/api/analyst/conversations/${cid}`)).status,
      403
    )
    const hidden = (
      await (await request(owner, "/api/analyst/conversations")).json()
    ).find((c: { id: string }) => c.id === cid)
    assert.deepEqual(hidden.messages, [])
    assert.equal(hidden.activity.unreadCount, 0)
    assert.equal(JSON.stringify(hidden).includes(secret), false)
    assert.equal(
      (
        await request(owner, "/api/activity", {
          tabId: randomUUID(),
          sequence: 1,
          conversationId: cid,
          active: true,
          typing: false,
          readThrough: newMessage.id,
        })
      ).status,
      403
    )
    assert.equal(
      (
        await request(owner, `/api/analyst/conversations/${cid}`, {
          action: "reply",
          requestId: randomUUID(),
          revision: (await analysts.detail(third, cid)).revision,
          content: "Tentativa de acesso",
        })
      ).status,
      403
    )
    const waiting = await pending(employee, `PENDING-${secret}`)
    const pendingDetail = await request(
      owner,
      `/api/analyst/conversations/${waiting}`
    )
    assert.equal(pendingDetail.status, 200)
    const body = await pendingDetail.json()
    assert.deepEqual(body.messages, [])
    assert.equal(JSON.stringify(body).includes(secret), false)
    const response = await request(third, "/api/activity", {
      tabId: randomUUID(),
      sequence: 1,
      conversationId: cid,
      active: true,
      typing: false,
      readThrough: newMessage.id,
    })
    assert.equal(response.status, 200)
    assert.equal(await count(third, cid), 0)
    await action(third, waiting, "claim")
    await action(third, waiting, "close")
  }
  await action(third, cid, "close")
  assert.equal(await count(third, cid), 0)
  await assert.rejects(analysts.detail(owner, cid), { status: 403 })
  const closed = await analysts.detail(third, cid)
  const started = await analysts.start(third, cid, {
    action: "start",
    requestId: randomUUID(),
    revision: closed.revision,
  })
  assert.equal(started.canReadMessages, true)
  assert.equal(await count(third, started.id), 0)
  await send(employee, started.id, "Mensagem do novo atendimento")
  assert.equal(await count(third, started.id), 1)
  assert.equal(await count(third, cid), 0)
  console.log(
    "Acesso exclusivo, fila sem conteúdo, disputa de atribuição, contadores por atendimento, leitura, transferência, revogação e encerramento: OK"
  )
}
main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.conversation.deleteMany({ where: { employeeId: { in: users } } })
    await db.ticket.deleteMany({ where: { openedById: { in: users } } })
    await db.user.deleteMany({ where: { id: { in: users } } })
    await db.$disconnect()
  })
