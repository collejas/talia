#!/usr/bin/env bash
set -euo pipefail

# Rutas base para la nueva ubicación en /var/www/talia
BASE_DIR="/var/www/talia"
BACKEND_DIR="$BASE_DIR/backend"
LOG_DIR="$BASE_DIR/logs"

# Asegura que el directorio de logs exista y crea archivos básicos y dedicados
mkdir -p "$LOG_DIR" "$LOG_DIR/busquedas"
touched_logs=(
  "$LOG_DIR/api.log"
  "$LOG_DIR/request.log"
  "$LOG_DIR/whatsapp.log"
  "$LOG_DIR/messenger.log"
  "$LOG_DIR/voice.log"
  "$LOG_DIR/webchat.log"
  "$LOG_DIR/visitas.log"
  "$LOG_DIR/propiedades-import.log"
  "$LOG_DIR/tenant-access.log"
  "$LOG_DIR/inbox-threads-metrics.log"
  "$LOG_DIR/busquedas/busquedas.log"
)
for log_file in "${touched_logs[@]}"; do
  touch "$log_file" || true
done

cd "$BACKEND_DIR"

# Ejecuta uvicorn.
# Preferimos usar el venv local (`backend/.venv`) porque systemd corre como root y Poetry puede no estar disponible/configurado.
VENV_PY="$BACKEND_DIR/.venv/bin/python"
if [[ -x "$VENV_PY" ]]; then
  UVICORN_CMD=("$VENV_PY" -m uvicorn)
else
  UVICORN_CMD=(/usr/bin/python3 -m uvicorn)
fi

exec "${UVICORN_CMD[@]}" app.main:app \
  --host 0.0.0.0 \
  --port 8004 \
  --proxy-headers \
  --env-file "$BACKEND_DIR/.env"
