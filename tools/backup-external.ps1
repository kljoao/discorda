param([Parameter(Mandatory=$true)][string]$SettingsPath)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$settings=Get-Content -LiteralPath $SettingsPath -Raw|ConvertFrom-Json
$connection=New-Object System.Data.Common.DbConnectionStringBuilder
$connection.set_ConnectionString($settings.'ConnectionStrings:Database')
# Use the saved maintenance account only when it targets exactly the active database.
if($settings.'ConnectionStrings:Supabase'){
 $maintenance=New-Object System.Data.Common.DbConnectionStringBuilder
 $maintenance.set_ConnectionString($settings.'ConnectionStrings:Supabase')
 if(@('Host','Port','Database')|Where-Object {$connection.get_Item($_) -ne $maintenance.get_Item($_)}){throw 'A conta de manutenção aponta para outro banco. Backup recusado.'}
 $connection=$maintenance
}
$folder=Join-Path $root ('.discorda/backups/'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $folder|Out-Null
$acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User,(New-Object Security.Principal.SecurityIdentifier 'S-1-5-18'))){$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))}
Set-Acl -LiteralPath $folder -AclObject $acl
$servicePath=Join-Path $folder 'temporary-service.conf'
$rootCertificate=$null
if($connection.ContainsKey('Root Certificate')){
 $rootCertificate=[string]$connection.get_Item('Root Certificate')
 if(!(Test-Path -LiteralPath $rootCertificate -PathType Leaf)){throw 'Certificado raiz do banco não encontrado. Backup recusado.'}
}
$containerCa=if($rootCertificate){'/tmp/database-root.crt'}else{'/etc/ssl/certs/ca-certificates.crt'}
$service="[discorda]`nhost="+$connection.get_Item('Host')+"`nport="+$connection.get_Item('Port')+"`ndbname="+$connection.get_Item('Database')+"`nuser="+$connection.get_Item('Username')+"`npassword="+$connection.get_Item('Password')+"`nsslmode=verify-full`nsslrootcert=$containerCa`nconnect_timeout=15`n"
foreach($field in @('Host','Port','Database','Username','Password')){if(([string]$connection.get_Item($field)) -match '[\r\n]'){throw 'A configuração contém um valor inválido para o serviço de backup.'}}
$container='discorda-external-backup-'+[Guid]::NewGuid().ToString('N')
function Docker([string[]]$Arguments){$old=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$result=& docker.exe @Arguments 2>&1;$code=$LASTEXITCODE}finally{$ErrorActionPreference=$old};if($code -ne 0){throw 'Backup externo falhou. Verifique conectividade, versão do PostgreSQL e permissões da conta de manutenção.'};return $result}
$created=$false
try{
 [IO.File]::WriteAllText($servicePath,$service,(New-Object Text.UTF8Encoding($false)))
 Docker @('create','--name',$container,'--memory','512m','--cpus','1','--entrypoint','sleep','postgres:17.11-alpine3.23','infinity')|Out-Null;$created=$true
 Docker @('start',$container)|Out-Null
 if($rootCertificate){Docker @('cp',$rootCertificate,($container+':/tmp/database-root.crt'))|Out-Null}
 Docker @('cp',$servicePath,($container+':/tmp/service.conf'))|Out-Null
 Docker @('exec',$container,'chmod','600','/tmp/service.conf')|Out-Null
 Docker @('exec','-e','PGSERVICEFILE=/tmp/service.conf',$container,'pg_dump','--dbname=service=discorda','--schema=discorda','--no-owner','--no-privileges','-Fc','-f','/tmp/database.dump')|Out-Null
 Docker @('exec',$container,'pg_restore','--list','/tmp/database.dump')|Out-Null
 Docker @('cp',($container+':/tmp/database.dump'),(Join-Path $folder 'database.dump'))|Out-Null
 Copy-Item -LiteralPath $SettingsPath -Destination (Join-Path $folder 'settings.json')
 foreach($file in @('server.pfx','livekit.yaml')){$source=Join-Path $root ('artifacts/radmin/'+$file);if(Test-Path -LiteralPath $source){Copy-Item -LiteralPath $source -Destination $folder}}
 foreach($name in @('host.json','network.json')){$source=Join-Path $root ('.discorda/'+$name);if(Test-Path -LiteralPath $source){Copy-Item -LiteralPath $source -Destination $folder}}
 @{format=1;mode='external-schema';schema='discorda';networkIncluded=(Test-Path -LiteralPath (Join-Path $folder 'network.json'));createdAt=[DateTime]::UtcNow.ToString('o');databaseSha256=(Get-FileHash -LiteralPath (Join-Path $folder 'database.dump') -Algorithm SHA256).Hash}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $folder 'manifest.json')
 "Backup externo do schema discorda verificado em: $folder"
}finally{
 if($created -and $container -match '^discorda-external-backup-[a-f0-9]{32}$'){Docker @('rm','-f','-v',$container)|Out-Null}
 # Exact temporary file inside the freshly created private backup folder, never a recursive removal.
 if(Test-Path -LiteralPath $servicePath){Remove-Item -LiteralPath $servicePath -Force}
 $service=$null;$connection.Clear()
}
