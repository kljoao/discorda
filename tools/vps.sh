#!/usr/bin/env bash
set -euo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
compose=(docker compose --env-file .discorda/vps/compose.env -f infra/compose/vps.yml)
case "${1:-status}" in
  database) "${compose[@]}" up -d --wait postgres ;;
  start)
    "${compose[@]}" build api
    "${compose[@]}" up -d --wait postgres
    "${compose[@]}" run --rm migrate
    "${compose[@]}" up -d --no-deps livekit api
    ;;
  status) "${compose[@]}" ps ;;
  logs) "${compose[@]}" logs --tail=80 api livekit ;;
  stop) "${compose[@]}" stop api livekit ;;
  backup)
    mkdir -p .discorda/vps/backups
    file=".discorda/vps/backups/database-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
    "${compose[@]}" exec -T postgres pg_dump -U discorda -d discorda -n discorda -Fc --no-owner --no-privileges > "$file"
    "${compose[@]}" exec -T postgres pg_restore --list < "$file" >/dev/null
    sha256sum "$file" > "$file.sha256"
    printf 'Backup: %s\n' "$file"
    ;;
  *) printf 'Uso: bash tools/vps.sh {database|start|status|logs|stop|backup}\n' >&2; exit 2 ;;
esac
