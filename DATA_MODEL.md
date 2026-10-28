# Fase 1, etapa 3 — modelo e persistência

O modelo usa PostgreSQL com Prisma ORM. O esquema está em `prisma/schema.prisma`; a migração inicial fica em `prisma/migrations`. `src/lib/prisma.ts` cria o cliente com o adaptador oficial PostgreSQL e reutiliza a ligação durante o desenvolvimento.

| Entidade        | Dados persistidos                                                            |
| --------------- | ---------------------------------------------------------------------------- |
| `User`          | Funcionário ou analista, identificado por e-mail único.                      |
| `AuthSession`   | Hash do token, funcionário e prazo da sessão de demonstração.                |
| `Conversation`  | Funcionário, analista responsável, estado e datas.                           |
| `Message`       | Autor, texto e ordem temporal de cada conversa.                              |
| `Ticket`        | Número único, dono, pessoa afetada, classificação, estado e próximos prazos. |
| `TicketDraft`   | Operação proposta, dados para confirmação, versão e estado.                  |
| `HelpArticle`   | Artigos e etiquetas da central de ajuda.                                     |
| `AgentDecision` | Intenção, ação e justificativa de uma resposta da IA.                        |
| `TicketEvent`   | Histórico de alterações dos chamados.                                        |

As relações e índices permitem consultar conversas por funcionário, a fila do analista e chamados do respetivo dono. Apagar uma conversa remove as mensagens, os rascunhos e as decisões associadas. Chamados e utilizadores não são removidos por essa operação.

## Preparação

1. Iniciar o PostgreSQL local com `docker compose up -d --wait postgres` e copiar a linha `DATABASE_URL` de `.env.example` para `.env`. Para a aplicação web, copiar `.env.example` para `apps/web/.env.local`.
2. Executar `pnpm install` (gera o cliente Prisma) e `pnpm db:deploy` para aplicar a migração existente. Para criar uma migração após alterar o esquema, usar `pnpm db:migrate --name <nome>` e `pnpm db:generate`.
3. Executar `pnpm db:smoke`. O script grava uma conversa e uma decisão, fecha a ligação, relê os dados com outra ligação e remove os dados temporários.

O esquema define a estrutura. A etapa 6 acrescentou autenticação e autorização de leitura por sessão. As próximas etapas implementarão transições válidas de estado, cálculo de SLA, validação do rascunho e confirmação antes de alterar chamados. Essas regras pertencem aos serviços da aplicação e não devem depender apenas do agente de IA.
