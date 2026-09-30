# Run as administrator on the HOST only. No rule exposes the service to the public Internet.
$ErrorActionPreference = 'Stop'
$hostFile = Join-Path (Split-Path $PSScriptRoot -Parent) '.discorda/host.json'
$configuration = Get-Content -LiteralPath $hostFile -Raw | ConvertFrom-Json
$hostIp = $configuration.hostIp
$peerIp = @($configuration.peerIps)
foreach ($address in @($hostIp) + $peerIp) {
    $parsed = $null
    if (![Net.IPAddress]::TryParse($address, [ref]$parsed) -or $parsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or !([string]$parsed).StartsWith('26.')) { throw 'Use apenas IPs individuais IPv4 do Radmin (26.x.x.x).' }
}
if (!$peerIp.Count) { Get-NetFirewallRule -DisplayName 'Discorda Radmin *' -ErrorAction SilentlyContinue | Disable-NetFirewallRule; return }
foreach ($entry in @(@{Name='Discorda Radmin HTTPS'; Protocol='TCP'; Port='7443'}, @{Name='Discorda Radmin ICE TCP'; Protocol='TCP'; Port='7881'}, @{Name='Discorda Radmin ICE UDP'; Protocol='UDP'; Port='7882'})) {
    if (!(Get-NetFirewallRule -DisplayName $entry.Name -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $entry.Name -Direction Inbound -Action Allow -Protocol $entry.Protocol -LocalPort $entry.Port -LocalAddress $hostIp -RemoteAddress $peerIp -Profile Any | Out-Null
    } else {
        Set-NetFirewallRule -DisplayName $entry.Name -RemoteAddress $peerIp -LocalAddress $hostIp -Enabled True | Out-Null
    }
}
Write-Output 'Discorda: portas liberadas somente para os amigos autorizados no Radmin.'
