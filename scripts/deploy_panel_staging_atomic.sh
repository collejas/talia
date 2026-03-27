#!/usr/bin/env bash
set -euo pipefail

# Deploy atomico para frontend panel en STAGING (Next.js):
# 1) copia codigo a release nuevo
# 2) valida TypeScript + lint + build en release nuevo
# 3) swap atomico del symlink "current"
# 4) reinicio de servicios staging
# 5) purge opcional de Cloudflare (dominio staging)
#
# Uso:
#   bash scripts/deploy_panel_staging_atomic.sh
#
# Variables opcionales:
#   PANEL_SOURCE_DIR=/var/www/talia/frontend/panel
#   PANEL_RELEASES_DIR=/var/www/talia/releases/panel-staging
#   PANEL_CURRENT_LINK=/var/www/talia/current/panel-staging
#   PANEL_SERVICE=talia-panel-staging.service
#   API_SERVICE=talia-api-staging.service
#   SKIP_TS=0|1
#   SKIP_LINT=0|1
#   SKIP_BUILD=0|1
#   RUN_NPM_CI=0|1
#   SKIP_RESTART=0|1
#   CF_ZONE_ID=...
#   CF_API_TOKEN=...
#   CF_PURGE_URLS='https://staging.talia.mx/inbox,https://staging.talia.mx/_next/static/chunks/app/inbox/page-xxxx.js'
#   CF_FULL_PURGE=0|1
#   KEEP_RELEASES=5

PANEL_SOURCE_DIR="${PANEL_SOURCE_DIR:-/var/www/talia/frontend/panel}"
PANEL_RELEASES_DIR="${PANEL_RELEASES_DIR:-/var/www/talia/releases/panel-staging}"
PANEL_CURRENT_LINK="${PANEL_CURRENT_LINK:-/var/www/talia/current/panel-staging}"
PANEL_SERVICE="${PANEL_SERVICE:-talia-panel-staging.service}"
API_SERVICE="${API_SERVICE:-talia-api-staging.service}"

SKIP_TS="${SKIP_TS:-0}"
SKIP_LINT="${SKIP_LINT:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"
RUN_NPM_CI="${RUN_NPM_CI:-0}"
SKIP_RESTART="${SKIP_RESTART:-0}"
CF_FULL_PURGE="${CF_FULL_PURGE:-0}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

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
  if [[ ${exit_code} -ne 0 && ${SWAPPED} -eq 1 && -n "${PREV_RELEASE}" ]]; then
    echo "[rollback] Fallo despues de swap. Revirtiendo symlink a: ${PREV_RELEASE}"
    ln -sfn "${PREV_RELEASE}" "${PANEL_CURRENT_LINK}" || true
    echo "[rollback] Reiniciando servicios staging tras rollback"
    sudo systemctl restart "${API_SERVICE}" || true
    sudo systemctl restart "${PANEL_SERVICE}" || true
  fi
  exit ${exit_code}
}
trap rollback_if_needed EXIT

echo "[deploy-staging] Source:  ${PANEL_SOURCE_DIR}"
echo "[deploy-staging] Release: ${NEW_RELEASE}"
echo "[deploy-staging] Current: ${PANEL_CURRENT_LINK}"

test -d "${PANEL_SOURCE_DIR}"
mkdir -p "${PANEL_RELEASES_DIR}"
rm -rf "${TMP_RELEASE}"
mkdir -p "${TMP_RELEASE}"

echo "[deploy-staging] Copiando codigo a release temporal"
rsync -a --delete \
  --exclude ".next" \
  --exclude "node_modules" \
  "${PANEL_SOURCE_DIR}/" "${TMP_RELEASE}/"

cd "${TMP_RELEASE}"

# Evita contaminar el build de staging con valores locales/prod del repo.
if [[ -f ".env.local" ]]; then
  rm -f ".env.local"
fi
if [[ -f ".env.staging" ]]; then
  cp ".env.staging" ".env.production"
fi

if [[ "${RUN_NPM_CI}" == "1" ]]; then
  echo "[deploy-staging] npm ci"
  npm ci
elif [[ ! -d node_modules ]]; then
  echo "[deploy-staging] node_modules no existe en release temporal. Ejecutando npm ci"
  npm ci
fi

if [[ "${SKIP_TS}" != "1" ]]; then
  echo "[deploy-staging] npx tsc --noEmit"
  npx tsc --noEmit
fi

if [[ "${SKIP_LINT}" != "1" ]]; then
  echo "[deploy-staging] npm run lint"
  npm run lint
fi

if [[ "${SKIP_BUILD}" != "1" ]]; then
  echo "[deploy-staging] npm run build"
  npm run build
fi

echo "[deploy-staging] Promoviendo release temporal a release final"
mv "${TMP_RELEASE}" "${NEW_RELEASE}"

mkdir -p "$(dirname "${PANEL_CURRENT_LINK}")"
echo "[deploy-staging] Swap atomico: ${PANEL_CURRENT_LINK} -> ${NEW_RELEASE}"
ln -sfn "${NEW_RELEASE}" "${PANEL_CURRENT_LINK}"
SWAPPED=1

if [[ "${SKIP_RESTART}" == "1" ]]; then
  echo "[deploy-staging] SKIP_RESTART=1, se omite restart de servicios"
else
  echo "[deploy-staging] Reiniciando servicios"
  sudo systemctl restart "${API_SERVICE}"
  sudo systemctl restart "${PANEL_SERVICE}"
  sudo systemctl is-active --quiet "${API_SERVICE}"
  sudo systemctl is-active --quiet "${PANEL_SERVICE}"
fi

if [[ -n "${CF_ZONE_ID:-}" && -n "${CF_API_TOKEN:-}" ]]; then
  echo "[deploy-staging] Purge Cloudflare"
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
    echo "[deploy-staging] CF configurado pero sin CF_PURGE_URLS ni CF_FULL_PURGE=1; se omite purge"
  fi
fi

echo "[deploy-staging] Limpieza de releases viejos (keep=${KEEP_RELEASES})"
if [[ "${KEEP_RELEASES}" =~ ^[0-9]+$ ]]; then
  ls -1dt "${PANEL_RELEASES_DIR}"/* 2>/dev/null | tail -n +"$((KEEP_RELEASES + 1))" | xargs -r rm -rf --
fi

echo "[deploy-staging] OK. Release activo: ${NEW_RELEASE}"
