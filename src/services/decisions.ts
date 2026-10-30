import type { Prisma } from "../generated/prisma/client"
import type { PublicDecision } from "../contracts/decisions"
import { handoffLabels } from "./handoff"

export const decisionSelect = {
  intent: true,
  action: true,
  confidence: true,
  reasonSummary: true,
  evidenceSummary: true,
  resultSummary: true,
} satisfies Prisma.AgentDecisionSelect

type DecisionRow = Prisma.AgentDecisionGetPayload<{
  select: typeof decisionSelect
}>
const intents: Record<string, string> = {
  help: "Pedido de orientação técnica",
  tickets: "Consulta de chamados",
  create: "Pedido de abertura de chamado",
  update: "Complemento de chamado existente",
  reopen: "Pedido de reabertura de chamado",
  handoff: "Necessidade de atendimento humano",
  clarify: "Pedido que precisa de esclarecimento",
}
const actions: Record<string, string> = {
  help: "Pesquisou a central de ajuda",
  tickets: "Consultou os chamados do funcionário",
  ticket: "Consultou um chamado do funcionário",
  "not-found": "Não encontrou o chamado entre os do funcionário",
  "prepare-create": "Preparou uma abertura para confirmação",
  "prepare-update": "Preparou um complemento para confirmação",
  "prepare-reopen": "Preparou uma reabertura para confirmação",
  "select-ticket": "Pediu a seleção de um chamado semelhante",
  "existing-ticket": "Apresentou o chamado existente, sem duplicar",
  "reopen-blocked": "Não reabriu o chamado pelas regras de reabertura",
  draft: "Preparou um rascunho para confirmação",
  clarify: "Pediu esclarecimento antes de continuar",
  welcome: "Respondeu à mensagem",
  handoff: "Encaminhou ao analista e pausou o assistente",
}
const tools: Record<string, string> = {
  searchHelp: "Pesquisa na central de ajuda",
  consultTickets: "Consulta de chamados",
  prepareTicket: "Proposta de abertura de chamado",
  proposeUpdate: "Proposta de complemento de chamado",
  proposeReopen: "Proposta de reabertura de chamado",
  requestAnalyst: "Pedido de atendimento humano",
  askClarification: "Pedido de esclarecimento",
}
const toolIds: Record<string, string> = {
  "search-help": "searchHelp",
  "consult-tickets": "consultTickets",
  "prepare-ticket": "prepareTicket",
  "propose-update": "proposeUpdate",
  "propose-reopen": "proposeReopen",
  "request-analyst": "requestAnalyst",
  "ask-clarification": "askClarification",
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
/** Short public summaries only; never use this to publish arbitrary traces. */
export function publicSummary(value: unknown, limit = 500): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  if (
    /(?:senha|password|api[_ -]?key|token|secret|authorization)\s*[:=]|\bBearer\s+\S+|\b(?:gsk_|sk-|sk_)[\w-]{8,}|\beyJ[\w-]+\.[\w-]+\.[\w-]+|:\/\/[^\s/]+:[^\s/]+@/i.test(
      value
    )
  )
    return "Resumo omitido por conter dados sensíveis."
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[e-mail omitido]")
    .trim()
    .slice(0, limit)
}
function evidence(value: string | null): string | null {
  if (!value) return null
  if (Object.hasOwn(handoffLabels, value))
    return handoffLabels[value as keyof typeof handoffLabels]
  try {
    const ids: unknown = JSON.parse(value)
    const articles = object(ids).articles
    if (
      Array.isArray(articles) &&
      articles.length <= 2 &&
      articles.every((title) => typeof title === "string")
    ) {
      return articles.length
        ? `Artigos consultados: ${articles.map((title) => publicSummary(title, 160)).join("; ")}.`
        : "Nenhum artigo correspondente encontrado."
    }
    if (
      Array.isArray(ids) &&
      ids.every((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))
    )
      return ids.length
        ? `${ids.length} artigo(s) encontrado(s) na central de ajuda.`
        : "Nenhum artigo correspondente encontrado."
  } catch {
    /* Legacy free text is not a public evidence source. */
  }
  return null
}
export function decisionReason(
  reason: string,
  intent: string,
  action?: string
): string {
  const observed =
    action === "select-ticket"
      ? "Foram encontrados vários chamados semelhantes; é necessário escolher antes de alterar."
      : action === "existing-ticket"
        ? "Já existe um chamado ativo com o mesmo relato; outro chamado não foi criado."
        : action === "reopen-blocked"
          ? "A reabertura não atende às regras: o chamado está encerrado ou foi resolvido há mais de sete dias."
          : intent === "create" && action === "prepare-update"
            ? "Foi encontrado um chamado ativo semelhante; o complemento foi preparado para evitar uma duplicação."
            : intent === "create" && action === "prepare-reopen"
              ? "Foi encontrado um chamado semelhante resolvido há até sete dias; a reabertura foi preparada para confirmação."
              : null
  return (
    observed ?? publicSummary(reason, 300) ?? "Justificativa não registrada."
  )
}
function presentDecision(
  row: DecisionRow | null,
  metadata: unknown
): PublicDecision | null {
  if (!row) return null
  const rawTool = object(object(metadata).agent).tool
  const toolKey =
    typeof rawTool === "string" ? (toolIds[rawTool] ?? rawTool) : ""
  const confidence =
    row.confidence !== null &&
    Number.isFinite(row.confidence) &&
    row.confidence >= 0 &&
    row.confidence <= 1
      ? row.confidence
      : null
  return {
    source: object(metadata).decisionSource === "rule" ? "rule" : "model",
    understanding: Object.hasOwn(intents, row.intent)
      ? intents[row.intent]!
      : "Intenção não disponível neste registro",
    tool: Object.hasOwn(tools, toolKey) ? tools[toolKey]! : null,
    action: Object.hasOwn(actions, row.action)
      ? actions[row.action]!
      : "Ação não disponível neste registro",
    confidence,
    reason:
      publicSummary(row.reasonSummary, 500) ?? "Justificativa não registrada.",
    evidence: evidence(row.evidenceSummary),
    result: publicSummary(row.resultSummary),
  }
}

/** Shared boundary for employee snapshots (HTTP/SSE) and authorized analyst detail. */
export function publicMessage<
  T extends { metadata: unknown; decision: DecisionRow | null },
>(message: T) {
  const { metadata, decision, ...rest } = message
  const raw = object(metadata)
  const safe: {
    kind?: string
    number?: string
    draftId?: string
    activity?: string
    candidateNumbers?: string[]
  } = {}
  for (const key of ["kind", "number", "draftId", "activity"] as const) {
    if (typeof raw[key] === "string")
      safe[key] =
        publicSummary(raw[key], key === "activity" ? 240 : 80) ?? undefined
  }
  if (Array.isArray(raw.candidateNumbers))
    safe.candidateNumbers = raw.candidateNumbers
      .filter(
        (n): n is string =>
          typeof n === "string" && /^(INC|REQ)-[\w-]{1,28}$/.test(n)
      )
      .slice(0, 100)
  return {
    ...rest,
    metadata: metadata ? safe : null,
    decision: presentDecision(decision, metadata),
  }
}
