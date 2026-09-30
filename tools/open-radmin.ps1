$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'start-radmin.ps1')
$root = Split-Path $PSScriptRoot -Parent
Start-Process -FilePath (Join-Path $root 'apps/desktop/release/win-unpacked/Discorda.exe')
