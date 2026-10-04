param([ValidateSet('status','start','stop','backup','restore','admin','readadmin','verifybackup','schedule','unschedule')][string]$Action='status',[string]$Value)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$selfHost=Test-Path -LiteralPath (Join-Path $root '.discorda/selfhost/compose.env')
$settingsPath=if($selfHost){Join-Path $root '.discorda/selfhost/settings.json'}else{Join-Path $env:APPDATA 'Microsoft/UserSecrets/discorda-development/secrets.json'}
if($selfHost -and $Action -in @('start','admin')){& (Join-Path $PSScriptRoot 'harden-database.ps1')}
$composeArgs=@('compose','--env-file',(Join-Path $root '.discorda/selfhost/compose.env'),'-f',(Join-Path $root 'infra/compose/selfhost.yml'))
function Docker([string[]]$Arguments){$previous=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$result=& docker.exe @Arguments 2>&1;$code=$LASTEXITCODE}finally{$ErrorActionPreference=$previous};if($code -ne 0){throw 'Docker recusou a operação. Confira Docker Desktop e a configuração do host.'};return $result}
function Compose([string[]]$Arguments){Docker ($composeArgs+$Arguments)}
function Ready { $url=if($selfHost){'http://127.0.0.1:18080/health/ready'}else{'http://127.0.0.1:5080/health/ready'};try{$r=Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 3;return $r.StatusCode -eq 200}catch{return $false} }
function StopNative {
 foreach($expected in @((Join-Path $root 'services/backend/Discorda.Api/bin/Debug/net10.0/Discorda.Api.exe'),(Join-Path $root 'artifacts/media-lab/server/livekit-server.exe'))){
  $absolute=[IO.Path]::GetFullPath($expected);if(!$absolute.StartsWith([IO.Path]::GetFullPath($root)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Caminho de processo inválido.'}
  Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq $absolute} | Stop-Process
 }
}
function Container {
 if(!$selfHost){
  $configuration=Get-Content -LiteralPath $settingsPath -Raw|ConvertFrom-Json
  $builder=New-Object System.Data.Common.DbConnectionStringBuilder
  $builder.set_ConnectionString($configuration.'ConnectionStrings:Database')
  if($builder.get_Item('Host') -notin @('127.0.0.1','localhost') -or [string]$builder.get_Item('Port') -ne '54322' -or $builder.get_Item('Database') -ne 'discorda' -or $builder.get_Item('Username') -ne 'discorda_dev'){throw 'Backup automático do piloto exige o PostgreSQL local padrão. Consulte o guia para bancos externos.'}
 }
 if($selfHost){$id=(Compose @('ps','-q','postgres')|Out-String).Trim()}else{$id=(Docker @('ps','--filter','label=com.docker.compose.project=discorda-dev','--filter','label=com.docker.compose.service=postgres','-q')|Out-String).Trim()}
 if($id -notmatch '^[a-f0-9]{12,64}$'){throw 'Banco Docker não encontrado ou há mais de uma instância.'};return $id
}
function ProtectFolder([string]$Path){
 $acl=New-Object Security.AccessControl.DirectorySecurity
 $acl.SetAccessRuleProtection($true,$false)
 foreach($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User,(New-Object Security.Principal.SecurityIdentifier 'S-1-5-18'))){$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule)}
 Set-Acl -LiteralPath $Path -AclObject $acl
}
Set-Location -LiteralPath $root
switch($Action){
 'verifybackup' {& (Join-Path $PSScriptRoot 'verify-backup.ps1') -Backup $Value;break}
 'schedule' {& (Join-Path $PSScriptRoot 'backup-schedule.ps1') -Action enable;break}
 'unschedule' {& (Join-Path $PSScriptRoot 'backup-schedule.ps1') -Action disable;break}
 'status' {& (Join-Path $PSScriptRoot 'backup-schedule.ps1') -Action status;$backupStatus=Join-Path $root '.discorda/backup-status.json';if(Test-Path -LiteralPath $backupStatus){$b=Get-Content -LiteralPath $backupStatus -Raw|ConvertFrom-Json;('Último backup automático: '+$b.status+' · '+$b.checkedAt);('Última restauração verificada: '+$b.lastVerified)};if(Ready){'API e banco: disponíveis.'}else{'API ou banco indisponível.'};if($selfHost){Compose @('ps','--format','table {{.Service}}\t{{.State}}\t{{.Health}}')}else{'Modo: piloto nativo. Banco gerenciado pelo Docker Desktop.'};break}
 'readadmin' {if(Test-Path -LiteralPath $settingsPath){$settings=Get-Content -LiteralPath $settingsPath -Raw|ConvertFrom-Json;if($selfHost){$settings.Admin.Email}else{$settings.'Admin:Email'}};break}
 'start' {if($selfHost){Compose @('up','-d','--build')|Out-Null}else{$devId=(Docker @('ps','-a','--filter','label=com.docker.compose.project=discorda-dev','--filter','label=com.docker.compose.service=postgres','-q')|Out-String).Trim();if($devId -notmatch '^[a-f0-9]{12,64}$'){throw 'Configure o servidor primeiro pelo assistente setup-selfhost.ps1 ou pelo guia do piloto.'};Docker @('start',$devId)|Out-Null;& (Join-Path $root 'tools/start-radmin.ps1')|Out-Null};$ready=$false;for($i=0;$i -lt 20;$i++){if(Ready){$ready=$true;break};Start-Sleep -Seconds 2};if(!$ready){throw 'Serviços iniciados, mas a API/banco ainda não estão prontos.'};'Servidor pronto.';break}
 'stop' {if($selfHost){Compose @('stop')|Out-Null}else{StopNative};'Serviços parados. Dados preservados.';break}
 'backup' {
  if(!$selfHost){$configuration=Get-Content -LiteralPath $settingsPath -Raw|ConvertFrom-Json;$probe=New-Object System.Data.Common.DbConnectionStringBuilder;$probe.set_ConnectionString($configuration.'ConnectionStrings:Database');if($probe.get_Item('Host') -notin @('127.0.0.1','localhost')){& (Join-Path $PSScriptRoot 'backup-external.ps1') -SettingsPath $settingsPath;break}}
  $id=Container;$dbUser=if($selfHost){'discorda'}else{'discorda_dev'}
  $folder=Join-Path $root ('.discorda/backups/'+[Guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Path $folder|Out-Null;ProtectFolder $folder
  $remote='/tmp/discorda-'+[Guid]::NewGuid().ToString('N')+'.dump'
  try{Docker @('exec',$id,'pg_dump','-U',$dbUser,'-d','discorda','-Fc','-f',$remote)|Out-Null;Docker @('cp',($id+':'+$remote),(Join-Path $folder 'database.dump'))|Out-Null;Docker @('exec',$id,'pg_restore','--list',$remote)|Out-Null}finally{Docker @('exec',$id,'rm','-f',$remote)|Out-Null}
  if(Test-Path -LiteralPath $settingsPath){Copy-Item -LiteralPath $settingsPath -Destination (Join-Path $folder 'settings.json')}
  if($selfHost){$migrationFile=Join-Path $root '.discorda/selfhost/migration.json';if(Test-Path -LiteralPath $migrationFile){Copy-Item -LiteralPath $migrationFile -Destination $folder}}
  if($selfHost){foreach($file in @('server.pfx','postgres-password','livekit.yaml','compose.env')){Copy-Item -LiteralPath (Join-Path $root ('.discorda/selfhost/'+$file)) -Destination $folder};$api=(Compose @('ps','-a','-q','api')|Out-String).Trim();if($api){$previous=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$null=& docker.exe cp ($api+':/app/state/network.json') (Join-Path $folder 'network.json') 2>&1}finally{$ErrorActionPreference=$previous}}}
  else{foreach($file in @('server.pfx','livekit.yaml')){$source=Join-Path $root ('artifacts/radmin/'+$file);if(Test-Path -LiteralPath $source){Copy-Item -LiteralPath $source -Destination $folder}};foreach($name in @('host.json','network.json')){$hostFile=Join-Path $root ('.discorda/'+$name);if(Test-Path -LiteralPath $hostFile){Copy-Item -LiteralPath $hostFile -Destination $folder}}}
  @{format=1;networkIncluded=(Test-Path -LiteralPath (Join-Path $folder 'network.json'));mode=$(if($selfHost){'selfhost'}else{'native'});createdAt=[DateTime]::UtcNow.ToString('o');databaseSha256=(Get-FileHash -LiteralPath (Join-Path $folder 'database.dump') -Algorithm SHA256).Hash}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $folder 'manifest.json')
  "Backup verificado em: $folder`nContém dados e secrets. Guarde uma cópia criptografada fora deste PC.";break
 }
 'restore' {
  if(!$Value -or !(Test-Path -LiteralPath $Value -PathType Leaf) -or [IO.Path]::GetFileName($Value) -ne 'database.dump'){throw 'Selecione database.dump de um backup do painel.'}
  $manifest=Get-Content -LiteralPath (Join-Path (Split-Path $Value -Parent) 'manifest.json') -Raw|ConvertFrom-Json
  if($manifest.format -ne 1 -or (Get-FileHash -LiteralPath $Value -Algorithm SHA256).Hash -ne $manifest.databaseSha256){throw 'O backup não passou na verificação de integridade.'}
  $id=Container;$dbUser=if($selfHost){'discorda'}else{'discorda_dev'}
  $tables=(Docker @('exec',$id,'psql','-U',$dbUser,'-d','discorda','-Atc',"SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');")|Out-String).Trim()
  if($tables -ne '0'){throw 'Restauração recusada: o banco precisa estar vazio. O painel nunca apaga o banco atual.'}
  if($selfHost){Compose @('stop','api','livekit')|Out-Null}else{StopNative}
  $remote='/tmp/discorda-restore-'+[Guid]::NewGuid().ToString('N')+'.dump'
  try{Docker @('cp',$Value,($id+':'+$remote))|Out-Null;Docker @('exec',$id,'pg_restore','-U',$dbUser,'-d','discorda','--no-owner','--no-privileges','--single-transaction','--exit-on-error',$remote)|Out-Null}finally{Docker @('exec',$id,'rm','-f',$remote)|Out-Null}
  'Banco restaurado. Confira as configurações privadas compatíveis com o backup e clique em Iniciar.';break
 }
 'admin' {
  try{$mail=New-Object Net.Mail.MailAddress($Value)}catch{throw 'Informe um e-mail válido.'};if($mail.Address -ne $Value -or $Value.Length -gt 320){throw 'Informe um e-mail válido.'}
  $settings=Get-Content -LiteralPath $settingsPath -Raw|ConvertFrom-Json
  Copy-Item -LiteralPath $settingsPath -Destination ($settingsPath+'.before-admin-change') -Force
  if($selfHost){$settings.Admin.Email=$Value}else{$settings|Add-Member -NotePropertyName 'Admin:Email' -NotePropertyValue $Value -Force}
  if(!$selfHost -and !$settings.'SelfHost:StateDirectory'){$settings|Add-Member -NotePropertyName 'SelfHost:StateDirectory' -NotePropertyValue (Join-Path $root '.discorda') -Force}
  if(!$selfHost -and !$settings.'SelfHost:HostIp'){$hostFile=Join-Path $root '.discorda/host.json';if(Test-Path -LiteralPath $hostFile){$hostSettings=Get-Content -LiteralPath $hostFile -Raw|ConvertFrom-Json;$settings|Add-Member -NotePropertyName 'SelfHost:HostIp' -NotePropertyValue $hostSettings.hostIp -Force}}
  $settings|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $settingsPath -Encoding UTF8
  if($selfHost){$migrationFile=Join-Path $root '.discorda/selfhost/migration.json';$migration=Get-Content -LiteralPath $migrationFile -Raw|ConvertFrom-Json;$migration.Admin.Email=$Value;$migration|ConvertTo-Json -Depth 30|Set-Content -LiteralPath $migrationFile -Encoding utf8}
  if($selfHost){Compose @('run','--rm','migrate')|Out-Null}else{$env:ASPNETCORE_ENVIRONMENT='Development';& dotnet run --no-build --project (Join-Path $root 'services/backend/Discorda.Api') -- whitelist allow $Value |Out-Null;if($LASTEXITCODE -ne 0){throw 'Configuração salva, mas não foi possível autorizar o e-mail. Confira o banco antes de reiniciar.'}}
  'Administrador salvo e autorizado. Pare e inicie os serviços para aplicar. O administrador anterior perde o gerenciamento; sua conta permanece como membro até ser bloqueada.';break
 }
}
