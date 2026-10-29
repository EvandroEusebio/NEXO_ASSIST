export const MESSAGE_LIMIT = 30
export const categoryLabels: Record<string, string> = {
  ACCESS: "Acessos",
  NETWORK_VPN: "Rede e VPN",
  HARDWARE: "Hardware",
  SOFTWARE: "Software",
  EMAIL: "E-mail",
  OTHER: "Outros",
}
export const priorityLabels: Record<string, string> = {
  CRITICAL: "Crítica",
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
}
export const statusLabels: Record<string, string> = {
  OPEN: "Aberto",
  IN_PROGRESS: "Em andamento",
  WAITING_ANALYST: "Aguardando analista",
  APPROVED: "Aprovado",
  RESOLVED: "Resolvido",
  CLOSED: "Encerrado",
}
export type DraftFields = {
  title: string
  description: string
  type: "INC" | "REQ"
  category: string
  priority: string
  impact?:
    | "TEAM_STOPPED"
    | "PERSON_BLOCKED"
    | "WORKAROUND_AVAILABLE"
    | "ROUTINE_REQUEST"
  urgency?: "SAME_DAY" | "ROUTINE"
}
export type ChatAction =
  | { type: "tickets" }
  | { type: "ticket"; number: string }
  | { type: "help" }
  | { type: "handoff"; number?: string }
  | { type: "draft"; fields: DraftFields; draftId?: string; version?: number }
  | { type: "confirm" | "cancel"; draftId: string; version: number }
export type ChatTicket = {
  number: string
  title: string
  description: string
  category: string
  priority: string
  status: string
  createdAt: string
  updatedAt: string
  nextResponseDueAt: string | null
  resolvedAt: string | null
}
export type ChatMessage = {
  id: string
  author: string
  content: string
  createdAt: string
  metadata: {
    kind?: string
    number?: string
    draftId?: string
    activity?: string
    candidateNumbers?: string[]
  } | null
}
export type ChatDraft = {
  id: string
  operation: "CREATE" | "UPDATE" | "REOPEN"
  status: string
  version: number
  payload: DraftFields
  targetTicket: { number: string } | null
}
export type ChatSnapshot = {
  id: string
  status: string
  revision: number
  messages: ChatMessage[]
  drafts: ChatDraft[]
  tickets: ChatTicket[]
  messageCount: number
  limit: number
}
export type ConversationSummary = {
  id: string
  status: string
  updatedAt: string
  title: string
}
