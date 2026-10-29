# Fase 2, etapa 7 — chat do funcionário

O login abre `/chat`. A interface segue as referências `Chat — Novo chamado` e `Chat — Consulta e transferência`: navegação lateral, mensagens, opções rápidas, cards de chamados, rascunhos com Confirmar/Editar/Cancelar e contador de mensagens. Usa as componentes shadcn/ui partilhadas descritas em `UI_COMPONENTS.md`, com estilos ajustados ao design. Inclui adaptação para telemóvel, histórico de conversas, perfil, nova conversa, estados de carregamento e reenvio após erro.

## Comportamento implementado

- Conversas e mensagens persistem no PostgreSQL. Uma ligação SSE atualiza a interface e outras abas, consultando o estado a cada 2 segundos. A sessão e a posse são verificadas também durante a ligação; o browser reconecta automaticamente.
- Cada conversa admite **30 mensagens do funcionário**, incluindo ações dos botões. Respostas do sistema não consomem o limite. A verificação e a escrita são serializadas no banco, inclusive entre abas. O histórico continua acessível após o limite; uma nova conversa inicia um novo contador.
- Reenvios usam o mesmo identificador de pedido e não duplicam a mensagem. A última vaga é reservada à resolução de um rascunho pendente; preparar um novo rascunho exige espaço para confirmar depois.
- “Meus chamados” consulta o serviço existente com a identidade da sessão. A seleção abre detalhes, estado e prazo persistido. Acesso a conversa ou chamado de outro funcionário devolve 404.
- “Novo chamado” recolhe título, descrição, tipo, categoria e prioridade. A pessoa afetada é o funcionário autenticado. Preparar ou editar o rascunho não cria um chamado. Confirmar cria o chamado e o evento na mesma transação que confirma o rascunho; versões antigas são rejeitadas e confirmações repetidas não duplicam o chamado.
- “Central de ajuda” apresenta os artigos cadastrados. “Falar com um analista” coloca a conversa em `WAITING_ANALYST`, conserva o histórico e pausa respostas automáticas. É possível acrescentar mensagens para o futuro atendimento humano.

## Limites desta etapa

Na etapa 8, texto livre passou a usar Mastra com Groq, conforme `AGENT_CORE.md`. Os botões continuam a executar ações explícitas sem consumir o LLM. Abertura e complemento de chamados usam rascunhos confirmados. Classificação por impacto/urgência e SLA, deduplicação por problema, reabertura e encaminhamento automático continuam nas etapas 9–12. O console que permite ao analista responder pertence à etapa 13.

## Executar e testar

Com o PostgreSQL Docker e as variáveis descritas em `AUTH_DEMO.md`:

```sh
docker compose up -d --wait postgres
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm --filter web dev --port 3102
```

Abra `http://localhost:3102/chat`. Noutro terminal, execute `pnpm chat:check`. Para outra porta, defina `CHAT_CHECK_URL`.

O teste usa HTTP e SSE reais, cria dois funcionários temporários e remove os seus dados ao terminar. Cobre isolamento, histórico após reconexão, resposta e cards, edição/cancelamento, versão obsoleta, confirmação concorrente, reenvio idempotente, pausa após encaminhamento e corrida pela última vaga de 30 mensagens. Verificações complementares: `pnpm db:typecheck`, `pnpm --filter web lint` e `pnpm --filter web build`.

## Organização

- `src/services/conversations.ts`: persistência, autorização, limite e operações guiadas.
- `src/contracts/chat.ts`: tipos e rótulos partilhados com a interface.
- `apps/web/app/api/conversations/`: listagem, criação, mensagens e eventos SSE.
- `apps/web/app/chat/`: página autenticada, interface e estilos.
- `prisma/migrations/20261028170000_employee_chat/`: revisão da conversa, metadados e chave de reenvio das mensagens.
