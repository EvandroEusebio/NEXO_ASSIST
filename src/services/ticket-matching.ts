import type {
  TicketType,
  TicketCategory,
  TicketStatus,
} from "../generated/prisma/enums"

const stopwords = new Set([
  "ao",
  "aos",
  "as",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "em",
  "eu",
  "foi",
  "meu",
  "minha",
  "na",
  "nas",
  "no",
  "nos",
  "nao",
  "o",
  "os",
  "para",
  "por",
  "que",
  "sem",
  "um",
  "uma",
  "problema",
  "falha",
  "erro",
  "chamado",
  "pedido",
])

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function tokens(value: string) {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((word) => word.length >= 3 && !stopwords.has(word))
  )
}

function overlap(a: Set<string>, b: Set<string>) {
  return [...a].filter((word) => b.has(word)).length
}

export type Problem = {
  title: string
  description: string
  type: TicketType
  category: TicketCategory
}

/** High-confidence lexical match only. Ambiguous cases are shown to the employee. */
export function problemMatchScore(a: Problem, b: Problem): number {
  if (a.type !== b.type || a.category !== b.category) return 0
  const aTitle = tokens(a.title)
  const bTitle = tokens(b.title)
  const aAll = tokens(`${a.title} ${a.description}`)
  const bAll = tokens(`${b.title} ${b.description}`)
  if (
    aTitle.size >= 2 &&
    bTitle.size >= 2 &&
    normalize(a.title) === normalize(b.title)
  )
    return 1
  const titleCommon = overlap(aTitle, bTitle)
  if (
    titleCommon >= 2 &&
    titleCommon / Math.min(aTitle.size, bTitle.size) >= 0.75
  )
    return 0.9
  const common = overlap(aAll, bAll)
  if (common >= 3 && common / Math.min(aAll.size, bAll.size) >= 0.75) return 0.8
  if (
    common >= 2 &&
    [...aAll].some((word) => /^\d{2,}$/.test(word) && bAll.has(word))
  )
    return 0.85
  return 0
}

export const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
export function canReopen(
  ticket: { status: TicketStatus; resolvedAt: Date | null },
  now = new Date()
) {
  if (ticket.status !== "RESOLVED" || !ticket.resolvedAt) return false
  const age = now.getTime() - ticket.resolvedAt.getTime()
  return age >= 0 && age <= REOPEN_WINDOW_MS
}
