#!/usr/bin/env python3
"""Generate private Linux VPS configuration; never edits Caddy or starts services."""
import getpass
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent


def generate(domain, public_ip, email, supabase, key, network, proxy_ip):
    if not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}', domain) or len(domain) > 253:
        raise ValueError('Use um domínio, sem https://, porta ou caminho.')
    if not ipaddress.IPv4Address(public_ip).is_global:
        raise ValueError('Informe o IPv4 público da VPS.')
    ipaddress.IPv4Address(proxy_ip)
    if not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', network):
        raise ValueError('Nome de rede Docker inválido.')
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or len(email) > 320:
        raise ValueError('E-mail inválido.')
    if not re.fullmatch(r'https://[a-z0-9]{20}\.supabase\.co', supabase):
        raise ValueError('URL Supabase inválida.')
    if not re.fullmatch(r'sb_publishable_[A-Za-z0-9_-]{20,}', key):
        raise ValueError('Use somente a chave publishable do Supabase.')
    password, lk_secret, lk_key = secrets.token_hex(32), secrets.token_hex(32), 'discorda' + secrets.token_hex(8)
    settings = {
        'AllowedHosts': domain,
        'ConnectionStrings': {'Database': f'Host=postgres;Database=discorda;Username=discorda;Password={password};Maximum Pool Size=20'},
        'Supabase': {'Url': supabase, 'PublishableKey': key},
        'Admin': {'Email': email.lower()},
        'SelfHost': {'StateDirectory': '/app/state'},
        'Proxy': {'TrustedIp': proxy_ip},
        'Kestrel': {'Endpoints': {'Http': {'Url': 'http://0.0.0.0:8080'}}},
        'LiveKit': {'ApiKey': lk_key, 'ApiSecret': lk_secret, 'PublicUrl': f'wss://{domain}/media', 'InternalUrl': 'http://livekit:7880'},
        'ReverseProxy': {
            'Routes': {'media': {'ClusterId': 'livekit', 'Match': {'Path': '/media/{**catch-all}'}, 'AuthorizationPolicy': 'anonymous', 'Transforms': [{'PathRemovePrefix': '/media'}]}},
            'Clusters': {'livekit': {'Destinations': {'local': {'Address': 'http://livekit:7880/'}}}}
        }
    }
    livekit = f'''port: 7880
rtc:
  tcp_port: 7881
  udp_port: 7882
  node_ip: {public_ip}
  use_external_ip: false
keys:
  {lk_key}: {lk_secret}
room:
  auto_create: false
turn:
  enabled: true
  udp_port: 3478
logging:
  level: warn
'''
    caddy = f'''# Append to your existing Caddyfile, never replace it.
{domain} {{
    reverse_proxy discorda-api:8080
}}
'''
    return {'settings.json': json.dumps(settings, indent=2), 'livekit.yaml': livekit,
            'postgres-password': password, 'compose.env': f'DISCORDA_PROXY_NETWORK={network}\n', 'Caddyfile.fragment': caddy}


def main():
    if sys.platform != 'linux' or os.geteuid() != 0:
        raise ValueError('Execute como root no Ubuntu da VPS.')
    directory = ROOT / '.discorda' / 'vps'
    if directory.exists():
        raise ValueError('Configuração já existe. O assistente não sobrescreve banco ou chaves.')
    domain = input('Domínio do Discorda: ').strip().lower()
    public_ip = input('IPv4 público desta VPS: ').strip()
    network = input('Rede Docker do Caddy: ').strip()
    container = input('Nome do container Caddy: ').strip()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}', container):
        raise ValueError('Nome de container inválido.')
    # Inspect only networking; never read or print the SaaS environment.
    raw = subprocess.check_output(['docker', 'inspect', '--format', '{{json .NetworkSettings.Networks}}', container], text=True)
    proxy_ip = json.loads(raw).get(network, {}).get('IPAddress', '')
    email = input('E-mail Google do proprietário: ').strip()
    supabase = input('URL do projeto Supabase: ').strip().rstrip('/')
    key = getpass.getpass('Chave publishable do Supabase: ').strip()
    files = generate(domain, public_ip, email, supabase, key, network, proxy_ip)
    os.umask(0o077)
    directory.mkdir(parents=True, mode=0o700)
    for name, text in files.items():
        target = directory / name
        with target.open('x', encoding='utf-8') as output:
            output.write(text + '\n')
        if name == 'settings.json':
            # APP_UID in the .NET 10 Linux runtime image.
            os.chown(target, 1654, 1654)
            target.chmod(0o400)
    print('Configuração privada criada em .discorda/vps. Nenhum serviço foi iniciado e o Caddy não foi alterado.')
    print('Siga docs/vps.md para validar portas, iniciar o Compose e integrar o Caddy.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError, KeyError):
        sys.exit('Não foi possível gerar a configuração. Confira os dados, a rede do Caddy e as permissões. Nenhuma configuração existente é sobrescrita.')
