#!/usr/bin/env bash
set -euo pipefail

# Rutas base para la nueva ubicación en /var/www/talia
BASE_DIR="/var/www/talia"
BACKEND_DIR="$BASE_DIR/backend"
LOG_DIR="$BASE_DIR/logs"

# Asegura que el directorio de logs exista y crea archivos básicos y dedicados
mkdir -p "$LOG_DIR" "$LOG_DIR/busquedas"
touch \
  "$LOG_DIR/api.log" \
  "$LOG_DIR/request.log" \
  "$LOG_DIR/whatsapp.log" \
  "$LOG_DIR/voice.log" \
  "$LOG_DIR/webchat.log" \
  "$LOG_DIR/visitas.log"

cd "$BACKEND_DIR"

# Ejecuta uvicorn con Poetry, leyendo el .env del backend
exec /usr/bin/poetry run uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8004 \
  --proxy-headers \
  --env-file "$BACKEND_DIR/.env"
