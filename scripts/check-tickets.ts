import "dotenv/config"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"
import {
  createTicketService,
  TicketServiceError,
  type TicketErrorCode,
} from "../src/services/tickets"

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required")
const makeClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 1,
    }),
  })
let db = makeClient()
const ids: string[] = []
const service = createTicketService(db)
async function fails(code: TicketErrorCode, action: () => unknown) {
  await assert.rejects(
    async () => action(),
    (error: unknown) =>
      error instanceof TicketServiceError && error.code === code
  )
}
try {
  for (const role of ["EMPLOYEE", "EMPLOYEE", "ANALYST"] as const) {
    const user = await db.user.create({
      data: {
        name: "Ticket service test",
        email: `${randomUUID()}@example.invalid`,
        role,
      },
    })
    ids.push(user.id)
  }
  const [alice, bob, analyst] = ids as [string, string, string]
  const input = {
    title: "  VPN indisponível  ",
    description: "Não consigo ligar à VPN.",
    type: "INC" as const,
    category: "NETWORK_VPN" as const,
    priority: "HIGH" as const,
    affectedUserId: bob,
  }
  const ticket = await service.create(alice, input)
  assert.equal(ticket.title, "VPN indisponível")
  assert.equal(ticket.status, "OPEN")
  assert.equal((await service.list(alice)).length, 1)
  assert.equal((await service.list(bob)).length, 0) // affected person is not the owner
  await fails("NOT_FOUND", () => service.get(bob, ticket.number))
  await fails("NOT_FOUND", () =>
    service.update(bob, ticket.number, { title: "Intrusão" })
  )
  await fails("NOT_FOUND", () =>
    service.transfer(bob, ticket.number, {
      reason: "Pedido",
      summary: "Contexto",
    })
  )
  await fails("NOT_FOUND", () => service.get(alice, "INC-inexistente"))
  await fails("FORBIDDEN", () => service.list(analyst))
  await fails("INVALID_INPUT", () =>
    service.create(alice, { ...input, title: " " })
  )
  await fails("INVALID_INPUT", () =>
    service.create(alice, { ...input, affectedUserId: analyst })
  )
  await fails("INVALID_INPUT", () =>
    service.create(alice, { ...input, affectedUserId: randomUUID() })
  )
  await fails("INVALID_INPUT", () => service.update(alice, ticket.number, {}))
  await fails("INVALID_INPUT", () =>
    service.update(alice, ticket.number, { status: "CLOSED" } as never)
  )
  await fails("INVALID_INPUT", () =>
    service.update(alice, ticket.number, { type: "REQ" })
  )
  await fails("INVALID_INPUT", () => service.list(alice, { take: 101 }))
  const edited = await service.update(alice, ticket.number, {
    description: "Erro 619 ao ligar à VPN.",
  })
  assert.equal(edited.description, "Erro 619 ao ligar à VPN.")
  const handoff = {
    reason: "Pedido explícito",
    summary: "VPN continua indisponível após reinício.",
  }
  assert.equal(
    (await service.transfer(alice, ticket.number, handoff)).status,
    "WAITING_ANALYST"
  )
  await service.transfer(alice, ticket.number, handoff)
  assert.equal((await service.list(alice, { status: "OPEN" })).length, 0)
  assert.equal(
    (await service.list(alice, { status: "WAITING_ANALYST" })).length,
    1
  )
  const detail = await service.get(alice, ticket.number)
  assert.deepEqual(
    detail.events.map((event) => event.action),
    ["CREATED", "UPDATED", "TRANSFERRED"]
  )
  assert.equal(
    (detail.events[2]?.metadata as { summary: string }).summary,
    handoff.summary
  )
  let unavailable = true
  const flaky = createTicketService(db, { isUnavailable: () => unavailable })
  await fails("UNAVAILABLE", () => flaky.create(alice, input))
  await fails("UNAVAILABLE", () =>
    flaky.update(alice, ticket.number, { title: "Falha" })
  )
  assert.equal((await service.get(alice, ticket.number)).events.length, 3)
  unavailable = false
  assert.equal((await flaky.list(alice)).length, 1)
  const offlineDb = new PrismaClient({
    adapter: new PrismaPg({
      connectionString:
        "postgres://postgres:postgres@127.0.0.1:1/offline?sslmode=disable",
      connectionTimeoutMillis: 250,
    }),
  })
  try {
    await fails("UNAVAILABLE", () => createTicketService(offlineDb).list(alice))
  } finally {
    await offlineDb.$disconnect()
  }
  for (const status of ["RESOLVED", "CLOSED"] as const) {
    await db.ticket.update({ where: { id: ticket.id }, data: { status } })
    await fails("INVALID_STATE", () =>
      service.update(alice, ticket.number, { title: "Alteração" })
    )
    await fails("INVALID_STATE", () =>
      service.transfer(alice, ticket.number, handoff)
    )
  }
  await db.$disconnect()
  db = makeClient()
  assert.equal(
    (await createTicketService(db).get(alice, ticket.number)).description,
    edited.description
  )
  console.log(
    "Ticket service checks passed: isolation, validation, writes, history, transfer, failures and persistence."
  )
} finally {
  await db.ticket.deleteMany({ where: { openedById: { in: ids } } })
  await db.user.deleteMany({ where: { id: { in: ids } } })
  await db.$disconnect()
}
