# Fase 2, etapa 5 — serviço simulado de chamados

`src/services/tickets.ts` implementa o serviço com PostgreSQL/Prisma, independente de Mastra e da interface. Não requer modelo de IA nem alteração do esquema.

```ts
import { getPrismaClient } from "./src/lib/prisma"
import { createTicketService } from "./src/services/tickets"

const tickets = createTicketService(getPrismaClient())
// employeeId deve vir da sessão validada no backend.
const mine = await tickets.list(employeeId, { status: "OPEN", take: 20 })
const detail = await tickets.get(employeeId, ticketNumber)
```

| Operação                                            | Contrato                                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list(employeeId, filters?)`                        | Somente chamados abertos pelo funcionário; filtro opcional de estado, paginação `take` (1–100) e `skip`; mais recentes primeiro.                 |
| `get(employeeId, number)`                           | Chamado e eventos; ausente ou de outro dono resulta no mesmo `NOT_FOUND`.                                                                        |
| `create(employeeId, input)`                         | Título, descrição, tipo, categoria, prioridade e pessoa afetada; número único com prefixo INC/REQ, estado OPEN e evento CREATED.                 |
| `update(employeeId, number, patch)`                 | Altera conteúdo/classificação; rejeita patch vazio, campos desconhecidos, mudança de tipo e chamados resolvidos/encerrados.                      |
| `transfer(employeeId, number, { reason, summary })` | Coloca chamado ativo em WAITING_ANALYST e guarda contexto em TRANSFERRED. Repetir a transferência de um chamado já na fila não duplica o evento. |

O dono e a pessoa afetada precisam ser funcionários existentes. Ser a pessoa afetada não concede acesso ao chamado. O identificador do dono vem exclusivamente do backend; este módulo não autentica pedidos HTTP. Nenhuma operação é exposta diretamente ao browser ou registada como ferramenta do agente nesta etapa.

Cada escrita e o seu evento são atómicos. Transações serializáveis detetam conflitos concorrentes sem repetir automaticamente escritas. `TicketServiceError.code` distingue `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`, `CONFLICT` e `UNAVAILABLE`. Erros inesperados continuam a ser lançados para diagnóstico interno; a futura camada HTTP deve ocultá-los do cliente.

Para simular indisponibilidade sem falhas aleatórias:

```ts
const unavailable = createTicketService(getPrismaClient(), {
  isUnavailable: () => true,
})
// Lança UNAVAILABLE antes de consultar ou alterar o banco.
```

## Validação

Com `DATABASE_URL` configurada e migrações aplicadas:

```sh
pnpm db:typecheck
pnpm tickets:check
```

O teste cria utilizadores temporários e cobre consulta por funcionário (incluindo pessoa afetada diferente do dono), leitura/escrita indevida, validação, histórico, transferência repetida, estados terminais, falha simulada, ligação indisponível e releitura após reconexão. Remove os seus dados ao terminar, sem depender do seed.

## Integração nas próximas etapas

O login e as rotas HTTP de leitura da etapa 6 usam a sessão para fornecer o `employeeId` a este serviço; consulte `AUTH_DEMO.md`. Classificação automática e cálculo de prazos pertencem à etapa 9; este serviço recebe classificação explícita e não inventa prazos. Confirmação por rascunho, deduplicação e reabertura pertencem às etapas 10–11: `create` e `update` são primitivas internas e só devem ser chamadas pelo futuro fluxo de confirmação. A transferência aqui altera o chamado; a posse/pausa da conversa e o console do analista pertencem às etapas 12–13.
