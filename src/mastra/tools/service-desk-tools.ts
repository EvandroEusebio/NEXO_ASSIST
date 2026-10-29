import { createTool } from "@mastra/core/tools"
import { agentPlan } from "../../contracts/agent"

// Tools produce proposals only. Authenticated application services execute them
// after rechecking ownership, conversation revision and confirmation in PostgreSQL.
const [help, tickets, create, update, handoff, clarify] = agentPlan.options
export const serviceDeskTools = {
  searchHelp: createTool({
    id: "search-help",
    description:
      "Procurar orientações na central de ajuda. query deve conter palavras-chave do problema, sistema e erro.",
    inputSchema: help.omit({ intent: true }),
    outputSchema: help,
    execute: async (input) => ({ intent: "help" as const, ...input }),
  }),
  consultTickets: createTool({
    id: "consult-tickets",
    description:
      "Consultar chamados do funcionário autenticado. number=null lista os chamados; informe um número apenas se presente no histórico.",
    inputSchema: tickets.omit({ intent: true }),
    outputSchema: tickets,
    execute: async (input) => ({ intent: "tickets" as const, ...input }),
  }),
  prepareTicket: createTool({
    id: "prepare-ticket",
    description:
      "Preparar rascunho de abertura para confirmação. Use somente fatos fornecidos pelo funcionário; não cria o chamado.",
    inputSchema: create.omit({ intent: true }),
    outputSchema: create,
    execute: async (input) => ({ intent: "create" as const, ...input }),
  }),
  proposeUpdate: createTool({
    id: "propose-update",
    description:
      "Propor complemento de chamado existente para confirmação. Exige número do chamado e informação a acrescentar; não altera o chamado.",
    inputSchema: update.omit({ intent: true }),
    outputSchema: update,
    execute: async (input) => ({ intent: "update" as const, ...input }),
  }),
  requestAnalyst: createTool({
    id: "request-analyst",
    description:
      "Solicitar atendimento humano quando o funcionário pedir um analista.",
    inputSchema: handoff.omit({ intent: true }),
    outputSchema: handoff,
    execute: async (input) => ({ intent: "handoff" as const, ...input }),
  }),
  askClarification: createTool({
    id: "ask-clarification",
    description:
      "Fazer uma pergunta curta quando faltam dados, há ambiguidade ou o pedido está fora do service desk. Sem procedimentos técnicos.",
    inputSchema: clarify.omit({ intent: true }),
    outputSchema: clarify,
    execute: async (input) => ({ intent: "clarify" as const, ...input }),
  }),
}
