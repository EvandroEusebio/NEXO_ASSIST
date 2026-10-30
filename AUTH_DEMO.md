# Autenticação com palavra-passe

O login valida o e-mail corporativo e a senha da conta. Funcionários abrem `/chat` e analistas abrem `/analyst`. O modo anterior que aceitava qualquer senha foi substituído.

## Contas iniciais locais

| Perfil   | E-mail                    | Senha inicial            |
| -------- | ------------------------- | ------------------------ |
| EMPLOYEE | ana.souza@nexo.com.br     | `Ana@NexoAssist2026!`    |
| EMPLOYEE | bruno.tavares@nexo.com.br | `Bruno@NexoAssist2026!`  |
| EMPLOYEE | carla.mendes@nexo.com.br  | `Carla@NexoAssist2026!`  |
| ANALYST  | rafael.lima@nexo.com.br   | `Rafael@NexoAssist2026!` |
| ANALYST  | marta.alves@nexo.com.br   | `Marta@NexoAssist2026!`  |
| ANALYST  | joao.santos@nexo.com.br   | `Joao@NexoAssist2026!`   |

Estas credenciais pertencem aos dados de exemplo locais. `SEED_INITIAL_PASSWORD` permite definir outra senha inicial para contas ainda sem senha. Repetir o seed preserva senhas existentes, incluindo as alteradas pelo funcionário. Diego e Elisa permanecem nos exemplos, com login desativado; os seus chamados são preservados.

## Guardar e alterar senhas

A base guarda somente um hash `scrypt`, com salt aleatório de 16 bytes por senha. São usados `N=131072`, `r=8`, `p=1`, derivação assíncrona e comparação em tempo constante pelo `node:crypto`. O formato inclui algoritmo, parâmetros, salt e hash para permitir validação. Nenhuma senha em texto original é guardada, devolvida pelas APIs ou enviada ao agente. Referências: [Node.js](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback) e [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt).

Em **Meu perfil → Alterar senha**, o funcionário informa a senha atual, a nova e a confirmação. São aceites entre 15 e 128 caracteres, incluindo espaços; não há alteração automática de espaços nem exigências artificiais de símbolos. A nova senha deve ser diferente da atual.

Ao guardar, o hash é atualizado e as sessões anteriores são revogadas. A sessão que efetuou a alteração recebe outro token, mantendo a opção “Manter conectado” e o prazo original de validade. A atualização é atómica: tentativas simultâneas não sobrescrevem uma senha já alterada. As restantes contas continuam com as suas sessões. O perfil mostra a data real de alteração. A recuperação por e-mail não está implementada; a ajuda de login encaminha para a TI.

A sessão dura até sete dias, usa cookie HTTP-only, SameSite=Lax e Secure em produção. O banco armazena apenas SHA-256 do token aleatório. O logout e a troca de senha removem também as presenças ligadas às sessões revogadas. As APIs validam o papel e a origem das alterações; o funcionário não escolhe o ID da conta a alterar.

## Executar

```sh
docker compose up -d --wait postgres
pnpm db:generate
pnpm db:deploy
pnpm auth:seed
pnpm --filter web dev
```

`auth:seed` prepara apenas os utilizadores e as senhas, sem reescrever chamados e artigos. `pnpm db:seed` continua disponível para reconstruir os dados de exemplo completos. A migração `20261030190000_password_auth` acrescenta os campos de senha e encerra as sessões criadas antes da validação real; entre novamente após atualizar.

Não exponha `DATABASE_URL`, `GROQ_API_KEY` nem senhas do seed em variáveis `NEXT_PUBLIC_*`. O Next carrega o `.env` da raiz no servidor. Abra `/login` e use uma das contas da tabela.

## Verificar

```sh
pnpm passwords:check
# Aplicação a correr na porta 3100:
AUTH_CHECK_URL=http://localhost:3100 pnpm auth:check
AUTH_CHECK_URL=http://localhost:3100 pnpm passwords:check --http
```

Os testes usam contas temporárias para verificar hashes/salts, credenciais erradas, confirmação, limites, alteração, concorrência, sessões revogadas, isolamento, proteção de origem e idempotência do seed. Os testes de atividade, chat e transparência passaram a criar contas com hashes reais.

Rotas: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session` e `POST /api/auth/password`. O último endpoint exige sessão de funcionário e recebe somente `currentPassword`, `newPassword` e `confirmPassword`.

Validação realizada: migração aplicada no PostgreSQL do Docker; seis logins verificados por HTTP; hashes/salts, alteração e concorrência testados; rejeição da senha anterior e renovação do cookie confirmadas. No Chromium, o formulário do perfil manteve a sessão atual, desconectou outro navegador e funcionou em 390 px. Também passaram TypeScript backend/web, Prisma validate, build Webpack, regressão de presença e chat HTTP/SSE.
