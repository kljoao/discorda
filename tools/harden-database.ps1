#Requires -Version 5.1
$ErrorActionPreference='Stop'
$directory=Join-Path (Split-Path $PSScriptRoot -Parent) '.discorda/selfhost'
$settingsFile=Join-Path $directory 'settings.json'
$migrationFile=Join-Path $directory 'migration.json'
$settings=Get-Content -LiteralPath $settingsFile -Raw | ConvertFrom-Json
$connection=$settings.ConnectionStrings.Database
if($connection.Contains('Username=discorda_runtime;') -and (Test-Path -LiteralPath $migrationFile)){return}
if($connection -cnotmatch '\AHost=postgres;Database=discorda;Username=discorda;Password=[a-fA-F0-9]{64};Maximum Pool Size=20\z'){throw 'Configuração customizada: separe manualmente as contas conforme docs/security-audit.md.'}
if(Test-Path -LiteralPath $migrationFile){
    $migration=Get-Content -LiteralPath $migrationFile -Raw | ConvertFrom-Json
    if($migration.ConnectionStrings.Database -ne $connection){throw 'A configuração de migração não corresponde ao banco atual.'}
    $runtimePassword=$migration.Migration.RuntimePassword
}else{
    $random=New-Object byte[] 32
    $generator=[Security.Cryptography.RandomNumberGenerator]::Create()
    try{$generator.GetBytes($random)}finally{$generator.Dispose()}
    $runtimePassword=[BitConverter]::ToString($random).Replace('-','')
    $settings|Add-Member -NotePropertyName 'Migration' -NotePropertyValue @{RuntimeRole='discorda_runtime';RuntimePassword=$runtimePassword} -Force
    $settings | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $migrationFile -Encoding utf8
    $settings.PSObject.Properties.Remove('Migration')
}
$settings.ConnectionStrings.Database="Host=postgres;Database=discorda;Username=discorda_runtime;Password=$runtimePassword;Maximum Pool Size=20"
$settings | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath ($settingsFile+'.pending') -Encoding utf8
Move-Item -LiteralPath ($settingsFile+'.pending') -Destination $settingsFile -Force
