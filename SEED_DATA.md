# Fase 1, etapa 4 — dados de demonstração

O seed oficial do Prisma está em `prisma/seed.ts`. Ele cadastra **5 funcionários**, **2 analistas**, **8 artigos de ajuda** e **9 chamados**. Usa `upsert` dentro de uma transação: repetir o comando mantém a mesma quantidade de registos de exemplo e não apaga dados fora desse conjunto.

Os chamados cobrem incidente e requisição, as quatro prioridades, casos abertos, em andamento, aprovados, vencidos e resolvidos. `INC-20311` (Ana Souza) está vencido; `INC-20150` foi resolvido há quatro dias e permite testar futura reabertura; `INC-20480` foi resolvido há quinze dias; os chamados de Bruno, Carla, Diego e Elisa permitem testar isolamento por funcionário. As datas são relativas à execução para preservar esses cenários. Os prazos são ilustrativos; o cálculo de SLA será implementado na fase 3.

A central de ajuda inclui VPN/erro 809 com a restrição a Windows 10, horário do service desk, SAP, Outlook, notebook lento, permissões do SharePoint, segundo monitor e software autorizado. Estes artigos são dados de exemplo, preparados para pesquisa na etapa do agente.

## Executar

1. Configurar `DATABASE_URL` em `.env` e aplicar as migrações com `pnpm db:deploy`.
2. Executar `pnpm db:seed`. O comando chama `prisma db seed`, configurado no `prisma.config.ts`.
3. Executar `pnpm db:seed:check` para confirmar a cobertura dos cenários. Repetir `pnpm db:seed` quando quiser restaurar os exemplos. O seed atualiza os seus utilizadores, artigos e chamados pelos e-mails, IDs e números reservados.

O login e as regras de acesso ainda serão implementados. O seed não cria senhas nem sessões. Os e-mails dos funcionários de exemplo são `ana.souza@nexo.com.br`, `bruno.tavares@nexo.com.br`, `carla.mendes@nexo.com.br`, `diego.ramos@nexo.com.br` e `elisa.prado@nexo.com.br`.
