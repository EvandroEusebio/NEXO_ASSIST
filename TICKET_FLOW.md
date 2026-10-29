# Fase 3, etapas 10–11 — consulta, duplicidade e confirmação

O funcionário pode listar os próprios chamados sem indicar número. O chat mostra estado e prazo; a consulta de um número e a procura de problemas relacionados usam sempre o identificador da sessão, sem expor chamados de outras pessoas.

Antes de preparar uma abertura, o backend procura chamados do mesmo funcionário e pessoa afetada com **tipo e categoria iguais** e semelhança forte entre título/descrição. Um único chamado ativo gera um rascunho de **complemento**; um resolvido há até 7 dias gera um rascunho de **reabertura**. Se houver vários candidatos, o chat mostra-os para seleção. Um relato idêntico ao de um chamado ainda ativo apenas apresenta esse chamado. Chamados encerrados ou resolvidos há mais de 7 dias não são reabertos.

O funcionário revê, edita, confirma ou cancela o rascunho. Criação, complemento e reabertura só alteram o chamado após a confirmação vinculada ao ID e à versão persistidos. A confirmação verifica novamente posse, estado, versão do chamado e duplicidade. O serviço usa um bloqueio transacional por funcionário para impedir duas aberturas simultâneas do mesmo problema. Uma reabertura mantém o número, regista `REOPENED`, volta para `OPEN` e inicia novo prazo de resposta.

A busca de semelhança é conservadora: evita juntar automaticamente incidentes distintos que apenas usam palavras genéricas. Quando houver dúvida, o funcionário seleciona o chamado. Não são necessários embeddings nem serviço externo adicional.

## Verificação

Com PostgreSQL do Docker ativo:

```sh
node --import tsx scripts/check-ticket-matching.ts
node --import tsx scripts/check-tickets.ts
node --import tsx scripts/check-agent.ts
```

O teste HTTP/SSE continua em `scripts/check-chat.ts` com o servidor web na porta 3102. O teste real de Groq é opcional e usa `scripts/check-agent.ts --live`.
