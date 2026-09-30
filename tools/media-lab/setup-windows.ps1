$ErrorActionPreference = 'Stop'
$destination = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../artifacts/media-lab/server'))
New-Item -ItemType Directory -Force $destination | Out-Null
$name = 'livekit_1.13.7_windows_amd64.zip'
$baseUrl = 'https://github.com/livekit/livekit/releases/download/v1.13.7'
$archive = Join-Path $destination $name
Invoke-WebRequest -UseBasicParsing "$baseUrl/$name" -OutFile $archive
Invoke-WebRequest -UseBasicParsing "$baseUrl/checksums.txt" -OutFile (Join-Path $destination 'checksums.txt')
$checksums = Get-Content (Join-Path $destination 'checksums.txt') -Raw
$expected = (($checksums -split "`n" | Where-Object { $_.Trim().EndsWith($name) }) -split '\s+')[0]
if (!$expected -or (Get-FileHash -Algorithm SHA256 $archive).Hash.ToLowerInvariant() -ne $expected.ToLowerInvariant()) { throw 'LiveKit checksum mismatch.' }
Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force
Write-Output 'LiveKit 1.13.7 downloaded and SHA256 verified against the official release.'


