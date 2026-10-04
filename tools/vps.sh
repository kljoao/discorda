#!/usr/bin/env bash
set -euo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
compose=(docker compose --env-file .discorda/vps/compose.env -f infra/compose/vps.yml)
case "${1:-status}" in
  database) "${compose[@]}" up -d --wait postgres ;;
  start)
    python3 tools/harden-database.py
    "${compose[@]}" build api
    "${compose[@]}" up -d --wait postgres
    "${compose[@]}" run --rm migrate
    "${compose[@]}" up -d --no-deps livekit api
    ;;
  status) "${compose[@]}" ps ;;
  logs) "${compose[@]}" logs --tail=80 api livekit ;;
  stop) "${compose[@]}" stop api livekit ;;
  backup)
    report_backup() {
      printf '{"ok":%s,"lastRun":"%s","lastVerified":null}\n' "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" |
        "${compose[@]}" run --rm --no-deps -T --entrypoint sh api -c 'temporary=$(mktemp /app/state/backup-status.XXXXXX); cat > "$temporary" && mv "$temporary" /app/state/backup-status.json' >/dev/null
    }
    trap 'report_backup false || true' ERR
    mkdir -p .discorda/vps/backups
    file=".discorda/vps/backups/database-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
    "${compose[@]}" exec -T postgres pg_dump -U discorda -d discorda -n discorda -Fc --no-owner --no-privileges > "$file.partial"
    "${compose[@]}" exec -T postgres pg_restore --list < "$file.partial" >/dev/null
    mv -- "$file.partial" "$file"
    sha256sum "$file" > "$file.sha256"
    trap - ERR
    report_backup true || printf "Backup concluído; não foi possível publicar o resumo no painel.\n" >&2
    printf 'Backup: %s\n' "$file"
    ;;
  *) printf 'Uso: bash tools/vps.sh {database|start|status|logs|stop|backup}\n' >&2; exit 2 ;;
esac
