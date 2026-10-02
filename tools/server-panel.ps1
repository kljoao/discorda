param([switch]$SmokeTest)
# Local-only control panel. No listening HTTP port, Docker socket exposure or remote command execution.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$script:operations=Join-Path $PSScriptRoot 'host-operations.ps1'
$script:job=$null
$form=New-Object Windows.Forms.Form
$form.Text='Discorda - Painel do servidor';$form.Size=New-Object Drawing.Size(760,645);$form.StartPosition='CenterScreen'
$form.BackColor=[Drawing.Color]::FromArgb(26,26,33);$form.ForeColor=[Drawing.Color]::WhiteSmoke
$form.Font=New-Object Drawing.Font('Segoe UI',10)
$title=New-Object Windows.Forms.Label;$title.Text='Servidor Discorda';$title.Location=New-Object Drawing.Point(24,20);$title.Size=New-Object Drawing.Size(680,30);$title.Font=New-Object Drawing.Font('Segoe UI',16,[Drawing.FontStyle]::Bold);$form.Controls.Add($title)
$hint=New-Object Windows.Forms.Label;$hint.Text='Execute neste PC com Docker e Radmin ligados. Backups incluem dados privados.';$hint.Location=New-Object Drawing.Point(24,60);$hint.Size=New-Object Drawing.Size(690,35);$form.Controls.Add($hint)
$script:buttons=@()
function Run-Operation([string]$Action,[string]$Value=''){
 if($script:job){return};foreach($button in $script:buttons){$button.Enabled=$false};$output.Text='Processando...'
 $script:job=Start-Job -FilePath $script:operations -ArgumentList $Action,$Value
}
function Button([string]$Text,[int]$X,[int]$Y,[scriptblock]$Click){
 $b=New-Object Windows.Forms.Button;$b.Text=$Text;$b.Location=New-Object Drawing.Point($X,$Y);$b.Size=New-Object Drawing.Size(155,38);$b.FlatStyle='Flat';$b.BackColor=[Drawing.Color]::FromArgb(48,48,64);$b.Add_Click($Click);$form.Controls.Add($b);$script:buttons+=,$b
}
Button 'Verificar serviços' 24 105 {Run-Operation 'status'}
Button 'Iniciar serviços' 190 105 {Run-Operation 'start'}
Button 'Parar serviços' 356 105 {if([Windows.Forms.MessageBox]::Show('Isso desconecta os usuários. Parar os serviços?','Discorda','YesNo','Warning') -eq 'Yes'){Run-Operation 'stop'}}
Button 'Criar backup' 522 105 {Run-Operation 'backup'}
Button 'Restaurar banco' 24 153 {
 $picker=New-Object Windows.Forms.OpenFileDialog;$picker.Filter='Backup Discorda (database.dump)|database.dump'
 if($picker.ShowDialog() -eq 'OK' -and [Windows.Forms.MessageBox]::Show('Restaurar somente em um banco vazio? Os serviços serão parados. Nenhum banco existente será apagado.','Discorda','YesNo','Warning') -eq 'Yes'){Run-Operation 'restore' $picker.FileName};$picker.Dispose()
}
Button 'Abrir backups' 190 153 {$folder=Join-Path (Split-Path $PSScriptRoot -Parent) '.discorda/backups';if(Test-Path -LiteralPath $folder){Start-Process explorer.exe -ArgumentList ('"'+$folder+'"')}else{$output.Text='Crie o primeiro backup para abrir a pasta.'}}
Button 'Testar restauração' 356 153 {$picker=New-Object Windows.Forms.OpenFileDialog;$picker.Filter='Backup próprio (database.dump)|database.dump';if($picker.ShowDialog() -eq 'OK'){Run-Operation 'verifybackup' $picker.FileName};$picker.Dispose()}
Button 'Backup diário' 522 153 {if([Windows.Forms.MessageBox]::Show('Agendar backup diário às 03:00 e teste de restauração semanal? Requer sessão Windows e Docker ativos. Os backups ficam neste PC e não serão apagados automaticamente.','Discorda','YesNo','Question') -eq 'Yes'){Run-Operation 'schedule'}}
Button 'Desativar agenda' 522 201 {Run-Operation 'unschedule'}
$label=New-Object Windows.Forms.Label;$label.Text='E-mail do administrador principal';$label.Location=New-Object Drawing.Point(24,269);$label.Size=New-Object Drawing.Size(600,25);$form.Controls.Add($label)
$email=New-Object Windows.Forms.TextBox;$email.Location=New-Object Drawing.Point(24,300);$email.Size=New-Object Drawing.Size(480,30);$form.Controls.Add($email)
try{$email.Text=(& $script:operations -Action readadmin|Out-String).Trim()}catch{}
Button 'Salvar administrador' 522 296 {if([Windows.Forms.MessageBox]::Show('Definir este e-mail como administrador principal? O acesso será aplicado após reiniciar os serviços.','Discorda','YesNo','Warning') -eq 'Yes'){Run-Operation 'admin' $email.Text.Trim()}}
$output=New-Object Windows.Forms.TextBox;$output.Multiline=$true;$output.ReadOnly=$true;$output.ScrollBars='Vertical';$output.Location=New-Object Drawing.Point(24,355);$output.Size=New-Object Drawing.Size(680,215);$output.BackColor=[Drawing.Color]::FromArgb(19,19,25);$output.ForeColor=[Drawing.Color]::WhiteSmoke;$form.Controls.Add($output)
$timer=New-Object Windows.Forms.Timer;$timer.Interval=400;$timer.Add_Tick({if($script:job -and $script:job.State -in @('Completed','Failed','Stopped')){try{$output.Text=(Receive-Job $script:job -ErrorAction Stop|Out-String)}catch{$output.Text=$_.Exception.Message};Remove-Job $script:job;$script:job=$null;foreach($button in $script:buttons){$button.Enabled=$true}}});$timer.Start()
$form.Add_FormClosing({param($sender,$event)if($script:job){$event.Cancel=$true;[Windows.Forms.MessageBox]::Show('Aguarde a operação terminar antes de fechar.','Discorda')|Out-Null}})
if($SmokeTest){$form.CreateControl();$timer.Stop();$timer.Dispose();$form.Dispose();Write-Output 'Panel initialized successfully.';exit}
$form.Add_Shown({Run-Operation 'status'})
[void]$form.ShowDialog();$timer.Stop();$timer.Dispose();$form.Dispose()
