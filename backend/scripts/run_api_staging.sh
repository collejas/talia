#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/var/www/talia"
BACKEND_DIR="$BASE_DIR/backend"
LOG_DIR="$BASE_DIR/logs"

mkdir -p "$LOG_DIR" "$LOG_DIR/busquedas"
touched_logs=(
  "$LOG_DIR/api-staging.log"
  "$LOG_DIR/request-staging.log"
  "$LOG_DIR/whatsapp-staging.log"
  "$LOG_DIR/voice-staging.log"
  "$LOG_DIR/webchat-staging.log"
  "$LOG_DIR/visitas-staging.log"
)
for log_file in "${touched_logs[@]}"; do
  touch "$log_file" || true
done

cd "$BACKEND_DIR"

VENV_PY="$BACKEND_DIR/.venv/bin/python"
if [[ -x "$VENV_PY" ]]; then
  UVICORN_CMD=("$VENV_PY" -m uvicorn)
else
  UVICORN_CMD=(/usr/bin/python3 -m uvicorn)
fi

exec "${UVICORN_CMD[@]}" app.main:app \
  --host 0.0.0.0 \
  --port 8104 \
  --proxy-headers \
  --env-file "$BACKEND_DIR/.env.staging"
