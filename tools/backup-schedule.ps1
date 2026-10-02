param([ValidateSet('enable','disable','status','run')][string]$Action='status')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$digest=[Security.Cryptography.SHA256]::Create()
try{$id=([BitConverter]::ToString($digest.ComputeHash([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($root).ToLowerInvariant())))).Replace('-','').Substring(0,12)}finally{$digest.Dispose()}
$taskName='Discorda-Backup-'+$id
switch($Action){
 'enable' {
  $scriptPath=Join-Path $PSScriptRoot 'backup-schedule.ps1'
  $taskAction=New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe') -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$scriptPath+'" -Action run') -WorkingDirectory $root
  $trigger=New-ScheduledTaskTrigger -Daily -At '03:00'
  $principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
  Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings -Description 'Backup diário local Discorda e restauração isolada semanal. Requer sessão Windows e Docker ativos.' -Force|Out-Null
  'Backup diário ativado para 03:00, ou quando possível. Requer usuário conectado e Docker ativo. Restauração isolada verificada a cada 7 dias. Backups não são apagados automaticamente.'
 }
 'disable' {Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue;'Agendamento desativado. Backups existentes preservados.'}
 'status' { $task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue;if($task){'Backup automático: '+$task.State}else{'Backup automático: desativado.'} }
 'run' {
  $statePath=Join-Path $root '.discorda/backup-status.json'
  $before=@(Get-ChildItem -LiteralPath (Join-Path $root '.discorda/backups') -Directory -ErrorAction SilentlyContinue|Select-Object -ExpandProperty Name)
  $lastVerified=$null
  if(Test-Path -LiteralPath $statePath){try{$lastVerified=(Get-Content -LiteralPath $statePath -Raw|ConvertFrom-Json).lastVerified}catch{}}
  try {
   & (Join-Path $PSScriptRoot 'host-operations.ps1') -Action backup | Out-Null
   $folder=Get-ChildItem -LiteralPath (Join-Path $root '.discorda/backups') -Directory|Where-Object {$_.Name -notin $before -and (Test-Path -LiteralPath (Join-Path $_.FullName 'manifest.json'))}|Sort-Object CreationTimeUtc -Descending|Select-Object -First 1
   if(!$folder){throw 'Nenhum backup completo foi criado.'}
   if(!$lastVerified -or ([DateTime]::UtcNow-[DateTime]::Parse($lastVerified)).TotalDays -ge 7){& (Join-Path $PSScriptRoot 'verify-backup.ps1') -Backup (Join-Path $folder.FullName 'database.dump')|Out-Null;$lastVerified=[DateTime]::UtcNow.ToString('o')}
   @{status='ok';checkedAt=[DateTime]::UtcNow.ToString('o');lastVerified=$lastVerified}|ConvertTo-Json|Set-Content -LiteralPath $statePath
   'Backup automático concluído.'
  } catch {
   @{status='error';checkedAt=[DateTime]::UtcNow.ToString('o');lastVerified=$lastVerified}|ConvertTo-Json|Set-Content -LiteralPath $statePath
   throw 'Backup ou verificação falhou. Confira Docker, espaço em disco e execute o backup pelo painel.'
  }
 }
}
