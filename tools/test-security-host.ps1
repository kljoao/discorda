#Requires -Version 7.0
param([string]$ApiImage='discorda-api:security-audit')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$id='discorda-security-'+[Guid]::NewGuid().ToString('N')
$folder=Join-Path $root ('artifacts/'+$id)
$network=$id+'-net';$volume=$id+'-data';$database=$id+'-db';$api=$id+'-api'
New-Item -ItemType Directory -Path (Join-Path $folder 'tools'),(Join-Path $folder '.discorda/selfhost') -Force|Out-Null
function Docker([string[]]$Arguments){
 $result=& docker.exe @Arguments 2>&1
 if($LASTEXITCODE -ne 0){throw ('Isolated Docker test failed: '+($result|Out-String))}
 return $result
}
function WaitDatabase {
 for($i=0;$i -lt 45;$i++){
  $null=& docker.exe exec $database pg_isready -U discorda -d discorda 2>&1
  if($LASTEXITCODE -eq 0){return};Start-Sleep -Seconds 1
 }
 throw 'Test database did not start'
}
try {
 # Exercise the Windows upgrade with synthetic credentials, never the operator's settings.
 Copy-Item -LiteralPath (Join-Path $root 'tools/harden-database.ps1') -Destination (Join-Path $folder 'tools/harden-database.ps1')
 $settingsFile=Join-Path $folder '.discorda/selfhost/settings.json'
 $ownerPassword=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
 @{ConnectionStrings=@{Database="Host=postgres;Database=discorda;Username=discorda;Password=$ownerPassword;Maximum Pool Size=20"};Admin=@{Email='owner@example.test'}}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $settingsFile
 & powershell.exe -NoProfile -File (Join-Path $folder 'tools/harden-database.ps1')|Out-Null
 if($LASTEXITCODE -ne 0){throw 'Windows PowerShell credential upgrade failed'}
 $runtime=Get-Content -LiteralPath $settingsFile -Raw|ConvertFrom-Json -AsHashtable
 $migration=Get-Content -LiteralPath (Join-Path $folder '.discorda/selfhost/migration.json') -Raw|ConvertFrom-Json -AsHashtable
 if($runtime.ConnectionStrings.Database.Contains($ownerPassword) -or $runtime.ContainsKey('Migration')){throw 'Owner credentials leaked to runtime settings'}
 $before=[IO.File]::ReadAllText($settingsFile)
 & (Join-Path $folder 'tools/harden-database.ps1')|Out-Null
 if($before -ne [IO.File]::ReadAllText($settingsFile)){throw 'Upgrade is not idempotent'}
 # The network is internal and no database port is published. Trust applies only to this fixture.
 Docker @('network','create','--internal',$network)|Out-Null
 Docker @('volume','create',$volume)|Out-Null
 Docker @('run','-d','--name',$database,'--network',$network,'--network-alias','postgres','-v',($volume+':/var/lib/postgresql/data'),'-e','POSTGRES_USER=discorda','-e','POSTGRES_DB=discorda','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17.9-alpine')|Out-Null
 WaitDatabase
 # Run the actual production migration entry point, then runtime image, using different files.
 foreach($entry in @(@{Name='migration';Value=$migration},@{Name='runtime';Value=$runtime})){
  $entry.Value.AllowedHosts='*'
  $entry.Value.Kestrel=@{Endpoints=@{Http=@{Url='http://0.0.0.0:8080'}}}
  $entry.Value|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $folder ($entry.Name+'.json'))
 }
 $configMount=$folder+':/fixture:ro'
 Docker @('run','--rm','--network',$network,'-v',$configMount,'-e','DISCORDA_CONFIG_FILE=/fixture/migration.json',$ApiImage,'migrate')|Out-Null
 Docker @('run','--rm','--network',$network,'-v',$configMount,'-e','DISCORDA_CONFIG_FILE=/fixture/migration.json',$ApiImage,'migrate')|Out-Null
 $runtimeMount=(Join-Path $folder 'runtime.json')+':/run/discorda/settings.json:ro'
 Docker @('run','-d','--name',$api,'--network',$network,'-v',$runtimeMount,'-e','DISCORDA_CONFIG_FILE=/run/discorda/settings.json',$ApiImage)|Out-Null
 $healthy=$false
 for($i=0;$i -lt 30;$i++){$response=& docker.exe run --rm --network $network postgres:17.11-alpine3.23 wget -qO- "http://${api}:8080/health/ready" 2>&1;$healthy=$LASTEXITCODE -eq 0 -and ($response|Out-String).Trim() -eq 'Healthy';if($healthy){break};Start-Sleep -Seconds 1}
 if(!$healthy){throw 'Restricted API is not healthy'}
 Docker @('rm','-f',$api)|Out-Null
 Docker @('rm','-f',$database)|Out-Null
 # Keep the same volume across the supported PostgreSQL minor upgrade.
 # A generated server certificate also proves the libpq backup TLS boundary.
 $rsa=[Security.Cryptography.RSA]::Create(2048)
 $request=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=postgres',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
 $san=[Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new();$san.AddDnsName('postgres');$request.CertificateExtensions.Add($san.Build())
 $certificate=$request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-1),[DateTimeOffset]::UtcNow.AddDays(1))
 [IO.File]::WriteAllText((Join-Path $folder 'root.crt'),$certificate.ExportCertificatePem())
 [IO.File]::WriteAllText((Join-Path $folder 'server.key'),$rsa.ExportPkcs8PrivateKeyPem())
 $certificate.Dispose();$rsa.Dispose()
 Docker @('create','--name',$database,'--network',$network,'--network-alias','postgres','--network-alias','wrong-host','-v',($volume+':/var/lib/postgresql/data'),'--entrypoint','sh','postgres:17.11-alpine3.23','-c','chown postgres:postgres /tmp/server.key; chmod 600 /tmp/server.key; exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/root.crt -c ssl_key_file=/tmp/server.key')|Out-Null
 Docker @('cp',(Join-Path $folder 'root.crt'),($database+':/tmp/root.crt'))|Out-Null
 Docker @('cp',(Join-Path $folder 'server.key'),($database+':/tmp/server.key'))|Out-Null
 Docker @('start',$database)|Out-Null
 WaitDatabase
 $version=(Docker @('exec',$database,'psql','-U','discorda','-d','discorda','-Atc','SHOW server_version;')|Out-String).Trim()
 if(!$version.StartsWith('17.11')){throw 'Unexpected PostgreSQL version'}
 Docker @('run','--rm','--network',$network,'-v',$configMount,'-e','DISCORDA_CONFIG_FILE=/fixture/runtime.json',$ApiImage,'migration-status')|Out-Null
 $client=@('run','--rm','--network',$network,'-v',$configMount,'-e','PGSSLROOTCERT=/fixture/root.crt','-e','PGSSLMODE=verify-full','postgres:17.11-alpine3.23','pg_dump','-U','discorda','-d','discorda','--schema=discorda','-f','/dev/null')
 Docker ($client+@('-h','postgres'))|Out-Null
 $failure=& docker.exe @client -h wrong-host 2>&1
 if($LASTEXITCODE -eq 0 -or ($failure|Out-String) -notmatch 'does not match host name'){throw 'TLS hostname mismatch was not refused'}
 'PASS: credential split, idempotent migration, restricted API, PostgreSQL 17.9 → 17.11 data compatibility, verified TLS backup and hostname rejection.'
}finally{
 # Only resources named with this run's random identifier are removed.
 & docker.exe rm -f $api $database 2>&1|Out-Null
 & docker.exe volume rm $volume 2>&1|Out-Null
 & docker.exe network rm $network 2>&1|Out-Null
}
