import { hashPassword } from "../src/lib/password"
import "dotenv/config"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createPrismaClient } from "../src/lib/prisma"
import { createConversationService } from "../src/services/conversations"
import { createAnalystService } from "../src/services/analyst"
import { publicMessage } from "../src/services/decisions"
import type { AgentPlan } from "../src/contracts/agent"
import { planWithNexo } from "../src/services/agent"

const db = createPrismaClient()
const ids: string[] = []
const cookies: string[] = []
const base = process.env.CHAT_CHECK_URL ?? "http://localhost:3100"
let articleId: string | undefined
let plan: AgentPlan = {
  intent: "help",
  query: "transparencia vpn",
  reason: "O funcionário pediu orientação sobre a VPN.",
  confidence: 0.92,
}
let tool = "searchHelp"
const service = createConversationService(db, {
  plan: async () => ({
    plan,
    tool,
    model: "private-provider-id",
    inputTokens: 123,
  }),
})
const analysts = createAnalystService(db)
const request = (content: string) => ({ requestId: randomUUID(), content })
async function main() {
  const masked = publicMessage({
    id: "test",
    metadata: {
      agent: { tool: "unknown-secret", model: "SECRET-MODEL" },
      prompt: "PRIVATE PROMPT",
      trace: "PRIVATE TRACE",
      arbitrary: "PRIVATE",
    },
    decision: {
      intent: "__proto__",
      action: "unknown-secret",
      reasonSummary: "token=DO-NOT-EXPOSE",
      resultSummary: "Authorization: Bearer PRIVATE",
      evidenceSummary: "PRIVATE EVIDENCE",
      confidence: 12,
    },
  })
  assert.equal(masked.decision?.confidence, null)
  assert.equal(masked.decision?.tool, null)
  assert.equal(typeof masked.decision?.understanding, "string")
  assert.doesNotMatch(
    JSON.stringify(masked),
    /PRIVATE|DO-NOT-EXPOSE|SECRET-MODEL|unknown-secret/
  )
  for (const role of ["EMPLOYEE", "EMPLOYEE", "ANALYST"] as const)
    ids.push(
      (
        await db.user.create({
          data: {
            name: "Teste transparência",
            email: `decision-${randomUUID()}@nexo.com.br`,
            role,
            demoLoginEnabled: true,
            passwordHash: await hashPassword("Decisions-check-password-2026!"),
          },
        })
      ).id
    )
  const [owner, other, analyst] = ids as [string, string, string]
  articleId = (
    await db.helpArticle.create({
      data: {
        title: "Transparencia VPN",
        content: "Confira a conexão antes de tentar novamente.",
        tags: ["transparencia", "vpn"],
      },
    })
  ).id
  const cid = randomUUID()
  await service.create(owner, { id: cid })
  const input = request("Como resolver uma falha de VPN?")
  let snapshot = await service.send(owner, cid, input)
  const message = snapshot.messages.at(-1)!
  assert.equal(message.decision?.tool, "Pesquisa na central de ajuda")
  assert.equal(message.decision?.confidence, 0.92)
  assert.match(message.decision!.evidence!, /artigo/i)
  assert.deepEqual(
    (await service.snapshot(owner, cid)).messages.at(-1)?.decision,
    message.decision
  )
  await service.send(owner, cid, input)
  assert.equal(
    await db.agentDecision.count({ where: { messageId: message.id } }),
    1
  )
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /private-provider-id|inputTokens|sourceIds/
  )
  assert.deepEqual((await analysts.detail(analyst, cid)).messages, [])
  await assert.rejects(service.snapshot(other, cid), { status: 404 })
  await assert.rejects(analysts.detail(owner, cid), { status: 403 })

  plan = {
    intent: "clarify",
    question: "Qual sistema apresenta o problema?",
    confidence: 0.8,
    reason: "Falta identificar o sistema afetado.",
  }
  tool = "askClarification"
  snapshot = await service.send(owner, cid, request("Preciso de ajuda"))
  assert.equal(
    snapshot.messages.at(-1)?.decision?.action,
    "Pediu esclarecimento antes de continuar"
  )
  const fields = {
    title: "Monitor sem imagem",
    description: "Monitor sem imagem após trocar o cabo",
    type: "INC" as const,
    category: "HARDWARE" as const,
    impact: "PERSON_BLOCKED" as const,
    urgency: "SAME_DAY" as const,
  }
  await db.ticket.create({
    data: {
      number: `INC-${randomUUID().slice(0, 8)}`,
      title: fields.title,
      description: "Monitor sem imagem hoje",
      type: fields.type,
      category: fields.category,
      priority: "HIGH",
      openedById: owner,
      affectedUserId: owner,
    },
  })
  plan = {
    intent: "create",
    fields,
    confidence: 0.9,
    reason: "Pedido para abrir chamado.",
  }
  tool = "prepareTicket"
  snapshot = await service.send(
    owner,
    cid,
    request("Abra outro chamado para o monitor sem imagem")
  )
  assert.match(snapshot.messages.at(-1)!.decision!.understanding, /abertura/)
  assert.match(snapshot.messages.at(-1)!.decision!.action, /complemento/)
  assert.match(snapshot.messages.at(-1)!.decision!.reason, /duplicação/)
  plan = {
    intent: "help",
    query: "vpn",
    confidence: 0.2,
    reason: "Pedido ambíguo.",
  }
  tool = "searchHelp"
  snapshot = await service.send(owner, cid, request("Faça algo"))
  assert.equal(snapshot.status, "WAITING_ANALYST")
  assert.equal(
    snapshot.messages.at(-1)?.decision?.tool,
    "Pesquisa na central de ajuda"
  )
  assert.match(snapshot.messages.at(-1)!.decision!.action, /Encaminhou/)
  assert.match(snapshot.messages.at(-1)!.decision!.reason, /65%/)
  let detail = await analysts.detail(analyst, cid)
  detail = await analysts.act(analyst, cid, {
    action: "claim",
    requestId: randomUUID(),
    revision: detail.revision,
  })
  assert.deepEqual(
    detail.messages.find((m) => m.id === message.id)?.decision,
    message.decision
  )
  detail = await analysts.act(analyst, cid, {
    action: "reply",
    content: "Vou verificar.",
    requestId: randomUUID(),
    revision: detail.revision,
  })
  assert.equal(detail.messages.at(-1)?.decision, null)
  const ruleId = randomUUID()
  await service.create(owner, { id: ruleId })
  const manual = await service.send(owner, ruleId, {
    ...request("Quero um analista"),
    action: { type: "handoff" },
  })
  assert.equal(manual.messages.at(-1)?.decision?.source, "rule")
  assert.equal(manual.messages.at(-1)?.decision?.confidence, null)
  await db.message.create({
    data: {
      conversationId: cid,
      author: "AGENT",
      content: "Resposta antiga sem registro",
    },
  })
  assert.equal(
    (await service.snapshot(owner, cid)).messages.at(-1)?.decision,
    null
  )

  if (process.argv.includes("--live")) {
    const liveId = randomUUID()
    const liveService = createConversationService(db, { plan: planWithNexo })
    await liveService.create(owner, { id: liveId })
    const live = await liveService.send(
      owner,
      liveId,
      request("Como resolver o erro 809 da VPN no Windows 10?")
    )
    assert.ok(live.messages.at(-1)?.decision?.tool)
    assert.ok(live.messages.at(-1)?.decision?.reason)
    assert.ok(live.messages.at(-1)?.decision?.confidence != null)
    console.log(
      "Decisão real via Mastra/Groq persistida e apresentada: OK (1 chamada)"
    )
  }
  if (process.argv.includes("--http")) {
    for (const id of ids) {
      const user = await db.user.findUniqueOrThrow({ where: { id } })
      const response = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          password: "Decisions-check-password-2026!",
        }),
      })
      assert.equal(response.status, 200)
      cookies.push(response.headers.get("set-cookie")!.split(";")[0]!)
    }
    const read = (path: string, cookie?: string) =>
      fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie } : {} })
    assert.equal((await read(`/api/conversations/${cid}`)).status, 401)
    assert.equal(
      (await read(`/api/conversations/${cid}`, cookies[1])).status,
      404
    )
    assert.equal(
      (await read(`/api/analyst/conversations/${cid}`, cookies[0])).status,
      403
    )
    for (const [path, cookie] of [
      [`/api/conversations/${cid}`, cookies[0]],
      [`/api/analyst/conversations/${cid}`, cookies[2]],
    ] as const) {
      const res = await read(path, cookie)
      assert.equal(res.status, 200)
      const body = await res.text()
      assert.match(body, /Pesquisa na central de ajuda/)
      assert.doesNotMatch(
        body,
        /private-provider-id|inputTokens|sourceIds|reasonSummary|evidenceSummary/
      )
    }
    const abort = new AbortController()
    const stream = await fetch(`${base}/api/conversations/${cid}/events`, {
      headers: { Cookie: cookies[0]! },
      signal: abort.signal,
    })
    const reader = stream.body!.getReader()
    try {
      const first = await reader.read()
      const text = new TextDecoder().decode(first.value)
      assert.match(text, /Pesquisa na central de ajuda/)
      assert.doesNotMatch(text, /private-provider-id|inputTokens|sourceIds/)
    } finally {
      abort.abort()
      await reader.cancel().catch(() => {})
    }
    console.log("HTTP/SSE e privacidade das decisões entre perfis: OK")
  }
  console.log(
    "Decisões: persistência, reenvio, ações efetivas, confiança, registros antigos, metadados seguros e permissões: OK"
  )
}
try {
  await main()
} finally {
  if (ids.length)
    await db.conversation.deleteMany({ where: { employeeId: { in: ids } } })
  if (ids.length)
    await db.ticket.deleteMany({ where: { openedById: { in: ids } } })
  if (articleId) await db.helpArticle.delete({ where: { id: articleId } })
  if (ids.length) await db.user.deleteMany({ where: { id: { in: ids } } })
  await db.$disconnect()
}
