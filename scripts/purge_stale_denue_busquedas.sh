#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

load_db_url_from_env_file() {
  local env_file="$1"
  [[ -f "$env_file" ]] || return 1
  awk -F= '
    $0 ~ /^[[:space:]]*#/ { next }
    $1 == "DATABASE_URL" || $1 == "SUPABASE_DB_URL" {
      sub(/^[[:space:]]+/, "", $2)
      sub(/[[:space:]]+$/, "", $2)
      print $2
      exit
    }
  ' "$env_file"
}

DB_URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"

if [[ -z "${DB_URL}" ]]; then
  DB_URL="$(load_db_url_from_env_file "${REPO_ROOT}/.env" || true)"
fi

if [[ -z "${DB_URL}" ]]; then
  DB_URL="$(load_db_url_from_env_file "${REPO_ROOT}/backend/.env" || true)"
fi

if [[ -z "${DB_URL}" ]]; then
  echo "Falta DATABASE_URL o SUPABASE_DB_URL." >&2
  exit 1
fi

DB_CONN="${DB_URL}"
if [[ "${DB_URL}" == *"?"* ]]; then
  DB_CONN="${DB_URL%%\?*}"
  DB_QUERY="${DB_URL#*\?}"
  case "${DB_QUERY}" in
    *"sslmode=require"*) export PGSSLMODE="require" ;;
    *"sslmode=verify-full"*) export PGSSLMODE="verify-full" ;;
    *"sslmode=verify-ca"*) export PGSSLMODE="verify-ca" ;;
    *"sslmode=disable"*) export PGSSLMODE="disable" ;;
  esac
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "No se encontro psql en el PATH." >&2
  exit 1
fi

echo "Buscando busquedas DENUE marcadas como eliminadas..."

mapfile -t BUSQUEDAS < <(
  PGPASSWORD="${PGPASSWORD:-}" psql "${DB_CONN}" -At -v ON_ERROR_STOP=1 <<'SQL'
select id::text
from public.busquedas
where fuente = 'denue'
  and deleted_at is not null
order by creado_en asc;
SQL
)

if [[ "${#BUSQUEDAS[@]}" -eq 0 ]]; then
  echo "No hay busquedas DENUE pendientes de purga."
  exit 0
fi

echo "Se encontraron ${#BUSQUEDAS[@]} busquedas para purgar."

deleted=0
for busqueda_id in "${BUSQUEDAS[@]}"; do
  echo "Eliminando ${busqueda_id}..."
  PGPASSWORD="${PGPASSWORD:-}" psql "${DB_CONN}" -v ON_ERROR_STOP=1 <<SQL
set statement_timeout = '0';
delete from public.busquedas
where id = '${busqueda_id}';
SQL
  deleted=$((deleted + 1))
done

echo "Purga terminada. Busquedas eliminadas: ${deleted}."
