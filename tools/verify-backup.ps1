param([Parameter(Mandatory=$true)][string]$Backup)
$ErrorActionPreference='Stop'
$dump=[IO.Path]::GetFullPath($Backup)
if([IO.Path]::GetFileName($dump) -ne 'database.dump' -or !(Test-Path -LiteralPath $dump -PathType Leaf)){throw 'Selecione database.dump de um backup próprio.'}
$manifest=Get-Content -LiteralPath (Join-Path (Split-Path $dump -Parent) 'manifest.json') -Raw|ConvertFrom-Json
if($manifest.format -ne 1 -or (Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash -ne $manifest.databaseSha256){throw 'Integridade do backup inválida.'}
$container='discorda-restore-check-'+[Guid]::NewGuid().ToString('N')
function Docker([string[]]$Arguments){$old=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$result=& docker.exe @Arguments 2>&1;$code=$LASTEXITCODE}finally{$ErrorActionPreference=$old};if($code -ne 0){throw 'Falha no teste isolado de restauração. Confira Docker e espaço disponível.'};return $result}
try {
 # Disposable database: no network, published ports, host mounts or production volumes.
 # Trust is confined to this networkless test container. Restore only your own backups.
 Docker @('run','--detach','--name',$container,'--network','none','--memory','768m','--cpus','1','--label','discorda.restore-test=true','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17.9-alpine')|Out-Null
 $ready=$false
 for($i=0;$i -lt 45;$i++){try{Docker @('exec',$container,'pg_isready','-U','postgres')|Out-Null;$ready=$true;break}catch{Start-Sleep -Seconds 1}}
 if(!$ready){throw 'Banco de teste não iniciou.'}
 Docker @('cp',$dump,($container+':/tmp/restore.dump'))|Out-Null
 Docker @('exec',$container,'createdb','-U','postgres','verification')|Out-Null
 Docker @('exec',$container,'pg_restore','-U','postgres','-d','verification','--no-owner','--no-privileges','--single-transaction','--exit-on-error','/tmp/restore.dump')|Out-Null
 $tables=(Docker @('exec',$container,'psql','-U','postgres','-d','verification','-Atc',"SELECT count(*) FROM information_schema.tables WHERE table_schema='discorda';")|Out-String).Trim()
 if($tables -notmatch '^\d+$' -or [int]$tables -eq 0){throw 'O backup não contém as tabelas esperadas do Discorda.'}
 @{verifiedAt=[DateTime]::UtcNow.ToString('o');databaseSha256=$manifest.databaseSha256;tables=[int]$tables;isolatedRestore=$true}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path (Split-Path $dump -Parent) 'restore-verification.json')
 'Restauração verificada em banco descartável, sem alterar o servidor.'
} finally {
 if($container -match '^discorda-restore-check-[a-f0-9]{32}$'){Docker @('rm','-f','-v',$container)|Out-Null}
}
