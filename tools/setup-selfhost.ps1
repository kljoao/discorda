#Requires -Version 7.0
param(
    [string]$HostIp,
    [string]$AdminEmail,
    [string]$SupabaseUrl,
    [string]$PublishableKey,
    [switch]$ConfigureOnly
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$directory = Join-Path $root '.discorda/selfhost'
if (Test-Path -LiteralPath $directory) { throw 'Configuração já existe em .discorda/selfhost. Faça backup e use start-selfhost.ps1; o assistente não sobrescreve chaves nem banco.' }
if (!$HostIp) { $HostIp = Read-Host 'IPv4 Radmin do computador que hospedará o servidor (26.x.x.x)' }
$parsed = $null
if (![Net.IPAddress]::TryParse($HostIp, [ref]$parsed) -or $parsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $parsed.GetAddressBytes()[0] -ne 26 -or $parsed.ToString() -ne $HostIp) { throw 'IP Radmin inválido.' }
if (!$AdminEmail) { $AdminEmail = Read-Host 'E-mail Google do administrador' }
$mail = $null
if (![Net.Mail.MailAddress]::TryCreate($AdminEmail, [ref]$mail) -or $mail.Address -ne $AdminEmail -or $AdminEmail.Length -gt 320) { throw 'E-mail inválido.' }
if (!$SupabaseUrl) { $SupabaseUrl = Read-Host 'URL do projeto Supabase (https://...supabase.co)' }
if ($SupabaseUrl -cnotmatch '^https://[a-z0-9]{20}\.supabase\.co/?$') { throw 'URL do projeto Supabase inválida.' }
if (!$PublishableKey) { $PublishableKey = Read-Host 'Chave publishable (sb_publishable_...)' }
if ($PublishableKey -cnotmatch '^sb_publishable_[A-Za-z0-9_-]{20,}$') { throw 'Use apenas a chave publishable, nunca uma chave secret ou service_role.' }
if (!$ConfigureOnly) {
    if (!(Get-NetIPAddress -IPAddress $HostIp -ErrorAction SilentlyContinue)) { throw 'O IP informado não pertence ao host. Conecte o Radmin e use o IP deste computador.' }
    if (Get-NetTCPConnection -State Listen -LocalPort 7443,7881,18080 -ErrorAction SilentlyContinue) { throw 'Há outro serviço usando as portas do Discorda. Planeje a troca antes de iniciar esta instalação.' }
    docker info --format '{{.ServerVersion}}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Inicie o Docker Desktop com Linux containers.' }
}
New-Item -ItemType Directory -Path $directory -Force | Out-Null
# Only the installing account and SYSTEM can read private host files.
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
icacls $directory /inheritance:r /grant:r "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível proteger a pasta de configuração.' }
function New-Secret { [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)) }
$databasePassword = New-Secret
$pfxPassword = New-Secret
$livekitSecret = New-Secret
$livekitKey = 'discorda' + (New-Secret).Substring(0,16)
# Private certificates are app-scoped. No machine-wide trusted root is installed.
$ca = New-SelfSignedCertificate -Subject 'CN=Discorda private CA' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(2) -KeyUsage CertSign, CRLSign, DigitalSignature -TextExtension @('2.5.29.19={critical}{text}ca=true')
$cert = New-SelfSignedCertificate -Subject 'CN=Discorda home server' -Signer $ca -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(1) -TextExtension @("2.5.29.17={text}IPAddress=$HostIp&DNS=localhost", '2.5.29.37={text}1.3.6.1.5.5.7.3.1')
Export-PfxCertificate -Cert $cert -FilePath (Join-Path $directory 'server.pfx') -Password (ConvertTo-SecureString $pfxPassword -AsPlainText -Force) | Out-Null
function To-Pem($certificate) { "-----BEGIN CERTIFICATE-----`n" + [Convert]::ToBase64String($certificate.RawData, [Base64FormattingOptions]::InsertLineBreaks) + "`n-----END CERTIFICATE-----`n" }
@{ apiUrl="https://${HostIp}:7443"; certificate=(To-Pem $cert); rootCertificate=(To-Pem $ca) } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directory 'Discorda-conexao.json') -Encoding utf8
$settings = @{
    AllowedHosts="localhost;127.0.0.1;$HostIp"
    ConnectionStrings=@{Database="Host=postgres;Database=discorda;Username=discorda;Password=$databasePassword;Maximum Pool Size=20"}
    Supabase=@{Url=$SupabaseUrl.TrimEnd('/');PublishableKey=$PublishableKey}
    Admin=@{Email=$AdminEmail.ToLowerInvariant()}
    SelfHost=@{HostIp=$HostIp;StateDirectory='/app/state'}
    Kestrel=@{Endpoints=@{
        Local=@{Url='http://0.0.0.0:8080'}
        Https=@{Url='https://0.0.0.0:7443';Certificate=@{Path='/run/discorda/server.pfx';Password=$pfxPassword}}
    }}
    LiveKit=@{ApiKey=$livekitKey;ApiSecret=$livekitSecret;PublicUrl="wss://${HostIp}:7443/media";InternalUrl='http://livekit:7880'}
    ReverseProxy=@{
        Routes=@{media=@{ClusterId='livekit';Match=@{Path='/media/{**catch-all}'};AuthorizationPolicy='anonymous';Transforms=@(@{PathRemovePrefix='/media'})}}
        Clusters=@{livekit=@{Destinations=@{local=@{Address='http://livekit:7880/'}}}}
    }
}
$settings | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $directory 'settings.json') -Encoding utf8
$databasePassword | Set-Content -LiteralPath (Join-Path $directory 'postgres-password') -NoNewline -Encoding utf8
"DISCORDA_HOST_IP=$HostIp" | Set-Content -LiteralPath (Join-Path $directory 'compose.env') -Encoding utf8
@"
port: 7880
rtc:
  tcp_port: 7881
  udp_port: 7882
  node_ip: $HostIp
  use_external_ip: false
  enable_loopback_candidate: true
keys:
  ${livekitKey}: $livekitSecret
room:
  auto_create: false
logging:
  level: warn
"@ | Set-Content -LiteralPath (Join-Path $directory 'livekit.yaml') -Encoding utf8
Write-Output 'Configuração criada em .discorda/selfhost. Amigos podem conectar pelo IP Radmin, sem JSON. Consulte a identificação do certificado com tools/show-server-identity.ps1. O JSON continua disponível para clientes antigos.'
Write-Output 'No Supabase, configure Google e autorize http://localhost:18080/admin/index.html e http://127.0.0.1:3000/redirect/** como redirects.'
if (!$ConfigureOnly) { & (Join-Path $PSScriptRoot 'start-selfhost.ps1') }
