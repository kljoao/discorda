param([Parameter(Mandatory=$true)][string]$StatusPath)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$source=Get-Content -LiteralPath $StatusPath -Raw | ConvertFrom-Json
# Only operational metadata crosses into the API volume, never backup paths or secrets.
$status=@{status=$source.status;checkedAt=$source.checkedAt;lastVerified=$source.lastVerified} | ConvertTo-Json -Compress
$envFile=Join-Path $root '.discorda/selfhost/compose.env'
if(Test-Path -LiteralPath $envFile){
 $status | & docker.exe compose --env-file $envFile -f (Join-Path $root 'infra/compose/selfhost.yml') run --rm --no-deps -T --entrypoint sh api -c 'cat > /app/state/backup-status.json.tmp && mv /app/state/backup-status.json.tmp /app/state/backup-status.json'
 if($LASTEXITCODE -ne 0){throw 'O backup tem registro local, mas o painel da API não pôde receber o resumo.'}
}
