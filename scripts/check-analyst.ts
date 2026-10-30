import "dotenv/config"
import { groupAnalystQueue } from "../src/contracts/analyst-queue"
import type { AnalystConversation } from "../src/contracts/analyst"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createPrismaClient } from "../src/lib/prisma"
import { createConversationService } from "../src/services/conversations"
import { createAnalystService } from "../src/services/analyst"
const db = createPrismaClient()
const ids: string[] = []
let calls = 0
const conversations = createConversationService(db, {
  plan: async () => {
    calls++
    return {
      model: "test",
      tool: "handoff",
      plan: { intent: "handoff", confidence: 0.9, reason: "Pedido humano" },
    }
  },
})
const analysts = createAnalystService(db)
async function main() {
  for (const role of ["EMPLOYEE", "ANALYST", "ANALYST"] as const)
    ids.push(
      (
        await db.user.create({
          data: {
            name: `Teste ${role}`,
            email: `${randomUUID()}@nexo.com.br`,
            role,
          },
        })
      ).id
    )
  const [employee, first, second] = ids as [string, string, string]
  const ticket = await db.ticket.create({
    data: {
      number: `INC-${randomUUID().slice(0, 8)}`,
      openedById: employee,
      affectedUserId: employee,
      title: "Falha VPN",
      description: "Sem acesso",
      type: "INC",
      category: "NETWORK_VPN",
      priority: "HIGH",
    },
  })
  const id = randomUUID()
  await conversations.create(employee, { id })
  let state = await conversations.send(employee, id, {
    requestId: randomUUID(),
    content: "Preciso de uma pessoa para a VPN",
    action: { type: "handoff", number: ticket.number },
  })
  assert.equal(state.status, "WAITING_ANALYST")
  let detail = await analysts.detail(first, id)
  assert.match(detail.handoff!.summary!, /Preciso de uma pessoa/)
  assert.equal(detail.handoff?.number, ticket.number)
  await assert.rejects(analysts.list(employee), { status: 403 })
  const otherThread = randomUUID()
  await conversations.create(employee, { id: otherThread })
  const queue = JSON.parse(
    JSON.stringify(await analysts.list(first))
  ) as AnalystConversation[]
  const contacts = groupAnalystQueue(queue, first).filter(
    (c) => c.employee.id === employee
  )
  assert.equal(contacts.length, 1, "A user with two sessions must appear once")
  assert.equal(contacts[0]!.threads.length, 2)
  assert.equal(
    contacts[0]!.id,
    id,
    "A waiting session must not be hidden by a newer agent session"
  )
  assert.equal(
    contacts[0]!.activity.unreadCount,
    queue
      .filter((c) => c.employee.id === employee)
      .reduce((n, c) => n + c.activity.unreadCount, 0)
  )
  assert.equal(
    groupAnalystQueue(queue, first, "agent").find(
      (c) => c.employee.id === employee
    )!.id,
    otherThread
  )
  assert.equal(
    groupAnalystQueue(queue, first, "waiting", ticket.number).filter(
      (c) => c.employee.id === employee
    ).length,
    1
  )
  assert.equal(
    groupAnalystQueue(queue, first, "mine").filter(
      (c) => c.employee.id === employee
    ).length,
    0
  )
  const race = await Promise.allSettled(
    [first, second].map((user) =>
      analysts.act(user, id, {
        action: "claim",
        requestId: randomUUID(),
        revision: detail.revision,
      })
    )
  )
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1)
  detail = await analysts.detail(first, id)
  const owner = detail.assignedAnalystId!
  const other = owner === first ? second : first
  for (const action of ["reply", "return", "close"])
    await assert.rejects(
      analysts.act(other, id, {
        action,
        content: "Intruso",
        requestId: randomUUID(),
        revision: detail.revision,
      }),
      { status: 403 }
    )
  const before = calls
  state = await conversations.send(employee, id, {
    requestId: randomUUID(),
    content: "Ainda preciso de ajuda",
  })
  assert.equal(calls, before)
  assert.equal(state.messages.at(-1)?.author, "EMPLOYEE")
  await assert.rejects(
    analysts.act(owner, id, {
      action: "reply",
      content: "Resposta antiga",
      requestId: randomUUID(),
      revision: detail.revision,
    }),
    { status: 409 }
  )
  detail = await analysts.detail(owner, id)
  const input = {
    action: "reply",
    content: "Vou verificar sua VPN.",
    requestId: randomUUID(),
    revision: detail.revision,
  }
  detail = await analysts.act(owner, id, input)
  await analysts.act(owner, id, input)
  assert.equal(
    await db.message.count({ where: { requestId: input.requestId } }),
    1
  )
  assert.equal(
    (await conversations.snapshot(employee, id)).messages.at(-1)?.author,
    "ANALYST"
  )
  assert.ok(
    (await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
      .nextResponseDueAt
  )
  detail = await analysts.detail(owner, id)
  detail = await analysts.act(owner, id, {
    action: "return",
    requestId: randomUUID(),
    revision: detail.revision,
  })
  assert.equal(detail.status, "AGENT_ACTIVE")
  await conversations.send(employee, id, {
    content: "Quero falar novamente",
    requestId: randomUUID(),
  })
  assert.equal(calls, before + 1)
  detail = await analysts.detail(owner, id)
  detail = await analysts.act(owner, id, {
    action: "claim",
    requestId: randomUUID(),
    revision: detail.revision,
  })
  detail = await analysts.act(owner, id, {
    action: "close",
    resolveTicket: true,
    requestId: randomUUID(),
    revision: detail.revision,
  })
  assert.equal(detail.status, "CLOSED")
  assert.equal(detail.tickets[0]?.status, "RESOLVED")
  await assert.rejects(
    conversations.send(employee, id, {
      content: "Mais uma",
      requestId: randomUUID(),
    })
  )
  for (const reason of ["CRITICAL", "OVERDUE", "UNCERTAIN"] as const) {
    const cid = randomUUID()
    await conversations.create(employee, { id: cid })
    await db.ticket.update({
      where: { id: ticket.id },
      data: {
        status: "OPEN",
        priority: reason === "CRITICAL" ? "CRITICAL" : "HIGH",
        nextResponseDueAt: reason === "OVERDUE" ? new Date(0) : null,
      },
    })
    const service =
      reason === "UNCERTAIN"
        ? createConversationService(db, {
            plan: async () => ({
              model: "test",
              tool: "help",
              plan: {
                intent: "help",
                query: "vpn",
                confidence: 0.2,
                reason: "Ambíguo",
              },
            }),
          })
        : conversations
    state = await service.send(employee, cid, {
      requestId: randomUUID(),
      content: "Preciso de ajuda",
      ...(reason !== "UNCERTAIN"
        ? { action: { type: "ticket", number: ticket.number } }
        : {}),
    })
    assert.equal(state.status, "WAITING_ANALYST", reason)
    assert.equal((await analysts.detail(first, cid)).handoff?.reason, reason)
  }
  // A model answer started before a handoff must never overwrite human state.
  const racingId = randomUUID()
  await conversations.create(employee, { id: racingId })
  let release!: () => void
  let entered!: () => void
  const ready = new Promise<void>((resolve) => {
    entered = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const delayed = createConversationService(db, {
    plan: async () => {
      entered()
      await gate
      return {
        model: "test",
        tool: "help",
        plan: {
          intent: "help",
          query: "vpn",
          confidence: 0.9,
          reason: "Consulta",
        },
      }
    },
  })
  const pending = delayed.send(employee, racingId, {
    requestId: randomUUID(),
    content: "Uma pergunta",
  })
  const rejected = assert.rejects(pending, { status: 409 })
  await ready
  await conversations.send(employee, racingId, {
    requestId: randomUUID(),
    content: "Prefiro uma pessoa",
    action: { type: "handoff" },
  })
  release()
  await rejected
  assert.equal(
    (await analysts.detail(first, racingId)).status,
    "WAITING_ANALYST"
  )
  console.log(
    "Transferências, contexto, pausa, concorrência, permissões, resposta, SLA, devolução e encerramento: OK"
  )
}
main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.conversation.deleteMany({ where: { employeeId: { in: ids } } })
    await db.ticket.deleteMany({ where: { openedById: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
    await db.$disconnect()
  })
