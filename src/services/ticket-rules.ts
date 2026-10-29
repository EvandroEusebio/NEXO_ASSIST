import { z } from "zod"
import type { TicketPriority, TicketType } from "../generated/prisma/enums"

export const impactSchema = z.enum([
  "TEAM_STOPPED",
  "PERSON_BLOCKED",
  "WORKAROUND_AVAILABLE",
  "ROUTINE_REQUEST",
])
export const urgencySchema = z.enum(["SAME_DAY", "ROUTINE"])

export type Impact = z.infer<typeof impactSchema>
export type Urgency = z.infer<typeof urgencySchema>

/** Annex A. Return null for inconsistent evidence instead of silently assigning a priority. */
export function classifyPriority(input: {
  type: TicketType
  impact: Impact
  urgency: Urgency
}): TicketPriority | null {
  const { type, impact, urgency } = input
  if (impact === "TEAM_STOPPED") return type === "INC" ? "CRITICAL" : null
  if (impact === "PERSON_BLOCKED" || urgency === "SAME_DAY")
    return impact === "ROUTINE_REQUEST" && type !== "REQ" ? null : "HIGH"
  if (impact === "WORKAROUND_AVAILABLE") return type === "INC" ? "MEDIUM" : null
  if (impact === "ROUTINE_REQUEST" && type === "REQ") return "LOW"
  return null
}
