#!/usr/bin/env bash
set -euo pipefail

# Deploy atomico para frontend panel en PRODUCCION (Next.js):
# 1) copia codigo a release nuevo
# 2) valida TypeScript + lint + build en release nuevo
# 3) swap atomico del symlink "current"
# 4) reinicio de servicios de produccion
# 5) purge opcional de Cloudflare
#
# Uso:
#   bash scripts/deploy_panel_atomic.sh
#
# Variables opcionales:
#   PANEL_SOURCE_DIR=/var/www/talia/frontend/panel
#   PANEL_RELEASES_DIR=/var/www/talia/releases/panel
#   PANEL_CURRENT_LINK=/var/www/talia/current/panel
#   PANEL_SERVICE=talia-panel.service
#   API_SERVICE=talia-api.service
#   SKIP_TS=0|1
#   SKIP_LINT=0|1
#   SKIP_BUILD=0|1
#   RUN_NPM_CI=0|1
#   SKIP_RESTART=0|1
#   RESTART_API=0|1
#   CF_ZONE_ID=...
#   CF_API_TOKEN=...
#   CF_PURGE_URLS='https://talia.mx/inbox,https://talia.mx/_next/static/chunks/app/inbox/page-xxxx.js'
#   CF_FULL_PURGE=0|1
#   KEEP_RELEASES=5
#   MIN_FREE_GB=4
#   CLEAN_TMP_ON_FAIL=1
#   NPM_CACHE_DIR=/var/www/talia/.npm-cache
#   RUN_AS_USER=jorge
#   PANEL_LOG_FILE=/var/www/talia/logs/panel.log
#   PANEL_ERROR_LOG_FILE=/var/www/talia/logs/panel-error.log

PANEL_SOURCE_DIR="${PANEL_SOURCE_DIR:-/var/www/talia/frontend/panel}"
PANEL_RELEASES_DIR="${PANEL_RELEASES_DIR:-/var/www/talia/releases/panel}"
PANEL_CURRENT_LINK="${PANEL_CURRENT_LINK:-/var/www/talia/current/panel}"
PANEL_SERVICE="${PANEL_SERVICE:-talia-panel.service}"
API_SERVICE="${API_SERVICE:-talia-api.service}"

SKIP_TS="${SKIP_TS:-0}"
SKIP_LINT="${SKIP_LINT:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"
RUN_NPM_CI="${RUN_NPM_CI:-0}"
SKIP_RESTART="${SKIP_RESTART:-0}"
RESTART_API="${RESTART_API:-0}"
CF_FULL_PURGE="${CF_FULL_PURGE:-0}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
MIN_FREE_GB="${MIN_FREE_GB:-4}"
CLEAN_TMP_ON_FAIL="${CLEAN_TMP_ON_FAIL:-1}"
NPM_CACHE_DIR="${NPM_CACHE_DIR:-/var/www/talia/.npm-cache}"
RUN_AS_USER="${RUN_AS_USER:-jorge}"
PANEL_LOG_FILE="${PANEL_LOG_FILE:-/var/www/talia/logs/panel.log}"
PANEL_ERROR_LOG_FILE="${PANEL_ERROR_LOG_FILE:-/var/www/talia/logs/panel-error.log}"

NOW_UTC="$(date -u +%Y%m%d_%H%M%S)"
NEW_RELEASE="${PANEL_RELEASES_DIR}/${NOW_UTC}"
TMP_RELEASE="${NEW_RELEASE}.tmp"

SWAPPED=0
PREV_RELEASE=""
if [[ -L "${PANEL_CURRENT_LINK}" ]]; then
  PREV_RELEASE="$(readlink -f "${PANEL_CURRENT_LINK}" || true)"
fi

rollback_if_needed() {
  local exit_code=$?
  if [[ ${exit_code} -ne 0 && "${CLEAN_TMP_ON_FAIL}" == "1" ]]; then
    rm -rf "${TMP_RELEASE}" || true
  fi
  if [[ ${exit_code} -ne 0 && ${SWAPPED} -eq 1 && -n "${PREV_RELEASE}" ]]; then
    echo "[rollback] Fallo despues de swap. Revirtiendo symlink a: ${PREV_RELEASE}"
    ln -sfn "${PREV_RELEASE}" "${PANEL_CURRENT_LINK}" || true
    echo "[rollback] Reiniciando servicios tras rollback"
    if [[ "${RESTART_API}" == "1" ]]; then
      sudo systemctl restart "${API_SERVICE}" || true
    fi
    sudo systemctl restart "${PANEL_SERVICE}" || true
  fi
  exit ${exit_code}
}
trap rollback_if_needed EXIT

