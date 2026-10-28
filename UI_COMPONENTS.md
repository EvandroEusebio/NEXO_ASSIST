# Componentes da interface

A biblioteca do projeto é **shadcn/ui com Tailwind CSS 4**, no estilo `base-nova`. As componentes oficiais ficam em `packages/ui/src/components` e são importadas na aplicação como `@workspace/ui/components/*`. O `components.json` de `apps/web` direciona a CLI para esse pacote partilhado.

As telas atuais usam `Button`, `Input`, `Textarea`, `Label`, `Checkbox`, `Select`, `Card`, `Badge`, `Avatar`, `Dialog` e `Alert`. O login, o chat e as páginas de chamados usam essas componentes para campos, ações, cartões, estados e diálogos. O layout do login e do chat está em classes Tailwind organizadas em `apps/web/app/login/styles.ts` e `apps/web/app/chat/styles.ts`; não há CSS Module nessas telas. As cores comuns do Nexo estão nas variáveis de `packages/ui/src/styles/globals.css`, incluindo azul de ação `#0062c4`, texto `#1b2431` e borda `#e6e8ec`.

Para acrescentar outra componente, execute a CLI shadcn a partir de `apps/web`, por exemplo:

```sh
cd apps/web
../../packages/ui/node_modules/.bin/shadcn add tooltip -y
```

A CLI instala os ficheiros no pacote `@workspace/ui`. Consulte `AUTH_DEMO.md` e `EMPLOYEE_CHAT.md` para iniciar o PostgreSQL e testar as telas.
