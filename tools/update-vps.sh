#!/usr/bin/env bash
set -euo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
command -v flock >/dev/null
mkdir -p .discorda/vps
exec 9>.discorda/vps/update.lock
flock -n 9 || { printf 'Outra atualização está em andamento.\n' >&2; exit 1; }
test -z "$(git status --porcelain --untracked-files=normal)" || { printf 'Há alterações locais. Preserve-as antes de atualizar.\n' >&2; exit 1; }
origin=$(git remote get-url origin)
case "$origin" in
  https://github.com/*) repository=${origin#https://github.com/} ;;
  git@github.com:*) repository=${origin#git@github.com:} ;;
  *) printf 'A atualização assistida requer um repositório GitHub como origin.\n' >&2; exit 1 ;;
esac
repository=${repository%.git}
[[ "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || exit 1
target=$(curl --fail --silent --show-error --max-time 20 "https://api.github.com/repos/$repository/releases/latest" | python3 -c 'import json,sys,re; v=json.load(sys.stdin).get("tag_name",""); assert re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+",v), "Release estável inválida"; print(v)')
git fetch --no-tags origin "refs/tags/$target:refs/tags/$target"
current=$(git rev-parse HEAD)
next=$(git rev-parse "$target^{commit}")
if [[ "$current" == "$next" ]]; then printf 'Código já está em %s. Verificando serviços.\n' "$target"; exec python3 tools/verify-vps.py; fi
# Never silently replace local commits or downgrade a newer checkout.
git merge-base --is-ancestor "$current" "$next" || { printf 'A versão publicada não contém o checkout atual. Atualização interrompida para preservar seus commits.\n' >&2; exit 1; }
printf 'Atualizando para %s. Criando backup antes de interromper chamadas.\n' "$target"
bash tools/vps.sh backup
trap 'printf "Atualização interrompida. Não restaure o banco automaticamente. Consulte bash tools/vps.sh logs e docs/vps.md. Commit anterior: %s\n" "$current" >&2' ERR
bash tools/vps.sh stop
git merge --ff-only "$target"
bash tools/vps.sh start
python3 tools/verify-vps.py
trap - ERR
printf 'Atualização concluída: %s. Teste uma chamada pelo aplicativo.\n' "$target"
