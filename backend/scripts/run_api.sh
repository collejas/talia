#!/usr/bin/env bash
set -euo pipefail

# Rutas base para la nueva ubicación en /var/www/talia
BASE_DIR="/var/www/talia"
BACKEND_DIR="$BASE_DIR/backend"
LOG_DIR="$BASE_DIR/logs"

# Asegura que el directorio de logs exista y crea archivos básicos
mkdir -p "$LOG_DIR"
touch "$LOG_DIR/api.log" "$LOG_DIR/request.log"

cd "$BACKEND_DIR"

# Ejecuta uvicorn con Poetry, leyendo el .env del backend
exec /usr/bin/poetry run uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8004 \
  --proxy-headers \
  --env-file "$BACKEND_DIR/.env"
