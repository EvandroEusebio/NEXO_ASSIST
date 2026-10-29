import "dotenv/config"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createPrismaClient } from "../src/lib/prisma"
import {
  createConversationService,
  ConversationError,
} from "../src/services/conversations"
import { planWithNexo, AgentUnavailableError } from "../src/services/agent"
import type { AgentPlan, AgentPlanner } from "../src/contracts/agent"

const db = createPrismaClient()
const live = process.argv.includes("--live")
const userIds: string[] = []
let articleId: string | undefined
const fields = {
  title: "Notebook não liga",
  description: "O meu notebook não liga desde hoje de manhã.",
  type: "INC" as const,
  category: "HARDWARE" as const,
}
let nextPlan: AgentPlan = {
  intent: "help",
  query: "vpn erro 809",
  confidence: 0.95,
  reason: "Pergunta sobre VPN.",
}
let calls = 0
const fake: AgentPlanner = async () => {
  calls++
  return { plan: nextPlan, model: "test", tool: nextPlan.intent }
}
const service = createConversationService(db, {
  plan: live ? planWithNexo : fake,
})
const request = (content: string) => ({ content, requestId: randomUUID() })

async function main() {
  for (let i = 0; i < 2; i++) {
    const user = await db.user.create({
      data: {
        name: "Verificação do agente",
        email: `agent-${randomUUID()}@nexo.com.br`,
      },
    })
    userIds.push(user.id)
  }
  const owner = userIds[0]!
  const other = userIds[1]!
  const article = await db.helpArticle.create({
    data: {
      title: "VPN erro 809",
      content: "Confira a versão do Windows e informe o erro ao service desk.",
      tags: ["vpn", "809"],
    },
  })
  articleId = article.id
  const ticket = await db.ticket.create({
    data: {
      ...fields,
      priority: "MEDIUM",
      openedById: owner,
      affectedUserId: owner,
      number: `INC-${randomUUID().slice(0, 8)}`,
    },
  })
  async function conversation() {
    const id = randomUUID()
    await service.create(owner, { id })
    return id
  }

  const helpId = await conversation()
  const helpRequest = request("Como resolver o erro 809 da VPN no Windows 10?")
  const help = await service.send(owner, helpId, helpRequest)
  const helpReply = help.messages.at(-1)!
  assert.equal(helpReply.author, "AGENT")
  assert.match(helpReply.content, /Fonte:/)
  const decision = await db.agentDecision.findUniqueOrThrow({
    where: { messageId: helpReply.id },
  })
  assert.equal(decision.intent, "help")
  assert.ok(decision.evidenceSummary)
  await service.send(owner, helpId, helpRequest)
  if (!live) assert.equal(calls, 1, "Reenvio não deve chamar o modelo")

  nextPlan = {
    intent: "tickets",
    number: null,
    confidence: 0.95,
    reason: "Consulta dos próprios chamados.",
  }
  const list = await service.send(
    owner,
    await conversation(),
    request("Quais são os meus chamados?")
  )
  assert.equal(
    (list.messages.at(-1)!.metadata as { kind: string }).kind,
    "tickets"
  )
  assert.ok(list.tickets.some((item) => item.id === ticket.id))

  nextPlan = {
    intent: "create",
    fields,
    confidence: 0.95,
    reason: "Pedido explícito de abertura.",
  }
  const createId = await conversation()
  const before = await db.ticket.count({ where: { openedById: owner } })
  const proposed = await service.send(
    owner,
    createId,
    request("Abra um chamado: o meu notebook não liga desde hoje de manhã.")
  )
  assert.equal(proposed.drafts.length, 1)
  assert.equal(proposed.drafts[0]!.operation, "CREATE")
  assert.equal(
    await db.ticket.count({ where: { openedById: owner } }),
    before,
    "Não criar sem confirmação"
  )
  if (live) {
    console.log(
      "Groq real: dúvida com fonte, consulta de chamados e abertura com rascunho: OK (3 chamadas)"
    )
    return
  }
  const draft = proposed.drafts[0]!
  await service.send(owner, createId, {
    ...request("Confirmar"),
    action: { type: "confirm", draftId: draft.id, version: draft.version },
  })
  assert.equal(
    await db.ticket.count({ where: { openedById: owner } }),
    before + 1
  )

  nextPlan = {
    intent: "update",
    number: ticket.number,
    addition: "Também testei outro carregador.",
    confidence: 0.9,
    reason: "Novo detalhe de um chamado existente.",
  }
  const updateId = await conversation()
  const update = await service.send(
    owner,
    updateId,
    request(`Acrescente ao ${ticket.number}: testei outro carregador.`)
  )
  const updateDraft = update.drafts[0]!
  assert.equal(updateDraft.operation, "UPDATE")
  assert.equal(
    (await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
      .description,
    fields.description
  )
  await service.send(owner, updateId, {
    ...request("Confirmar"),
    action: {
      type: "confirm",
      draftId: updateDraft.id,
      version: updateDraft.version,
    },
  })
  assert.match(
    (await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
      .description,
    /outro carregador/
  )

  const staleId = await conversation()
  const stale = await service.send(
    owner,
    staleId,
    request("Acrescentar mais detalhes")
  )
  await db.ticket.update({
    where: { id: ticket.id },
    data: {
      title: "Título alterado por analista",
      updatedAt: new Date(Date.now() + 1000),
    },
  })
  await assert.rejects(
    service.send(owner, staleId, {
      ...request("Confirmar"),
      action: { type: "confirm", draftId: stale.drafts[0]!.id, version: 1 },
    }),
    (error) => error instanceof ConversationError && error.status === 409
  )

  const foreign = await db.ticket.create({
    data: {
      ...fields,
      priority: "MEDIUM",
      openedById: other,
      affectedUserId: other,
      number: `INC-${randomUUID().slice(0, 8)}`,
    },
  })
  nextPlan = {
    intent: "update",
    number: foreign.number,
    addition: "tentativa",
    confidence: 1,
    reason: "Teste de isolamento.",
  }
  const denied = await service.send(
    owner,
    await conversation(),
    request("Altere o chamado de outro funcionário")
  )
  assert.equal(denied.drafts.length, 0)
  assert.match(denied.messages.at(-1)!.content, /Não encontrei/)

  nextPlan = {
    intent: "create",
    fields,
    confidence: 0.2,
    reason: "Intenção ambígua.",
  }
  assert.equal(
    (await service.send(owner, await conversation(), request("Faça algo")))
      .drafts.length,
    0
  )
  nextPlan = {
    intent: "help",
    query: "zzzinexistentezz",
    confidence: 0.9,
    reason: "Teste sem fonte.",
  }
  assert.match(
    (
      await service.send(
        owner,
        await conversation(),
        request("Dúvida sem artigo")
      )
    ).messages.at(-1)!.content,
    /Não encontrei uma orientação/
  )

  nextPlan = {
    intent: "handoff",
    confidence: 0.95,
    reason: "Pedido explícito de analista.",
  }
  const handoffId = await conversation()
  assert.equal(
    (await service.send(owner, handoffId, request("Quero uma pessoa"))).status,
    "WAITING_ANALYST"
  )
  const priorCalls = calls
  const paused = await service.send(
    owner,
    handoffId,
    request("Mais detalhes enquanto espero")
  )
  assert.equal(calls, priorCalls)
  assert.equal(paused.messages.at(-1)!.author, "EMPLOYEE")

  const failureId = await conversation()
  const failed = createConversationService(db, {
    plan: async () => {
      throw new AgentUnavailableError()
    },
  })
  await assert.rejects(
    failed.send(owner, failureId, request("Teste de falha")),
    AgentUnavailableError
  )
  assert.equal((await service.snapshot(owner, failureId)).messageCount, 0)
  await failed.send(owner, failureId, {
    ...request("Consultar sem LLM"),
    action: { type: "tickets" },
  })

  const changedId = await conversation()
  const changed = createConversationService(db, {
    plan: async (input) => {
      await db.conversation.update({
        where: { id: changedId },
        data: { status: "WAITING_ANALYST", revision: { increment: 1 } },
      })
      return fake(input)
    },
  })
  await assert.rejects(
    changed.send(owner, changedId, request("Mudança durante inferência")),
    (error) => error instanceof ConversationError && error.status === 409
  )
  assert.equal((await service.snapshot(owner, changedId)).messageCount, 0)
  console.log(
    "Núcleo do agente: fontes, intenções, confirmação CREATE/UPDATE, privacidade, concorrência, pausa, reenvio e falha: OK"
  )
}
try {
  await main()
} finally {
  await db.conversation.deleteMany({ where: { employeeId: { in: userIds } } })
  await db.ticket.deleteMany({ where: { openedById: { in: userIds } } })
  await db.user.deleteMany({ where: { id: { in: userIds } } })
  if (articleId) await db.helpArticle.delete({ where: { id: articleId } })
  await db.$disconnect()
}