cleanup_old_releases() {
  echo "[deploy] Pre-clean de releases antiguos (keep=${KEEP_RELEASES})"
  if command -v sudo >/dev/null 2>&1; then
    sudo -n chown -R "${RUN_AS_USER}:${RUN_AS_USER}" "${PANEL_RELEASES_DIR}" >/dev/null 2>&1 || true
  fi
  # 1) limpiar temporales fallidos
  find "${PANEL_RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d -name "*.tmp" -print0 | xargs -0r rm -rf --

  # 2) conservar release activo + N recientes validos
  local current_target=""
  if [[ -L "${PANEL_CURRENT_LINK}" ]]; then
    current_target="$(readlink -f "${PANEL_CURRENT_LINK}" || true)"
  fi

  mapfile -t valid_releases < <(ls -1dt "${PANEL_RELEASES_DIR}"/* 2>/dev/null | grep -v '\.tmp$' || true)
  if [[ "${KEEP_RELEASES}" =~ ^[0-9]+$ ]] && [[ "${#valid_releases[@]}" -gt 0 ]]; then
    declare -A preserve=()
    local count=0
    local rel=""
    for rel in "${valid_releases[@]}"; do
      if [[ $count -lt "${KEEP_RELEASES}" ]]; then
        preserve["$rel"]=1
        count=$((count + 1))
      fi
    done
    if [[ -n "${current_target}" ]]; then
      preserve["${current_target}"]=1
    fi
    for rel in "${valid_releases[@]}"; do
      if [[ -n "${preserve[$rel]:-}" ]]; then
        continue
      fi
      rm -rf -- "${rel}" 2>/dev/null || sudo -n rm -rf -- "${rel}" 2>/dev/null || true
    done
  fi
}

ensure_free_space() {
  local avail_gb
  avail_gb="$(df -BG "${PANEL_RELEASES_DIR}" | awk 'NR==2 {gsub(/G/, "", $4); print $4+0}')"
  if [[ -z "${avail_gb}" ]]; then
    echo "[deploy] WARN no fue posible medir espacio libre."
    return 0
  fi
  if (( avail_gb < MIN_FREE_GB )); then
    echo "[deploy] ERROR espacio insuficiente: ${avail_gb}G libres, minimo requerido=${MIN_FREE_GB}G."
    echo "[deploy] Ejecuta scripts/cleanup_disk.sh o reduce KEEP_RELEASES/KEEP_BACKUPS antes de continuar."
    return 1
  fi
  echo "[deploy] Espacio libre OK: ${avail_gb}G"
}

preflight_restart_permissions() {
  if [[ "${SKIP_RESTART}" == "1" ]]; then
    return 0
  fi
  local required_checks=()
  required_checks+=("sudo -n systemctl status ${PANEL_SERVICE}")
  if [[ "${RESTART_API}" == "1" ]]; then
    required_checks+=("sudo -n systemctl status ${API_SERVICE}")
  fi

  local check
  for check in "${required_checks[@]}"; do
    if ! eval "${check}" >/dev/null 2>&1; then
      echo "[deploy] ERROR no hay permisos sudo no-interactivos para reiniciar servicios."
      echo "[deploy] Falta permiso para: ${check#sudo -n }"
      echo "[deploy] Configura sudo NOPASSWD para status/restart de ${PANEL_SERVICE}${RESTART_API:+ y ${API_SERVICE}} o usa SKIP_RESTART=1."
      return 1
    fi
  done

  if ! sudo -n systemctl daemon-reload >/dev/null 2>&1; then
    echo "[deploy] WARN no hay permiso NOPASSWD para systemctl daemon-reload."
    echo "[deploy] El deploy puede continuar, pero un cambio de unit file requerira recarga manual."
  fi
}

echo "[deploy] Source:  ${PANEL_SOURCE_DIR}"
echo "[deploy] Release: ${NEW_RELEASE}"
echo "[deploy] Current: ${PANEL_CURRENT_LINK}"

test -d "${PANEL_SOURCE_DIR}"
mkdir -p "${PANEL_RELEASES_DIR}"
mkdir -p "${NPM_CACHE_DIR}"
mkdir -p "$(dirname "${PANEL_LOG_FILE}")"
touch "${PANEL_LOG_FILE}" "${PANEL_ERROR_LOG_FILE}"
if command -v sudo >/dev/null 2>&1; then
  sudo -n chown "${RUN_AS_USER}:${RUN_AS_USER}" "${PANEL_LOG_FILE}" "${PANEL_ERROR_LOG_FILE}" >/dev/null 2>&1 || true
fi
cleanup_old_releases
ensure_free_space
preflight_restart_permissions
rm -rf "${TMP_RELEASE}"
mkdir -p "${TMP_RELEASE}"

echo "[deploy] Copiando codigo a release temporal"
rsync -a --delete \
  --exclude ".next" \
  --exclude "node_modules" \
  "${PANEL_SOURCE_DIR}/" "${TMP_RELEASE}/"

cd "${TMP_RELEASE}"

# Evita que .env.local del repo altere el build de producción.
if [[ -f ".env.local" ]]; then
  rm -f ".env.local"
fi

if [[ "${RUN_NPM_CI}" == "1" ]]; then
  echo "[deploy] npm ci"
  npm ci --cache "${NPM_CACHE_DIR}" --prefer-offline
elif [[ ! -d node_modules ]]; then
  echo "[deploy] node_modules no existe en release temporal. Ejecutando npm ci"
  npm ci --cache "${NPM_CACHE_DIR}" --prefer-offline
fi

if [[ "${SKIP_TS}" != "1" ]]; then
  echo "[deploy] npx tsc --noEmit"
  npx tsc --noEmit
fi

if [[ "${SKIP_LINT}" != "1" ]]; then
  echo "[deploy] npm run lint"
  npm run lint
fi

if [[ "${SKIP_BUILD}" != "1" ]]; then
  export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"
  echo "[deploy] npm run build"
  npm run build
fi

echo "[deploy] Promoviendo release temporal a release final"
mv "${TMP_RELEASE}" "${NEW_RELEASE}"
if command -v sudo >/dev/null 2>&1; then
  sudo -n chown -R "${RUN_AS_USER}:${RUN_AS_USER}" "${NEW_RELEASE}" >/dev/null 2>&1 || true
fi

mkdir -p "$(dirname "${PANEL_CURRENT_LINK}")"
echo "[deploy] Swap atomico: ${PANEL_CURRENT_LINK} -> ${NEW_RELEASE}"
ln -sfn "${NEW_RELEASE}" "${PANEL_CURRENT_LINK}"
SWAPPED=1

if [[ "${SKIP_RESTART}" == "1" ]]; then
  echo "[deploy] SKIP_RESTART=1, se omite restart de servicios"
else
  if [[ "${RESTART_API}" == "1" ]]; then
    echo "[deploy] Reiniciando API + Panel"
    sudo systemctl restart "${API_SERVICE}"
    sudo systemctl is-active --quiet "${API_SERVICE}"
  else
    echo "[deploy] Reiniciando solo Panel (API sin cambios)"
  fi
  sudo systemctl restart "${PANEL_SERVICE}"
  sudo systemctl is-active --quiet "${PANEL_SERVICE}"
fi

if [[ -n "${CF_ZONE_ID:-}" && -n "${CF_API_TOKEN:-}" ]]; then
  echo "[deploy] Purge Cloudflare"
  if [[ "${CF_FULL_PURGE}" == "1" ]]; then
    curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data '{"purge_everything":true}' >/dev/null
  elif [[ -n "${CF_PURGE_URLS:-}" ]]; then
    IFS=',' read -r -a URLS <<< "${CF_PURGE_URLS}"
    payload='{"files":['
    for idx in "${!URLS[@]}"; do
      url="$(echo "${URLS[$idx]}" | xargs)"
      [[ -z "${url}" ]] && continue
      if [[ ${idx} -gt 0 ]]; then
        payload+=","
      fi
      payload+="\"${url}\""
    done
    payload+=']}'
    curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "${payload}" >/dev/null
  else
    echo "[deploy] CF configurado pero sin CF_PURGE_URLS ni CF_FULL_PURGE=1; se omite purge"
  fi
fi

echo "[deploy] Limpieza de releases viejos (keep=${KEEP_RELEASES})"
if [[ "${KEEP_RELEASES}" =~ ^[0-9]+$ ]]; then
  find "${PANEL_RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d -name "*.tmp" -print0 | xargs -0r rm -rf -- || true
  old_releases="$(ls -1dt "${PANEL_RELEASES_DIR}"/* 2>/dev/null | grep -v '\.tmp$' | tail -n +"$((KEEP_RELEASES + 1))" || true)"
  if [[ -n "${old_releases}" ]]; then
    if ! printf '%s\n' "${old_releases}" | xargs -r rm -rf -- 2>/dev/null; then
      if ! printf '%s\n' "${old_releases}" | xargs -r sudo -n rm -rf -- 2>/dev/null; then
        echo "[deploy] WARN no se pudieron limpiar algunos releases antiguos; se conserva deploy activo."
      fi
    fi
  fi
fi

echo "[deploy] OK. Release activo: ${NEW_RELEASE}"
