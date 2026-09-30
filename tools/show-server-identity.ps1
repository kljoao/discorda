#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$settingsPath = Join-Path $root '.discorda/selfhost/settings.json'
if (Test-Path -LiteralPath $settingsPath) {
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    $certificate = [Security.Cryptography.X509Certificates.X509CertificateLoader]::LoadPkcs12FromFile((Join-Path $root '.discorda/selfhost/server.pfx'), $settings.Kestrel.Endpoints.Https.Certificate.Password, [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
    $address = $settings.SelfHost.HostIp
} else {
    $legacy = Get-Content -LiteralPath (Join-Path $root 'apps/desktop/resources/lan.json') -Raw | ConvertFrom-Json
    $certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem($legacy.certificate)
    $address = ([Uri]$legacy.apiUrl).Host
}
try {
    Write-Output "IP Radmin do servidor: $address"
    Write-Output ('Identificação SHA-256: ' + ([regex]::Matches($certificate.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256), '..').Value -join ':'))
    Write-Output 'Compartilhe estes dados em privado. O amigo digita o IP e confere a identificação na primeira conexão.'
} finally { $certificate.Dispose() }
