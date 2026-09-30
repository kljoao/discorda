# Fase 4 — grupo, canais e chat persistente

Este relatório registra a entrega da fase 4. A consulta a cada cinco segundos e a ausência de presença foram substituídas pela [fase 5](phase-5-realtime.md), com SignalR e recuperação de histórico após reconexão.

O desktop autenticado abre o workspace **Nosso grupo**, com canais `geral`, `jogos` e `aleatorio`. Membros da whitelist entram nesse único workspace como Member; não recebem administração automaticamente. A conta inicial indicada pelo usuário recebeu Owner pelo comando administrativo local. Owners podem criar canais de texto.

## Funcionalidades

- Histórico de 50 mensagens por página, com cursor pelo ID bigint enviado ao JavaScript como string.
- Texto de até 4.000 caracteres, emojis Unicode, quebras de linha e links HTTP/HTTPS abertos por clique no navegador do sistema. HTML é texto; não há preview que faça requisições a links recebidos.
- Respostas apenas a mensagens do mesmo canal; edição/exclusão somente pelo autor.
- Exclusão lógica remove o corpo, preservando posição e referência. Edição/exclusão exigem a versão atual; conflitos retornam 409.
- Envio idempotente por autor/clientId, com índice único e INSERT ON CONFLICT. Reenviar após resposta perdida retorna a mesma mensagem. A interface preserva o identificador durante a tentativa pendente e troca de canal.
- Rascunhos ficam na memória durante a sessão, por canal. Não há outbox em disco nem garantia de recuperação após fechar o app.
- Atualização por consulta a cada cinco segundos enquanto a janela está visível. SignalR/presença entram na fase seguinte. Alterações de mensagens antigas fora das últimas 50 exigem recarregar o canal/histórico; não há sincronização completa por eventos ainda.

## Autorização e IPC

Todas as rotas `/api/v1/chat` exigem Supabase JWT válido, identidade Google confirmada, whitelist e sessão local não revogada. Cada consulta/mutação verifica o canal ativo, tipo Text e vínculo com o workspace. IDs de outro workspace ou canal desconhecido retornam 404. O renderer recebe dados do chat, sem access/refresh token; o Main aceita apenas ações tipadas e valida IDs, tamanho, versões e protocolos. Não existe proxy HTTP genérico no preload.

## Banco e operação

Migration `PersistentChat` aplicada no Supabase, com workspace/canais iniciais e tabela `discorda.messages`. Não foram enviadas mensagens de teste ao grupo real. Os testes de escrita usam PostgreSQL isolado em containers e fixtures próprias.

Migrations precisam da conexão administrativa `ConnectionStrings:Supabase`, passada como override `ConnectionStrings__Database` somente no processo administrativo. A conexão ativa da API continua sendo a role restrita de runtime. Após esta migration, aplicar `infra/chat-runtime-grants.sql` como administrador (feito nesta máquina).

```powershell
# Com a conexão administrativa configurada no processo:
dotnet ef database update --project services/backend/Discorda.Infrastructure --startup-project services/backend/Discorda.Api
dotnet run --project services/backend/Discorda.Api -- workspace owner email-autorizado@example.com
```

O comando de Owner exige whitelist habilitada e login real anterior. O workspace não ganha um Owner pela ordem de chegada dos usuários. A migration reversa remove a tabela de mensagens (e seu histórico), mas preserva workspace/canais; não executar rollback destrutivo sem backup.

## Validação

16 testes backend passaram, com PostgreSQL real: paginação, primeiro envio concorrente, replay, disputa de versão, edição/exclusão por autor, referência entre canais, limite de texto, acesso anônimo e Owner. 12 testes unitários do desktop passaram. Os três testes de interface passaram, incluindo o chat com perda simulada da resposta e recuperação sem duplicação. O mock de login está apenas no arquivo de teste, sem bypass no produto.

Os testes Electron agora usam diretórios temporários independentes de userData. Durante a validação inicial, um teste antigo usou o perfil padrão e removeu a sessão local ao exercitar falha de login; a falha de isolamento foi corrigida. Pode ser necessário entrar novamente no Google nesta atualização.

Voz, vídeo, presença, typing, anexos e notificações ainda não fazem parte desta entrega. A VPS permanece sem implantação.
