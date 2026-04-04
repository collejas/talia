#!/usr/bin/env bash
set -euo pipefail

API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:8004/api/health}"
API_HEALTH_TIMEOUT_SECONDS="${API_HEALTH_TIMEOUT_SECONDS:-45}"

deadline=$((SECONDS + API_HEALTH_TIMEOUT_SECONDS))

while (( SECONDS < deadline )); do
  if curl -fsS --max-time 2 "${API_HEALTH_URL}" >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done

echo "[wait_for_api_health] API no reporto salud a tiempo: ${API_HEALTH_URL}" >&2
exit 1
