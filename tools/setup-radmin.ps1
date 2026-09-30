param([Parameter(Mandatory)][string]$HostIp)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$privateDir = Join-Path $root 'artifacts/radmin'
$publicDir = Join-Path $root 'apps/desktop/resources'
New-Item -ItemType Directory -Force $privateDir, $publicDir | Out-Null
$secretPath = Join-Path $env:APPDATA 'Microsoft/UserSecrets/discorda-development/secrets.json'
$settings = Get-Content -LiteralPath $secretPath -Raw | ConvertFrom-Json -AsHashtable
$profilePath = Join-Path $publicDir 'lan.json'
if (!(Test-Path $profilePath) -or !(Get-Content $profilePath -Raw | ConvertFrom-Json).rootCertificate) {
    $ca = New-SelfSignedCertificate -Subject 'CN=Discorda private Radmin CA' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddMonths(6) -KeyUsage CertSign, CRLSign, DigitalSignature -TextExtension @('2.5.29.19={critical}{text}ca=true')
    $cert = New-SelfSignedCertificate -Subject 'CN=Discorda Radmin test' -Signer $ca -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddMonths(6) -TextExtension @("2.5.29.17={text}IPAddress=$HostIp", '2.5.29.37={text}1.3.6.1.5.5.7.3.1')
    $password = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    $pfxPath = Join-Path $privateDir 'server.pfx'
    Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password (ConvertTo-SecureString $password -AsPlainText -Force) | Out-Null
    $pem = "-----BEGIN CERTIFICATE-----`n" + [Convert]::ToBase64String($cert.RawData, [Base64FormattingOptions]::InsertLineBreaks) + "`n-----END CERTIFICATE-----`n"
    $rootPem = "-----BEGIN CERTIFICATE-----`n" + [Convert]::ToBase64String($ca.RawData, [Base64FormattingOptions]::InsertLineBreaks) + "`n-----END CERTIFICATE-----`n"
    @{ apiUrl = "https://${HostIp}:7443"; certificate = $pem; rootCertificate = $rootPem } | ConvertTo-Json | Set-Content $profilePath
    $settings['Kestrel:Endpoints:Radmin:Certificate:Path'] = $pfxPath
    $settings['Kestrel:Endpoints:Radmin:Certificate:Password'] = $password
}
$settings['Kestrel:Endpoints:Radmin:Url'] = "https://${HostIp}:7443"
$settings['Kestrel:Endpoints:Local:Url'] = 'http://127.0.0.1:5080'
$settings['AllowedHosts'] = "localhost;127.0.0.1;$HostIp"
if (!$settings['LiveKit:ApiKey']) { $settings['LiveKit:ApiKey'] = 'discorda' + [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(8)) }
if (!$settings['LiveKit:ApiSecret']) { $settings['LiveKit:ApiSecret'] = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)) }
$settings['LiveKit:PublicUrl'] = "wss://${HostIp}:7443/media"
$settings['LiveKit:InternalUrl'] = 'http://127.0.0.1:7880'
$settings['ReverseProxy:Routes:media:ClusterId'] = 'livekit'
$settings['ReverseProxy:Routes:media:Match:Path'] = '/media/{**catch-all}'
$settings['ReverseProxy:Routes:media:AuthorizationPolicy'] = 'anonymous'
$settings['ReverseProxy:Routes:media:Transforms:0:PathRemovePrefix'] = '/media'
$settings['ReverseProxy:Clusters:livekit:Destinations:local:Address'] = 'http://127.0.0.1:7880/'
$settings | ConvertTo-Json | Set-Content -LiteralPath $secretPath
@"
port: 7880
bind_addresses: ["127.0.0.1", "$HostIp"]
rtc:
  tcp_port: 7881
  udp_port: 7882
  node_ip: $HostIp
  use_external_ip: false
  enable_loopback_candidate: true
keys:
  $($settings['LiveKit:ApiKey']): $($settings['LiveKit:ApiSecret'])
room:
  auto_create: false
logging:
  level: warn
"@ | Set-Content (Join-Path $privateDir 'livekit.yaml')
Write-Output "Radmin configured: HTTPS ${HostIp}:7443, ICE TCP 7881 / UDP 7882. Share the connection JSON privately; it never enters the installer."
