$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'radmin-firewall.ps1'
$identity = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if ($identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { & $script }
else { Start-Process -FilePath (Join-Path $PSHOME 'pwsh.exe') -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList @('-NoProfile', '-File', ('"' + $script + '"')) }
