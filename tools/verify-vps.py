"""Bounded health verification against this Compose project's API container."""
import json
import subprocess
import time
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parent.parent
compose = ['docker', 'compose', '--env-file', '.discorda/vps/compose.env', '-f', 'infra/compose/vps.yml']
container = subprocess.check_output([*compose, 'ps', '-q', 'api'], cwd=root, text=True, timeout=15).strip()
if not container:
    raise SystemExit('API não está em execução. Consulte bash tools/vps.sh logs.')
info = json.loads(subprocess.check_output(['docker', 'inspect', container], text=True, timeout=15))[0]
addresses = [network['IPAddress'] for network in info['NetworkSettings']['Networks'].values() if network.get('IPAddress')]
expected = json.loads((root / 'apps/desktop/package.json').read_text(encoding='utf-8'))['version']
# Do not let host proxy environment variables route a container health check elsewhere.
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
deadline = time.monotonic() + 90
while time.monotonic() < deadline:
    for address in addresses:
        try:
            with opener.open(f'http://{address}:8080/health/ready', timeout=3) as response:
                if response.status != 200:
                    continue
            with opener.open(f'http://{address}:8080/api/v1/compatibility', timeout=3) as response:
                version = json.loads(response.read(4096))
            if version.get('protocol') == 1 and version.get('version') == expected:
                print(f'API e banco prontos. Versão confirmada: {expected}. Confira voz e vídeo no painel.')
                raise SystemExit(0)
        except (OSError, ValueError):
            pass
    time.sleep(2)
raise SystemExit('A API não confirmou saúde e versão em 90 segundos. Consulte bash tools/vps.sh logs. Nenhuma restauração automática foi feita.')
