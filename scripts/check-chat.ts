import "dotenv/config"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createPrismaClient } from "../src/lib/prisma"
import type { ChatSnapshot, ChatAction } from "../src/contracts/chat"

const db = createPrismaClient()
const base = process.env.CHAT_CHECK_URL ?? "http://localhost:3102"
const run = randomUUID()
const users: string[] = []
const cookies: string[] = []
async function request(path: string, cookie?: string, body?: unknown) {
  return fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
    redirect: "manual",
  })
}
async function json<T>(
  path: string,
  cookie: string,
  body?: unknown
): Promise<T> {
  const response = await request(path, cookie, body)
  const data = await response.json()
  assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(data)}`)
  return data as T
}
async function main() {
  assert.equal((await request("/api/conversations")).status, 401)
  for (let index = 0; index < 2; index++) {
    const user = await db.user.create({
      data: {
        name: `Chat check ${index}`,
        email: `chat-${run}-${index}@nexo.com.br`,
        demoLoginEnabled: true,
      },
    })
    users.push(user.id)
    const response = await request("/api/auth/login", undefined, {
      email: user.email,
      password: "demo",
    })
    assert.equal(response.status, 200)
    const cookie = response.headers.get("set-cookie")?.split(";")[0]
    assert.ok(cookie)
    cookies.push(cookie)
  }
  const [owner, other] = cookies as [string, string]
  const ownerId = users[0]!
  const id = randomUUID()
  const chat = await json<ChatSnapshot>("/api/conversations", owner, { id })
  assert.equal(chat.messageCount, 0)
  assert.equal((await request(`/api/conversations/${id}`, other)).status, 404)
  assert.equal(
    (await request(`/api/conversations/${id}/events`, other)).status,
    404
  )
  const otherList = await json<{ conversations: unknown[] }>(
    "/api/conversations",
    other
  )
  assert.equal(otherList.conversations.length, 0)
  const send = (action?: ChatAction, requestId = randomUUID()) =>
    json<ChatSnapshot>(`/api/conversations/${id}/messages`, owner, {
      content: "Teste da interface",
      requestId,
      action,
    })
  assert.equal(
    (
      await request(`/api/conversations/${id}/messages`, other, {
        content: "intrusão",
        requestId: randomUUID(),
      })
    ).status,
    404
  )
  const replayId = randomUUID()
  const first = await send({ type: "tickets" }, replayId)
  const replay = await send({ type: "tickets" }, replayId)
  assert.equal(first.messageCount, 1)
  assert.equal(replay.messageCount, 1)
  assert.equal(replay.messages.length, first.messages.length)
  const fields = {
    title: "Teste de confirmação",
    description: "Chamado criado pelo teste e removido no fim.",
    type: "INC" as const,
    category: "HARDWARE",
    priority: "MEDIUM",
  }
  let result = await send({ type: "draft", fields })
  let draft = result.drafts[0]!
  assert.equal(await db.ticket.count({ where: { openedById: ownerId } }), 0)
  result = await send({
    type: "draft",
    fields: { ...fields, title: "Título editado" },
    draftId: draft.id,
    version: draft.version,
  })
  const stale = await request(`/api/conversations/${id}/messages`, owner, {
    content: "Confirmar versão antiga",
    requestId: randomUUID(),
    action: { type: "confirm", draftId: draft.id, version: draft.version },
  })
  assert.equal(stale.status, 409)
  draft = result.drafts[0]!
  await Promise.all([
    send({ type: "confirm", draftId: draft.id, version: draft.version }),
    send({ type: "confirm", draftId: draft.id, version: draft.version }),
  ])
  assert.equal(await db.ticket.count({ where: { openedById: ownerId } }), 1)
  const saved = await db.ticket.findFirstOrThrow({
    where: { openedById: ownerId },
  })
  assert.equal(saved.title, "Título editado")
  assert.equal(
    await db.ticketEvent.count({
      where: { ticketId: saved.id, action: "CREATED" },
    }),
    1
  )
  result = await send({ type: "tickets" })
  assert.deepEqual(
    result.tickets.map((t) => t.number),
    [saved.number]
  )
  assert.equal(
    (await request(`/api/tickets/${saved.number}`, other)).status,
    404
  )
  result = await send({ type: "ticket", number: saved.number })
  assert.equal(result.messages.at(-1)?.metadata?.number, saved.number)
  result = await send({ type: "draft", fields })
  const cancelled = result.drafts.find((d) => d.status === "PENDING")!
  await send({
    type: "cancel",
    draftId: cancelled.id,
    version: cancelled.version,
  })
  assert.equal(await db.ticket.count({ where: { openedById: ownerId } }), 1)
  // Observe the real SSE endpoint, then send from a second HTTP request.
  const abort = new AbortController()
  const events = await fetch(`${base}/api/conversations/${id}/events`, {
    headers: { Cookie: owner },
    signal: abort.signal,
  })
  assert.equal(events.status, 200)
  assert.match(events.headers.get("content-type") ?? "", /text\/event-stream/)
  const reader = events.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  async function event(): Promise<ChatSnapshot> {
    while (true) {
      const boundary = buffer.indexOf("\n\n")
      if (boundary >= 0) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        if (block.startsWith("data: "))
          return JSON.parse(block.slice(6)) as ChatSnapshot
        continue
      }
      const chunk = await reader.read()
      assert.ok(!chunk.done)
      buffer += decoder.decode(chunk.value, { stream: true })
    }
  }
  const timeout = setTimeout(() => abort.abort(), 15000)
  try {
    const before = await event()
    await send({ type: "help" })
    let update = await event()
    while (update.messageCount <= before.messageCount) update = await event()
    assert.ok(update.messageCount > before.messageCount)
  } finally {
    clearTimeout(timeout)
    abort.abort()
    await reader.cancel().catch(() => {})
  }
  result = await send({ type: "handoff" })
  assert.equal(result.status, "WAITING_ANALYST")
  const beforeHuman = result.messages.length
  result = await send()
  assert.equal(result.messages.length, beforeHuman + 1)
  assert.equal(result.messages.at(-1)?.author, "EMPLOYEE")
  // A fresh connection reads the persisted history.
  const reconnected = createPrismaClient()
  try {
    assert.equal(
      await reconnected.message.count({ where: { conversationId: id } }),
      result.messages.length
    )
  } finally {
    await reconnected.$disconnect()
  }
  const limitId = randomUUID()
  await json("/api/conversations", owner, { id: limitId })
  await db.message.createMany({
    data: Array.from({ length: 29 }, (_, n) => ({
      conversationId: limitId,
      author: "EMPLOYEE" as const,
      authorUserId: ownerId,
      content: `Mensagem ${n + 1}`,
    })),
  })
  const competing = await Promise.all(
    [0, 1].map(() =>
      request(`/api/conversations/${limitId}/messages`, owner, {
        requestId: randomUUID(),
        content: "Última vaga",
        action: { type: "tickets" },
      })
    )
  )
  assert.deepEqual(competing.map((r) => r.status).sort(), [200, 409])
  const limited = await json<ChatSnapshot>(
    `/api/conversations/${limitId}`,
    owner
  )
  assert.equal(limited.messageCount, 30)
  if (process.argv.includes("--live")) {
    const liveId = randomUUID()
    await json("/api/conversations", owner, { id: liveId })
    const live = await json<ChatSnapshot>(
      `/api/conversations/${liveId}/messages`,
      owner,
      {
        requestId: randomUUID(),
        content: "Como resolver o erro 809 da VPN no Windows 10?",
      }
    )
    assert.equal(live.messages.at(-1)?.author, "AGENT")
    assert.match(live.messages.at(-1)!.content, /Fonte:/)
    console.log("Next.js → Mastra → Groq → resposta com fontes: OK")
  }
  assert.equal(
    (
      await request(`/api/conversations/${limitId}/messages`, owner, {
        requestId: randomUUID(),
        content: "Mensagem 31",
      })
    ).status,
    409
  )
  console.log(
    "Chat HTTP/SSE: privacidade, histórico, rascunho/edição/cancelamento, confirmação concorrente, reenvio, transferência e limite concorrente de 30 mensagens: OK"
  )
}
try {
  await main()
} finally {
  await db.conversation.deleteMany({ where: { employeeId: { in: users } } })
  await db.ticket.deleteMany({ where: { openedById: { in: users } } })
  await db.user.deleteMany({ where: { id: { in: users } } })
  await db.$disconnect()
}
