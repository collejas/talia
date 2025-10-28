#!/usr/bin/env bash
set -euo pipefail

LANDING_SRC="/home/devuser/talia/landing/src/"
LANDING_DEST="/var/www/talia-landing/"
LOG_DIR="/home/devuser/talia/logs"
LOG_FILE="$LOG_DIR/api.log"
REQUEST_LOG="$LOG_DIR/request.log"

if [ -d "$LANDING_SRC" ]; then
  # Sin preservar owner/group para evitar errores, y asignando propiedad al vuelo
  rsync -av --delete --no-owner --no-group --chown=www-data:www-data \
    "$LANDING_SRC" "$LANDING_DEST"
fi

mkdir -p "$LOG_DIR"
chown devuser:devuser "$LOG_DIR"
for file in "$LOG_FILE" "$REQUEST_LOG"; do
  touch "$file"
  chown devuser:devuser "$file"
done

export PATH="/home/devuser/.local/bin:$PATH"
cd /home/devuser/talia/backend

exec /usr/sbin/runuser -u devuser -- /home/devuser/.local/bin/poetry run \
  uvicorn app.main:app --host 0.0.0.0 --port 8004 --proxy-headers
