$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$config=Get-Content -LiteralPath (Join-Path $env:APPDATA 'Microsoft/UserSecrets/discorda-development/secrets.json') -Raw|ConvertFrom-Json
$active=New-Object System.Data.Common.DbConnectionStringBuilder;$active.set_ConnectionString($config.'ConnectionStrings:Database')
$maintenance=$active
if($active.get_Item('Host') -notin @('127.0.0.1','localhost') -and $config.'ConnectionStrings:Supabase'){
 $maintenance=New-Object System.Data.Common.DbConnectionStringBuilder;$maintenance.set_ConnectionString($config.'ConnectionStrings:Supabase')
 foreach($field in @('Host','Port','Database')){if($active.get_Item($field) -ne $maintenance.get_Item($field)){throw 'Conta de manutenção aponta para outro banco. Migração recusada.'}}
}
$runtimeRole=[string]$active.get_Item('Username')
if([string]$active.get_Item('Host') -like '*.pooler.supabase.com'){$runtimeRole=$runtimeRole.Split('.')[0]}
if($runtimeRole -notmatch '\A[A-Za-z_][A-Za-z0-9_]{0,62}\z'){throw 'Nome de role inválido para migração automática.'}
$previousConnection=$env:ConnectionStrings__Database;$previousRole=$env:Migration__RuntimeRole
try{
 $env:ASPNETCORE_ENVIRONMENT='Development'
 $env:ConnectionStrings__Database=$maintenance.get_ConnectionString()
 $env:Migration__RuntimeRole=$runtimeRole
 & dotnet run --no-build --project (Join-Path $root 'services/backend/Discorda.Api') -- migrate | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Migração ou permissões não concluídas. Confira a conta de manutenção.'}
 'Migração concluída; permissões de dados concedidas à conta de execução.'
}finally{
 if($null -eq $previousConnection){Remove-Item Env:ConnectionStrings__Database -ErrorAction SilentlyContinue}else{$env:ConnectionStrings__Database=$previousConnection}
 if($null -eq $previousRole){Remove-Item Env:Migration__RuntimeRole -ErrorAction SilentlyContinue}else{$env:Migration__RuntimeRole=$previousRole}
 $maintenance.Clear();$active.Clear();$config=$null
}
