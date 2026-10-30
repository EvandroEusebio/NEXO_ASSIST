# Chat e perfil do funcionário

O chat segue as referências de consulta/transferência e novo chamado: navegação lateral de 232 px, cabeçalho de 64 px, conteúdo de até 808 px, balões de 600/520 px, cartões com rodapé de ações e compositor fixo na área de atendimento. O histórico e a criação de conversas continuam acessíveis no menu expandível “Conversas e histórico”. A transparência das decisões e os recibos de leitura foram preservados.

“Meu perfil” abre `/profile`, protegida pela sessão de funcionário. A página reutiliza a navegação e mostra nome/e-mail reais, com cartões de 600 px e adaptação para dispositivos móveis. O e-mail é somente leitura.

O botão “Redefinir senha” abre as instruções do acesso de demonstração. Não há senha armazenada nem serviço de envio de e-mail: por isso a interface não inventa uma data de alteração nem confirma um envio inexistente. A integração com um provedor corporativo fica necessária para redefinição real.

A presença mantém-se durante a navegação e não depende do foco. A leitura de mensagens continua a exigir foco, página visível e fim da conversa visível. Ver `CONVERSATION_ACTIVITY.md`.

## Validação

Passaram TypeScript, build de produção com Webpack e o teste de atividade no PostgreSQL. No Chromium, duas sessões independentes verificaram digitação, não lidas, recibos, preservação de mensagens não lidas em segundo plano, navegação chat/perfil, renovação periódica da presença sem reload, diálogo de senha, logout e ausência de overflow horizontal em 390 px. O acesso anónimo a `/profile` redirecionou para `/login`. O lint terminou sem erros, com avisos da configuração existente para JSX/tipos.
