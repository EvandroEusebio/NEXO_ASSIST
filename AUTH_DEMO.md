# Fase 2, etapa 6 — login de demonstração

O login aceita os cinco funcionários do seed com e-mail `@nexo.com.br` e qualquer senha **não vazia**. Analistas e utilizadores não marcados para demonstração não entram nesta área. A senha não é armazenada nem verificada; este fluxo existe apenas para a demonstração do desafio.

A sessão dura no máximo sete dias. Com “Manter conectado” desmarcado, o cookie dura apenas a sessão do navegador. O browser guarda um cookie HTTP-only, SameSite=Lax e Secure em produção. O PostgreSQL guarda apenas o hash SHA-256 do token aleatório. O logout remove a sessão do banco. As páginas e rotas de chamados obtêm o funcionário pela sessão; um chamado de outro funcionário devolve 404.

## Executar localmente

```sh
docker compose up -d --wait postgres
```

Adicione a linha `DATABASE_URL` de `.env.example` ao `.env` da raiz (preserve as outras variáveis existentes) e copie `.env.example` para `apps/web/.env.local`. Depois:

```sh
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm --filter web dev
```

Abra `http://localhost:3000/login`. Use, por exemplo, `ana.souza@nexo.com.br` ou `bruno.tavares@nexo.com.br` com qualquer senha não vazia. O login abre `/chat`, documentado em `EMPLOYEE_CHAT.md`. A página `/tickets` também lista apenas os chamados da conta atual. O volume do Docker conserva os dados entre reinícios; `docker compose down` para o serviço sem apagar o volume.

## Verificar

Inicie a aplicação na porta 3100 com `pnpm --filter web dev --port 3100` e execute `pnpm auth:check` noutro terminal. O teste HTTP verifica login de Ana e Bruno, rejeição de analista e e-mail desconhecido, sessões distintas, listas isoladas, 404 para acesso cruzado e revogação após logout. Também há `pnpm db:typecheck`, `pnpm --filter web lint` e `pnpm --filter web build`.

Rotas disponíveis: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`, `GET /api/tickets` e `GET /api/tickets/:number`. A criação está disponível pelo rascunho confirmado do chat; alterações e reaberturas serão integradas nas próximas etapas.

A tela de identificação segue a referência visual em `docs/Identificação (desktop) (1).png`, com adaptação para telemóvel. Os controlos usam a biblioteca shadcn/ui do projeto, documentada em `UI_COMPONENTS.md`. O controlo do olho alterna a visibilidade da senha; os links de ajuda e privacidade abrem informações da demonstração. A conversa e os indicadores do painel esquerdo são ilustrativos.
