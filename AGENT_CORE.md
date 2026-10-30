# Fase 3, etapa 8 — núcleo do agente

O texto livre do chat usa o agente `nexoAgent`, do Mastra, com Groq. O modelo escolhe uma ferramenta para pesquisar ajuda, consultar chamados, preparar abertura, propor complemento ou reabertura, pedir um analista ou solicitar esclarecimento. As ferramentas retornam propostas validadas com Zod; o serviço de conversas executa a operação com a identidade da sessão. Não há acesso direto do modelo ao banco.

## Configuração e consumo

No `.env` da raiz:

```dotenv
GROQ_API_KEY="sua-chave"
NEXO_MODEL="groq/openai/gpt-oss-20b"
```

O Next.js reaproveita esse arquivo no servidor. Variáveis de ambiente e `apps/web/.env.local` têm precedência. Reinicie o servidor após alterar as variáveis. A chave nunca deve receber prefixo `NEXT_PUBLIC_`.

O modelo anterior, `groq/llama-3.3-70b-versatile`, devolveu `model_not_found` com a chave existente. A API de modelos da conta confirmou acesso a `openai/gpt-oss-20b`, e o teste real das três intenções passou com ele. O provedor continua sendo **Groq**, sem chave ou serviço da OpenAI. O exemplo de clima original permanece separado do Nexo.

Há no máximo uma chamada ao modelo por mensagem de texto livre, saída limitada a 900 tokens, prazo de 20 segundos e zero retries automáticos. O contexto usa até dez mensagens anteriores, com até 800 caracteres cada. Os botões de ação, confirmações e conversas sob atendimento humano não chamam o modelo. Não há embeddings, base vetorial ou novo serviço pago. `NEXO_MODEL` aceita apenas o prefixo `groq/`; não há troca automática de provedor ou modelo após uma falha.

O uso gratuito depende do plano e das quotas da conta Groq: o código não altera faturação nem garante gratuidade numa conta paga. Os [limites efetivos são os da organização](https://console.groq.com/docs/rate-limits). O [modelo escolhido suporta ferramentas](https://console.groq.com/docs/model/openai/gpt-oss-20b).

## Comportamento e limites

- **Ajuda:** pesquisa textual local nos artigos (até 100), com até duas fontes. Mostra título e conteúdo cadastrado, sem gerar procedimentos. Sem correspondência, informa a ausência e oferece esclarecimento/analista.
- **Consulta:** lista ou consulta um número usando o serviço de chamados e o funcionário autenticado. Ausência e acesso a chamado alheio produzem a mesma resposta.
- **Abertura:** prepara um rascunho; o chamado só nasce ao clicar em Confirmar. Tipo, categoria, impacto e urgência são propostos pelo agente. O backend valida esses dados, calcula a prioridade e o prazo conforme [CLASSIFICATION_SLA.md](CLASSIFICATION_SLA.md).
- **Complemento, duplicidade e reabertura:** o backend procura chamados semelhantes do mesmo funcionário, prepara complemento ou reabertura quando aplicável e pede confirmação. Uma alteração concorrente bloqueia o rascunho obsoleto. Veja [TICKET_FLOW.md](TICKET_FLOW.md).
- **Atendimento humano:** pedido explícito coloca a conversa em `WAITING_ANALYST` e pausa o agente. Casos críticos/vencidos e decisões inseguras também são encaminhados. O console e o atendimento estão documentados em `HUMAN_SUPPORT.md`.
- **Incerteza:** confiança estimada abaixo de 0,65 transfere a conversa ao analista com contexto. Esse número é autodeclarado pelo modelo, não uma probabilidade calibrada.
- **Falha de modelo/quota:** devolve 503 com mensagem segura; nenhuma escrita daquele turno é feita. O utilizador pode reenviar ou usar os botões sem LLM. Não há confirmação interpretada a partir de texto livre nesta etapa: usam-se os botões vinculados à versão do rascunho.

A inferência acontece fora da transação PostgreSQL. Antes de aplicar a proposta, o backend revalida a revisão da conversa, o estado, a posse e o limite de 30 mensagens. Se a conversa mudou durante a inferência, responde 409 e não aplica a proposta antiga. Reenvios de pedidos já concluídos reutilizam a mensagem persistida sem chamar Groq. Dois pedidos simultâneos ainda podem consumir duas inferências, mas as escritas são serializadas.

Cada resposta do agente grava `AgentDecision` com intenção, ação efetiva, justificativa curta, confiança e fontes utilizadas. Metadados guardam modelo, ferramenta e contagem de tokens; não guardam raciocínio interno. O painel expandível de decisões está disponível no chat e no console; ver `DECISION_TRANSPARENCY.md`. A persistência usa as tabelas já existentes, sem nova migração.

## Testar

Com PostgreSQL Docker ativo, migrações e seed aplicados:

```sh
pnpm agent:check          # regras, banco real e propostas simuladas; sem consumo Groq
pnpm agent:check:live     # quatro chamadas reais: dúvida, consulta, abertura e reabertura
pnpm --filter web dev --port 3102
# noutro terminal:
pnpm chat:check           # regressão HTTP/SSE sem LLM
pnpm chat:check:live      # mesma regressão + uma chamada Groq pela rota Next.js
```

Os testes usam funcionários temporários e removem os dados ao terminar. `agent:check` cobre fontes, confirmação CREATE/UPDATE, isolamento, reenvio, baixa confiança, falha, pausa e mudanças concorrentes. O teste real é explícito para não consumir quotas durante verificações rotineiras.

## Organização

- `src/mastra/agents/nexo-agent.ts`: instruções e modelo configurável.
- `src/mastra/tools/service-desk-tools.ts`: ferramentas nativas de proposta; registro em `src/mastra/index.ts`.
- `src/contracts/agent.ts`: esquemas de propostas e contrato do planejador.
- `src/services/agent.ts`: chamada limitada ao Mastra e validação da ferramenta selecionada.
- `src/services/knowledge.ts`: pesquisa dos artigos.
- `src/services/conversations.ts`: execução autorizada, confirmação, concorrência e decisões persistidas.
