#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$compose = Join-Path $root 'infra/compose/selfhost.yml'
$environmentFile = Join-Path $root '.discorda/selfhost/compose.env'
if (!(Test-Path -LiteralPath $environmentFile)) { throw 'Execute tools/setup-selfhost.ps1 primeiro.' }
& (Join-Path $PSScriptRoot 'harden-database.ps1')
docker compose --env-file $environmentFile -f $compose up -d --build
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível iniciar o servidor. Consulte docker compose logs (instruções no README).' }
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try { $response = Invoke-WebRequest 'http://localhost:18080/health/ready' -TimeoutSec 3; if ($response.StatusCode -eq 200) { $ready = $true; break } } catch { }
    Start-Sleep -Seconds 2
}
if (!$ready) { throw 'Os containers iniciaram, mas a API ainda não está pronta. Consulte os logs antes de convidar amigos.' }
Write-Output 'Servidor pronto. Painel: http://localhost:18080/admin/index.html'
Write-Output 'Entre com Google, autorize os e-mails e gere a política de Firewall para os IPs Radmin dos amigos.'
