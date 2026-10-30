# Presença, mensagens não lidas e digitação

O console segue a referência `Atendente — Conversas (desktop).png`: avatares com ponto verde, indicador de disponibilidade, contadores azuis por conversa, total na barra lateral, filtros com quantidades, texto “digitando…” e confirmações de leitura. O chat do funcionário também mostra a digitação do analista, recibos e não lidas no histórico.

## Comportamento

- **Online:** a aplicação aberta renova a presença a cada 15 segundos, independentemente do foco da janela. Um componente persistente mantém a presença ao navegar entre atendimento, perfil, chamados e console; a atividade da conversa tem uma concessão independente. Desfocar não desliga o utilizador. Fechar a página envia a saída e terminar a sessão revoga todas as concessões. Se a ligação cair ou o navegador suspender a página, a presença expira em até 90 segundos; ao regressar ou recuperar a ligação, é renovada imediatamente. Outra aba aberta mantém o utilizador online.
- **Digitando:** apenas o estado é transmitido, nunca o texto ainda não enviado. O indicador é renovado durante a escrita e termina ao enviar, perder o foco, trocar de conversa ou parar de escrever por quatro segundos. No servidor expira em seis segundos. Só o analista responsável pode emitir digitação numa conversa assumida.
- **Não lidas:** cada utilizador tem o seu próprio marcador persistido. Para analistas, contam as mensagens do funcionário; para funcionários, as respostas do agente e dos analistas. Mensagens de sistema não contam. Um analista ler a conversa não limpa o contador de outro analista.
- **Leitura:** só avança quando a aba está visível, em foco e o fim do histórico está visível. Percorrer mensagens antigas ou deixar a aba em segundo plano não marca novas mensagens como lidas. A confirmação refere-se à última mensagem carregada, preservando mensagens recebidas entretanto. Conversas anteriores à funcionalidade começam sem marcador e são reconhecidas ao serem visualizadas.
- **Recibos:** um visto indica mensagem enviada; dois vistos azuis indicam leitura. Nas mensagens do funcionário, a leitura representa a visualização por um analista; nas respostas do atendimento, a visualização pelo funcionário.

As atualizações usam o SSE existente no chat (cerca de dois segundos) e a consulta periódica do console (três segundos). Os indicadores refletem dados reais, com essa pequena latência. Nenhum deles consome chamadas ao Groq.

## Implementação

A migração `20261029220000_conversation_activity` acrescenta `PresenceLease` (por aba/sessão) e `ConversationReadState` (por conversa/utilizador). As presenças são removidas ao revogar a sessão; registros expirados há mais de um dia são limpos em atualizações posteriores. Os marcadores de leitura são preservados entre acessos.

`src/services/activity.ts` valida sessão, posse da conversa e permissão para digitar. Pedidos atrasados não reativam uma digitação já encerrada e leituras antigas não fazem o marcador retroceder. A atividade não altera a revisão da conversa, evitando conflitos com o agente e as ações de atendimento.

A rota `POST /api/activity` valida a origem. O hook `use-conversation-activity.ts` coordena presença, digitação e observação do fim do histórico. Os indicadores visuais reutilizam shadcn/ui e Tailwind; não foi adicionada dependência ou serviço externo.

## Executar e verificar

```sh
docker compose up -d --wait postgres
pnpm db:generate
pnpm db:deploy
pnpm activity:check
# Com a aplicação na porta 3100:
CHAT_CHECK_URL=http://localhost:3100 pnpm chat:check
```

`activity:check` cria e remove utilizadores temporários. Cobre permissões, múltiplas abas, expiração, pedidos fora de ordem, marcadores individuais, mensagens concorrentes, persistência e logout. Para experimentar manualmente, abra um funcionário e um analista em perfis de navegador diferentes, envie mensagens, alterne entre as conversas e compare o comportamento em primeiro e segundo plano.

## Validação realizada

Passaram a verificação TypeScript do backend/web, os testes `activity:check`, a regressão HTTP/SSE do chat e a regressão do atendimento humano. No Chromium, duas sessões independentes confirmaram presença, contadores, digitação nos dois sentidos, leitura ao abrir, preservação de não lidas em segundo plano, logout e adaptação móvel.

A versão de produção foi compilada e testada com `pnpm --filter web build --webpack`. O Turbopack apresentou reinícios contínuos no modo de desenvolvimento e erro de processo auxiliar neste ambiente; o Webpack permitiu concluir a validação. O lint explícito dos novos componentes terminou sem erros, com os avisos de JSX/tipos da configuração existente.

No chat do funcionário, o estado do analista responsável aparece junto ao rótulo “Analista” nas suas mensagens. O indicador e o estado superior ficam verdes quando online e cinzentos quando offline; o estado de espera mantém o amarelo. As atualizações usam a presença real recebida por SSE, sem recarregar a página. Mensagens de outros analistas ou de atendimentos encerrados não recebem o indicador do responsável atual.
