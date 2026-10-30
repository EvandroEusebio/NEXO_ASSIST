# Fase 4 — etapa 14: decisões transparentes

O chat do funcionário e o console do analista mostram **“Entenda esta decisão”** junto às respostas do agente. O painel abre por clique ou teclado e apresenta:

- O pedido compreendido e a ferramenta utilizada, com nomes legíveis.
- A ação efetivamente aplicada e o resultado registrado.
- A confiança estimada pelo agente e uma justificativa curta em português.
- Os artigos consultados ou o motivo da transferência, quando registrados.

A proposta do modelo e a ação final são distintas. Por exemplo, o agente pode interpretar um pedido de abertura, enquanto o serviço encontra um chamado semelhante e prepara um complemento para confirmação. O painel informa esse resultado e a regra aplicada; não afirma que um rascunho já criou ou alterou um chamado.

## Registro e apresentação

A implementação reutiliza `AgentDecision` e os metadados já persistidos. `src/services/decisions.ts` converte os registros numa resposta pública compartilhada pelo chat, HTTP/SSE e detalhe do analista. O componente `apps/web/components/decision-panel.tsx` usa o Collapsible da biblioteca UI do projeto, baseado no Base UI já instalado, com shadcn/ui e Tailwind.

As transferências registram a ferramenta realmente selecionada e a razão do encaminhamento. Quando a ação resulta diretamente de uma regra/botão, o painel identifica **“Regra do atendimento”**, sem inventar uma confiança do modelo. Respostas humanas não recebem decisões de IA.

A confiança é apenas indicativa: baixa abaixo de 65%, moderada de 65% até menos de 85% e alta a partir de 85%. A interface esclarece que não é garantia de acerto. Ausência de confiança ou ferramenta é indicada explicitamente. Mensagens antigas sem registro mostram que os detalhes não estão disponíveis; não são reconstruídos artificialmente.

## Privacidade

A autorização existente continua obrigatória: o funcionário só lê suas conversas; o console exige perfil de analista. O navegador recebe apenas os campos necessários ao painel e aos cartões do chat. Prompts, argumentos brutos de ferramentas, rastros do modelo, contagens de tokens e identificadores internos de fontes não são incluídos nessa resposta.

Os textos públicos têm tamanho limitado e ocultam e-mails e padrões reconhecíveis de credenciais. Esse filtro é uma proteção complementar; os resumos devem ser curtos e apropriados para exibição desde a geração. Não há leitura nem exposição do raciocínio interno do modelo. Registros antigos conservam sua justificativa original, quando apropriada para exibição.

Não há migração de banco, nova dependência ou chamada adicional ao modelo para abrir o painel. O projeto continua com Mastra/Groq e PostgreSQL Docker.

## Verificar

```sh
docker compose up -d --wait postgres
pnpm decisions:check
# Com a aplicação na porta 3100:
CHAT_CHECK_URL=http://localhost:3100 pnpm decisions:check --http
# Opcional: acrescenta uma chamada real ao Groq:
pnpm decisions:check --live
```

`decisions:check` cria e remove dados temporários. Verifica persistência após recarga, reenvio sem duplicação, ferramenta e ação efetiva, transferência por baixa confiança, ações de regras, mensagens humanas, registros antigos, ocultação de metadados e permissões. `--http` verifica também as rotas dos dois perfis e o SSE.

Validação da implementação: testes de decisões por HTTP/SSE, regressões do agente e do atendimento humano, TypeScript e lint. A verificação no Chromium usa uma decisão real do Groq e cobre expansão por teclado, recolhimento, chat, console e largura móvel. Para executar o Chromium deste ambiente, `libasound2t64` foi extraída apenas em `/tmp`, sem instalação no sistema ou dependência no projeto.

Nota sobre lint: o comando padrão existente não seleciona arquivos TSX. A verificação explícita destes arquivos exigiu `--ext .tsx --parser-options '{"babelOptions":{"parserOpts":{"plugins":["jsx"]}}}'`. A execução explícita terminou sem erros, com avisos de imports usados apenas em JSX/tipos e de regras de hooks nos componentes existentes. A compilação TypeScript e os testes no navegador passaram.
