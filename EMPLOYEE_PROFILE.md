# Chat e perfil do funcionário

O chat segue as referências de consulta/transferência e novo chamado: navegação lateral de 232 px, cabeçalho de 64 px, conteúdo de até 808 px, balões de 600/520 px, cartões com rodapé de ações e compositor fixo na área de atendimento. O histórico e a criação de conversas continuam acessíveis no menu expandível “Conversas e histórico”. A transparência das decisões e os recibos de leitura foram preservados.

“Meu perfil” abre `/profile`, protegida pela sessão de funcionário. A página reutiliza a navegação e mostra nome/e-mail reais, com cartões de 600 px e adaptação para dispositivos móveis. O e-mail é somente leitura.

O botão “Alterar senha” abre um formulário funcional com senha atual, nova senha e confirmação. O perfil mostra a data real de alteração. As senhas são guardadas como hashes scrypt com salt, e as outras sessões são encerradas após a alteração. A recuperação por e-mail continua fora deste fluxo. Credenciais e detalhes em `AUTH_DEMO.md`.

A presença mantém-se durante a navegação e não depende do foco. A leitura de mensagens continua a exigir foco, página visível e fim da conversa visível. Ver `CONVERSATION_ACTIVITY.md`.

## Validação

Passaram TypeScript, build de produção com Webpack e o teste de atividade no PostgreSQL. No Chromium, duas sessões independentes verificaram digitação, não lidas, recibos, preservação de mensagens não lidas em segundo plano, navegação chat/perfil, renovação periódica da presença sem reload, diálogo de senha, logout e ausência de overflow horizontal em 390 px. O acesso anónimo a `/profile` redirecionou para `/login`. O lint terminou sem erros, com avisos da configuração existente para JSX/tipos.

## Consulta de chamados no chat

A área de conversa acompanha a referência: lista de 808 px com linhas compactas, seleção azul do chamado consultado, balões escuros mais baixos para o funcionário e cartão com quatro colunas de informações. O cartão vem antes da mensagem de acompanhamento. A última atualização aparece em tempo relativo; a data completa fica disponível no tooltip. O vencimento usa o prazo real do chamado.

“Adicionar informação” prepara o compositor com o número do chamado para o funcionário completar e enviar pelo fluxo existente. “Não, obrigado” dispensa as opções daquela resposta na página atual. A transferência continua usando a ação já existente. As decisões permanecem acessíveis no painel expandível. Em dispositivos móveis, as informações e linhas adaptam-se à largura disponível.

Validação deste ajuste: TypeScript e build Webpack passaram. No Chromium, uma sessão com três chamados confirmou largura de 808 px, linhas de 46 px, atualização da seleção ao trocar de chamado, foco e preenchimento do compositor, dispensa das opções, transferência real para a fila humana e ausência de overflow em 390 px.

A seleção de chamados continua disponível durante a espera pelo analista, atendimento humano, encerramento e limite de mensagens. Nesses estados, abre um cartão de consulta com os dados já autorizados do snapshot, sem enviar mensagens, consumir o limite ou executar o agente. No atendimento automático, mantém o fluxo normal da conversa.

O layout tolera atributos externos inseridos no próprio `body` antes da hidratação, como `cz-shortcut-listen`. A tolerância fica apenas nesse elemento; a hidratação dos componentes internos continua a ser verificada.

Regressão verificada em desenvolvimento: seleção após transferência real por vencimento, analista ativo, conversa encerrada e limite de 30 mensagens. As consultas não criaram mensagens adicionais. A injeção do atributo externo antes da hidratação não produziu o aviso; TypeScript e formatação passaram.
