# Contribuir

O código do Discorda é MIT; bibliotecas e runtimes preservam suas próprias licenças. Envie alterações pequenas com descrição do problema, resultado e validação. Não inclua configurações pessoais nos exemplos.

Leia o README para ferramentas. Rode `npm ci`, `npm test`, `npm run build`, `npm run test:desktop`, `dotnet test Discorda.slnx -c Release` com Docker disponível e `npm run audit:source`. Mudanças de autenticação/administração precisam de testes de autorização; mudanças de mídia precisam de teste real entre dois participantes. Não use contas ou banco de produção nos testes.

`npm run package:win` compila sem secrets de release. Distribuições derivadas devem usar nome/canal próprios e, se habilitarem atualização, sua própria chave de assinatura. Preserve LICENSE e avisos de terceiros. Nunca reutilize as credenciais de uma instalação de outro usuário.
