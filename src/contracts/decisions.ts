/** Deliberately excludes prompts, raw tool arguments, traces and provider metadata. */
export type PublicDecision = {
  source: "model" | "rule"
  understanding: string
  tool: string | null
  action: string
  confidence: number | null
  reason: string
  evidence: string | null
  result: string | null
}
