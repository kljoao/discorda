# Desenvolvimento local (sem Docker para a API)

Este caminho é opcional. Para hospedar para amigos, siga o README e `tools/setup-selfhost.ps1`.

Instale Node 24, .NET SDK 10 e Docker Desktop. Na raiz:

```powershell
npm ci
dotnet tool restore
dotnet restore Discorda.slnx --locked-mode
Copy-Item .env.example .env
# Edite POSTGRES_PASSWORD com uma senha local antes de continuar.
docker compose --env-file .env -f infra/compose/development.yml up -d --wait
dotnet user-secrets set 'ConnectionStrings:Database' 'Host=127.0.0.1;Port=54322;Database=discorda;Username=discorda_dev;Password=SUA_SENHA;Maximum Pool Size=10' --project services/backend/Discorda.Api
dotnet user-secrets set 'Supabase:Url' 'https://SEU_PROJETO.supabase.co' --project services/backend/Discorda.Api
dotnet user-secrets set 'Supabase:PublishableKey' 'SUA_CHAVE_PUBLISHABLE' --project services/backend/Discorda.Api
$env:ASPNETCORE_ENVIRONMENT = 'Development'
npm run db:migrate
npm run api
```

A API usa o UserSecretsId genérico `discorda-development`, não lê `.env` diretamente. A porta padrão é 5080, apenas loopback. Configure e-mail permitido com `dotnet run --project services/backend/Discorda.Api -- whitelist allow admin@example.com`. Configure `Admin:Email` em user-secrets somente se precisar testar o painel.

Em outro terminal, execute `npm run dev` para Electron/Vite. O desktop instalado exige HTTPS e arquivo de conexão; use o assistente self-host para testar com outros computadores. Os scripts antigos `setup-radmin.ps1`/`start-radmin.ps1` são auxiliares do piloto nativo e exigem LiveKit/configuração manual, não substituem a receita atual.

Validação: `npm test`, `npm run build`, `npm run test:desktop`, `dotnet test Discorda.slnx -c Release` (Docker em execução). O comando `npm run package:win` gera build comunitária; não exige a chave de assinatura do mantenedor.
