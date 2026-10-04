#!/usr/bin/env python3
"""Split legacy VPS credentials locally; the next migration creates the restricted role."""
import copy
import json
import os
from pathlib import Path
import secrets
import re


def prepare(directory):
    settings_file = directory / 'settings.json'
    migration_file = directory / 'migration.json'
    settings = json.loads(settings_file.read_text(encoding='utf-8-sig'))
    connection = settings['ConnectionStrings']['Database']
    if 'Username=discorda_runtime;' in connection and migration_file.is_file():
        protect_media_config(directory)
        return
    if not re.fullmatch(r'Host=postgres;Database=discorda;Username=discorda;Password=[a-fA-F0-9]{64};Maximum Pool Size=20', connection):
        raise ValueError('Configuração customizada: separe manualmente as contas conforme docs/security-audit.md.')
    if migration_file.exists():
        migration = json.loads(migration_file.read_text(encoding='utf-8-sig'))
        password = migration['Migration']['RuntimePassword']
        if migration['ConnectionStrings']['Database'] != connection:
            raise ValueError('A configuração de migração não corresponde ao banco atual.')
    else:
        migration = copy.deepcopy(settings)
        password = secrets.token_hex(32)
        migration['Migration'] = {'RuntimeRole': 'discorda_runtime', 'RuntimePassword': password}
        write_private(migration_file, migration, exclusive=True)
    settings['ConnectionStrings']['Database'] = f'Host=postgres;Database=discorda;Username=discorda_runtime;Password={password};Maximum Pool Size=20'
    temporary = settings_file.with_suffix('.pending')
    write_private(temporary, settings, exclusive=True)
    os.replace(temporary, settings_file)
    protect_media_config(directory)


def protect_media_config(directory):
    file = directory / 'livekit.yaml'
    if os.name == 'posix' and file.is_file():
        os.chown(file, 1654, 1654)
        file.chmod(0o400)


def write_private(file, value, exclusive):
    with file.open('x' if exclusive else 'w', encoding='utf-8') as output:
        output.write(json.dumps(value, indent=2) + '\n')
    if os.name == 'posix':
        os.chown(file, 1654, 1654)
        file.chmod(0o400)


if __name__ == '__main__':
    os.umask(0o077)
    try:
        prepare(Path(__file__).resolve().parent.parent / '.discorda' / 'vps')
    except (OSError, ValueError, KeyError):
        raise SystemExit('Não foi possível separar as credenciais. Confira os arquivos privados e docs/security-audit.md. Nenhum banco foi apagado.')
