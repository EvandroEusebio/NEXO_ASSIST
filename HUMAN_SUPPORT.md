# Fase 4 — etapas 12 e 13

O funcionário pode pedir um analista pelo chat ou pelo botão de um chamado. A conversa entra em `WAITING_ANALYST`, conserva o histórico e regista um resumo com o motivo, as últimas mensagens do funcionário e o chamado associado. O assistente deixa de responder; novas mensagens do funcionário continuam a ser guardadas.

A consulta de chamados críticos ou vencidos também transfere a conversa. Rascunhos críticos são encaminhados antes da confirmação, sem criar um chamado silenciosamente. Planos com confiança inferior a 0,65 são transferidos como decisão insegura. A verificação de vencimento ocorre durante a consulta/preparação do chamado, não por um agendador em segundo plano.

## Console

Entre em `/login` com `rafael.lima@nexo.com.br` ou `marta.alves@nexo.com.br` e qualquer senha não vazia. O perfil de analista abre `/analyst`. A migração `20261029120000_enable_analyst_demo` habilita estas contas existentes; o seed também as cria habilitadas.

O console usa shadcn/ui e Tailwind, seguindo a composição das Telas 4 e 5: fila à esquerda, conversa ao centro e chamados à direita. Inclui busca por nome, e-mail ou número de chamado, filtros, histórico, resumo da transferência e rascunhos pendentes. Em ecrãs pequenos, o botão “Chamados” abre o painel lateral. A fila mostra as 100 conversas mais recentes e o histórico de cada chamado mostra os últimos 20 eventos.

- **Assumir:** atribui a conversa ao analista e muda para `ANALYST_ACTIVE`.
- **Responder:** apenas o responsável pode enviar mensagens. Atualiza o prazo de resposta do chamado associado conforme o calendário de SLA existente.
- **Devolver ao agent:** liberta a atribuição e muda para `AGENT_ACTIVE`. O assistente volta a responder à próxima mensagem. Uma conversa ainda não assumida também pode ser devolvida.
- **Encerrar:** exige confirmação, fecha a conversa e expira os rascunhos. A resolução do chamado associado é opcional e vem desmarcada.

A fila e o detalhe atualizam a cada três segundos; o funcionário recebe as mensagens pelo SSE já existente. Sessões expiradas levam novamente ao login. Os analistas podem consultar a fila inteira; funcionários continuam restritos às próprias conversas e não têm acesso às APIs do console.

## Consistência e implementação

`src/services/handoff.ts` centraliza a transferência; `src/services/analyst.ts` controla o atendimento. As rotas em `/api/analyst/conversations` validam sessão, perfil e origem. Alterações usam a mesma transação e revisão da conversa utilizadas pelo chat: dois analistas não conseguem assumir simultaneamente, e respostas do modelo calculadas antes de uma transferência são rejeitadas. Cada ação recebe um identificador para evitar mensagens duplicadas em reenvios.

Nenhum provedor pago ou dependência foi acrescentado. O agente continua com Mastra/Groq; o atendimento humano funciona sem chamar o modelo. Não é necessário alterar o esquema de dados nem reinicializar o banco.

## Verificação

Com PostgreSQL Docker disponível e a aplicação na porta 3100:

```sh
pnpm db:deploy
pnpm analyst:check
pnpm auth:check
CHAT_CHECK_URL=http://localhost:3100 pnpm chat:check
pnpm agent:check
pnpm db:typecheck
pnpm --filter web typecheck
pnpm --filter web lint
```

O teste `analyst:check` cria e remove dados temporários para verificar contexto, quatro motivos de transferência, pausa, atribuição concorrente, permissões, revisão desatualizada, reenvio, resposta, SLA, devolução e encerramento. O teste do agente usa um planejador simulado e não consome a quota do Groq.

Validações executadas: tipos do backend e web, lint, testes de atendimento, autenticação HTTP, chat HTTP/SSE e regressão do agente. A página protegida `/analyst` também respondeu corretamente. A inspeção visual automatizada não pôde ser executada: o Chromium instalado não inicia por falta de `libasound.so.2`.
