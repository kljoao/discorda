# Fase 1 — Fundação

Implementada em 28/09/2026 após aprovação da arquitetura. Esta entrega prepara a base; não inclui autenticação, chat ou mídia.

## Entregue

- Monorepo npm workspaces + solução .NET, dependências fixadas e lockfiles.
- Electron Main/preload/renderer separados, sandbox, contextIsolation, sem Node no renderer, protocolo app://, CSP de produção sem scripts inline e IPC com validação de origem/frame/janela/argumentos.
- Captura, downloads, popups e permissões negados enquanto seus fluxos não existem.
- React/Vite/Tailwind, botão com padrão shadcn/Radix e tela inicial com identidade visual própria.
- Diagnóstico de API/banco por IPC com destino fixo, timeout, coalescência e intervalo mínimo entre consultas.
- API .NET 10 em Api/Core/Infrastructure, Serilog JSON, rate limiting, erros mínimos e health checks separados.
- EF Core/Npgsql, schema privado discorda e migration para usuários, whitelist, workspace, membros e canais. Nenhuma rota pública de leitura/escrita desses dados.
- PostgreSQL local em Compose; Dockerfile não root da API; CI para .NET, testes, Docker e desktop Windows.
- Instalador NSIS de prévia e instruções de desenvolvimento.
- ADRs marcados como aceitos.

## Validação realizada

| Verificação | Resultado |
|---|---|
| TypeScript e build Vite/Electron | Passaram |
| Vitest: fronteiras de IPC, origens, caminhos e URLs | 4 testes passaram |
| Playwright: desktop compilado e modo Vite | 2 testes passaram |
| Executável Windows empacotado/ASAR | Smoke passou; teste de desenvolvimento corretamente omitido neste modo |
| .NET + PostgreSQL real com Testcontainers | 4 testes passaram |
| Migration reaplicada, constraints e readiness antes/depois de migrar | Verificados nos testes de integração |
| Coerência modelo/migration | Sem alterações pendentes |
| Restore NuGet em locked mode | Passou |
| Build da imagem Docker | Passou |
| Execução da imagem Docker | /health/live retornou 200, processo com UID 1654 (não root) |
| API local com banco migrado | /health/live e /health/ready retornaram 200 |
| npm audit de dependências de produção | Nenhuma vulnerabilidade reportada nesta execução |

Os testes detectaram e permitiram corrigir a resolução antecipada da conexão PostgreSQL no container de dependências e a política CSP necessária para o preâmbulo do Vite em desenvolvimento. A exceção de scripts inline existe apenas no modo Vite não empacotado.

A interface foi inspecionada por captura do Electron. O instalador foi gerado, mas não foi instalado no perfil do usuário: o teste executou o binário empacotado em release/win-unpacked. Pipeline GitHub foi escrito; ainda não foi executado em um repositório remoto.

## Ambiente local preparado

Foi criado `.env` ignorado pelo Git com senha aleatória exclusiva do PostgreSQL local. A conexão correspondente foi guardada em user-secrets do projeto da API, fora do repositório. Não houve acesso a Supabase, Google Cloud ou VPS.

O container `discorda-dev-postgres-1` pode permanecer ativo para desenvolvimento, expondo somente 127.0.0.1:54322. Para pará-lo sem apagar dados:

```powershell
docker compose --env-file .env -f infra/compose/development.yml stop
```

Na máquina já preparada, não sobrescrever `.env` nem repetir a configuração de senha. Para iniciar os serviços, usar dois terminais na raiz:

```powershell
# Terminal 1
npm run api
# Terminal 2
npm run dev
```

Se o container estiver parado, executar antes `docker compose --env-file .env -f infra/compose/development.yml up -d --wait`.

## Limites e próxima etapa

- Instalador de prévia sem assinatura (Authenticode: NotSigned), ícone padrão Electron e sem auto-update.
- Nenhuma conta, convite, mensagem ou chamada simulada como real.
- API de produção ainda não tem proxy TLS, domínio ou autenticação; Dockerfile não constitui deploy público.
- A configuração do desktop empacotado aceita apenas endpoint HTTPS, sem URL de produção predefinida.
- A próxima fase é Google OAuth/PKCE, whitelist efetiva e sessões. Será necessário configurar o cliente Google Desktop real e a lista inicial de contas autorizadas; secrets deverão permanecer no backend.
- Antes do deploy/mídia externa, ainda faltam dados da VPS, domínio e orçamento. A aprovação da arquitetura não fornece esses valores.

Nenhum commit, push, publicação ou modificação dos diretórios externos discorda-frontend/discorda-backend foi realizado.
