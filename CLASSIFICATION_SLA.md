# Etapa 9 — classificação e prazos

Ao abrir um chamado, o chat recolhe **tipo** (`INC` para falha, `REQ` para pedido), categoria, impacto e urgência. O agente Mastra propõe esses dados; se faltarem informações, pergunta ao funcionário. O backend valida a combinação e calcula a prioridade antes de mostrar o rascunho para confirmação. O campo `priority` enviado pelo cliente não decide a prioridade.

| Impacto e urgência | Prioridade | Prazo para primeira resposta |
| --- | --- | --- |
| Equipa ou empresa parada (`INC`) | Crítica | 1 hora corrida |
| Uma pessoa impedida de trabalhar ou compromisso hoje | Alta | 4 horas úteis |
| Incidente com alternativa temporária | Média | 3 dias úteis |
| Pedido ou melhoria sem urgência | Baixa | 5 dias úteis |

O prazo é gravado em `Ticket.nextResponseDueAt` quando o chamado é criado. Uma alteração de prioridade recalcula o prazo a partir da última resposta, ou da criação quando ainda não houve resposta. Alterações de texto preservam o prazo. Chamados abertos ultrapassando `nextResponseDueAt` são considerados vencidos; resolvidos e encerrados não são.

O calendário padrão é **segunda a sexta, 09:00–18:00, America/Sao_Paulo**. Configure `SLA_TIME_ZONE`, `SLA_WORK_START_HOUR`, `SLA_WORK_END_HOUR` e `SLA_HOLIDAYS` (datas `AAAA-MM-DD` separadas por vírgulas) para a operação. A hora crítica é corrida; as demais usam o calendário. A resposta de um analista renova o prazo do chamado associado no console, conforme `HUMAN_SUPPORT.md`.

Verificações: `node --import tsx scripts/check-ticket-rules.ts` cobre as quatro prioridades, fim de semana, feriado e vencimento; `node --import tsx scripts/check-tickets.ts` verifica a persistência no PostgreSQL do Docker; `node --import tsx scripts/check-agent.ts` cobre o rascunho e a confirmação.
