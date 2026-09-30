$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$hostFile = Join-Path $root '.discorda/host.json'
if (!(Test-Path -LiteralPath $hostFile)) { throw 'Configure .discorda/host.json com hostIp e peerIps antes de iniciar o piloto nativo.' }
$hostIp = (Get-Content -LiteralPath $hostFile -Raw | ConvertFrom-Json).hostIp
if (!(Get-NetIPAddress -IPAddress $hostIp -ErrorAction SilentlyContinue)) { throw 'Ligue o Radmin VPN antes de iniciar o Discorda.' }
$privateDir = Join-Path $root 'artifacts/radmin'
if (!(Test-Path (Join-Path $privateDir 'livekit.yaml'))) { throw 'Execute tools/setup-radmin.ps1 antes de iniciar o servidor.' }
if (!(Get-NetTCPConnection -LocalPort 7880 -State Listen -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath (Join-Path $root 'artifacts/media-lab/server/livekit-server.exe') -ArgumentList @('--config', ('"' + (Join-Path $privateDir 'livekit.yaml') + '"')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $privateDir 'livekit-out.log') -RedirectStandardError (Join-Path $privateDir 'livekit-error.log') | Out-Null
}
if (!(Get-NetTCPConnection -LocalPort 7443 -State Listen -ErrorAction SilentlyContinue)) {
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    Start-Process -FilePath 'dotnet' -ArgumentList @('run', '--no-build', '--project', ('"' + (Join-Path $root 'services/backend/Discorda.Api') + '"')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $privateDir 'api-out.log') -RedirectStandardError (Join-Path $privateDir 'api-error.log') | Out-Null
}
Write-Output 'Servidor Discorda iniciado. Mantenha este PC e o Radmin ligados durante as chamadas.'
