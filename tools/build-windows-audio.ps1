$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$output = Join-Path $taskRoot 'apps/desktop/resources/windows-audio'
# Clear only this generated directory so obsolete runtime files are never shipped.
$expected = [IO.Path]::GetFullPath((Join-Path $taskRoot 'apps/desktop/resources/windows-audio'))
if ([IO.Path]::GetFullPath($output) -ne $expected -or -not $expected.StartsWith([IO.Path]::GetFullPath($taskRoot) + [IO.Path]::DirectorySeparatorChar)) { throw 'Unexpected audio output path' }
if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Recurse -Force }
dotnet publish (Join-Path $taskRoot 'tools/windows-audio/Discorda.Audio.csproj') -c Release -r win-x64 --self-contained true -p:RestoreLockedMode=true -o $output
if ($LASTEXITCODE -ne 0) { throw 'Native audio build failed' }
# App-local Microsoft Visual C++ redistributables installed with Visual Studio.
foreach ($name in @('msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')) {
    $source = Join-Path $env:WINDIR "System32/$name"
    $signature = Get-AuthenticodeSignature -LiteralPath $source
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') { throw "Missing signed Microsoft runtime: $name" }
    Copy-Item -LiteralPath $source -Destination $output
}
Copy-Item -LiteralPath (Join-Path $taskRoot 'tools/windows-audio/THIRD-PARTY-NOTICES.txt') -Destination $output
$dotnetDirectory = Split-Path (Get-Command dotnet -CommandType Application).Source -Parent
Copy-Item -LiteralPath (Join-Path $dotnetDirectory 'LICENSE.txt') -Destination (Join-Path $output 'DOTNET-LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $dotnetDirectory 'ThirdPartyNotices.txt') -Destination (Join-Path $output 'DOTNET-THIRD-PARTY-NOTICES.txt')
