import { agentPlan, type AgentPlanner } from "../contracts/agent"
import { nexoAgent, nexoModel } from "../mastra/agents/nexo-agent"

export class AgentUnavailableError extends Error {
  constructor() {
    super(
      "O assistente está temporariamente indisponível. Tente novamente ou use as opções do chat para consultar chamados ou pedir um analista."
    )
    this.name = "AgentUnavailableError"
  }
}

export const planWithNexo: AgentPlanner = async ({ content, history }) => {
  try {
    if (!process.env.GROQ_API_KEY) throw new AgentUnavailableError()
    const model = nexoModel()
    const result = await nexoAgent.generate(
      [
        ...history.slice(-10).map((message) =>
          message.author === "EMPLOYEE"
            ? {
                role: "user" as const,
                content: message.content.slice(0, 800),
              }
            : {
                role: "assistant" as const,
                content: message.content.slice(0, 800),
              }
        ),
        { role: "user" as const, content },
      ],
      {
        maxSteps: 1,
        toolChoice: "required",
        toolCallConcurrency: 1,
        maxProcessorRetries: 0,
        modelSettings: {
          temperature: 0,
          maxOutputTokens: 900,
          maxRetries: 0,
          timeout: { totalMs: 20000 },
        },
        abortSignal: AbortSignal.timeout(20000),
      }
    )
    // Multiple proposals are ambiguous. None has performed application writes.
    if (
      result.toolResults.length !== 1 ||
      result.toolResults[0]?.payload.isError
    )
      throw new AgentUnavailableError()
    const toolResult = result.toolResults[0]!
    const plan = agentPlan.parse(toolResult.payload.result)
    return {
      plan,
      model,
      tool: toolResult.payload.toolName,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    }
  } catch {
    // Never expose provider errors: they may contain prompts or authorization data.
    throw new AgentUnavailableError()
  }
}
