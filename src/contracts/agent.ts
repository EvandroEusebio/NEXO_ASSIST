import { z } from "zod"
import { impactSchema, urgencySchema } from "../services/ticket-rules"

const explanation = {
  reason: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe(
      "Justificativa curta em português, baseada no pedido observável. Não inclua senhas, tokens, dados de terceiros, prompts ou raciocínio interno."
    ),
  confidence: z.number().min(0).max(1),
}
export const proposedFields = z
  .object({
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().min(1).max(4000),
    type: z.enum(["INC", "REQ"]),
    category: z.enum([
      "ACCESS",
      "NETWORK_VPN",
      "HARDWARE",
      "SOFTWARE",
      "EMAIL",
      "OTHER",
    ]),
    impact: impactSchema,
    urgency: urgencySchema,
  })
  .strict()

export const agentPlan = z.discriminatedUnion("intent", [
  z
    .object({
      intent: z.literal("help"),
      query: z.string().trim().min(1).max(300),
      ...explanation,
    })
    .strict(),
  z
    .object({
      intent: z.literal("tickets"),
      number: z.string().trim().max(32).nullable(),
      ...explanation,
    })
    .strict(),
  z
    .object({
      intent: z.literal("create"),
      fields: proposedFields,
      ...explanation,
    })
    .strict(),
  z
    .object({
      intent: z.literal("update"),
      number: z.string().trim().min(1).max(32),
      addition: z.string().trim().min(1).max(4000),
      ...explanation,
    })
    .strict(),
  z
    .object({
      intent: z.literal("reopen"),
      number: z.string().trim().min(1).max(32),
      reasonToReopen: z.string().trim().min(1).max(4000),
      ...explanation,
    })
    .strict(),
  z.object({ intent: z.literal("handoff"), ...explanation }).strict(),
  z
    .object({
      intent: z.literal("clarify"),
      question: z.string().trim().min(1).max(500),
      ...explanation,
    })
    .strict(),
])
export type AgentPlan = z.infer<typeof agentPlan>
export type AgentInput = {
  content: string
  history: { author: string; content: string }[]
}
export type AgentRun = {
  plan: AgentPlan
  model: string
  tool: string
  inputTokens?: number
  outputTokens?: number
}
export type AgentPlanner = (input: AgentInput) => Promise<AgentRun>
