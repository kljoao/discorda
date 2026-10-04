$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root
$testId='paneltest'+[Guid]::NewGuid().ToString('N')
$testRoot=Join-Path (Get-Location) ('artifacts/'+$testId)
New-Item -ItemType Directory -Path (Join-Path $testRoot 'tools'),(Join-Path $testRoot 'infra/compose'),(Join-Path $testRoot '.discorda/selfhost') -Force|Out-Null
Copy-Item tools/verify-backup.ps1 (Join-Path $testRoot 'tools/verify-backup.ps1')
Copy-Item tools/host-operations.ps1 (Join-Path $testRoot 'tools/host-operations.ps1')
$compose=Join-Path $testRoot 'infra/compose/selfhost.yml'
@"
name: $testId
services:
  postgres:
    image: postgres:17.11-alpine3.23
    environment:
      POSTGRES_DB: discorda
      POSTGRES_USER: discorda
      POSTGRES_HOST_AUTH_METHOD: trust
  api:
    image: postgres:17.11-alpine3.23
    command: [sleep, infinity]
  livekit:
    image: postgres:17.11-alpine3.23
    command: [sleep, infinity]
"@|Set-Content $compose
Set-Content (Join-Path $testRoot '.discorda/selfhost/settings.json') '{"Admin":{"Email":"fixture@example.test"}}'
foreach($file in @('compose.env','postgres-password','server.pfx','livekit.yaml','migration.json')){Set-Content (Join-Path $testRoot ('.discorda/selfhost/'+$file)) ''}
function TestDocker([string[]]$a){$old=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$r=& docker @a 2>&1;$code=$LASTEXITCODE}finally{$ErrorActionPreference=$old};if($code -ne 0){throw ($r|Out-String)};return $r}
try{
 TestDocker @('compose','-f',$compose,'up','-d','postgres')|Out-Null
 $id=(TestDocker @('compose','-f',$compose,'ps','-q','postgres')|Out-String).Trim()
 for($i=0;$i -lt 30;$i++){& docker exec $id pg_isready -U discorda -d discorda 2>$null|Out-Null;if($LASTEXITCODE -eq 0){break};Start-Sleep -Seconds 1}
 TestDocker @('exec',$id,'psql','-U','discorda','-d','discorda','-c','CREATE SCHEMA discorda; CREATE TABLE discorda.fixture(value integer); INSERT INTO discorda.fixture VALUES (42);')|Out-Null
 & (Join-Path $testRoot 'tools/host-operations.ps1') -Action backup
 $dump=(Get-ChildItem (Join-Path $testRoot '.discorda/backups') -Recurse -Filter database.dump).FullName
 & (Join-Path $testRoot 'tools/verify-backup.ps1') -Backup $dump
 if(!(Test-Path -LiteralPath (Join-Path (Split-Path $dump -Parent) 'restore-verification.json'))){throw 'Isolated verification did not produce a report'}
 $refused=$false;try{& (Join-Path $testRoot 'tools/host-operations.ps1') -Action restore -Value $dump}catch{if($_.Exception.Message -like '*banco precisa estar vazio*'){$refused=$true}else{throw}}
 if(!$refused){throw 'Nonempty restore was not refused'}
 TestDocker @('exec',$id,'psql','-U','discorda','-d','discorda','-c','DROP SCHEMA discorda CASCADE;')|Out-Null
 & (Join-Path $testRoot 'tools/host-operations.ps1') -Action restore -Value $dump
 $value=(TestDocker @('exec',$id,'psql','-U','discorda','-d','discorda','-Atc','SELECT value FROM discorda.fixture;')|Out-String).Trim()
 if($value -ne '42'){throw 'Restore did not recover fixture'}
 'PASS: backup, hash, refusal of nonempty database and atomic restore into empty database.'
}catch{$failure=$_}finally{$previous=$ErrorActionPreference;try{$ErrorActionPreference='Continue';& docker compose -f $compose down -v 2>&1|Out-Null}finally{$ErrorActionPreference=$previous}}
if($failure){throw $failure}
