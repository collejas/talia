#!/usr/bin/env bash
set -euo pipefail

LANDING_SRC="/home/devuser/talia/landing/src/"
LANDING_DEST="/var/www/talia-landing/"

if [ -d "$LANDING_SRC" ]; then
  rsync -av --delete "$LANDING_SRC" "$LANDING_DEST"
  chown -R www-data:www-data "$LANDING_DEST"
fi

export PATH="/home/devuser/.local/bin:$PATH"
cd /home/devuser/talia/backend

exec /usr/sbin/runuser -u devuser -- poetry run uvicorn app.main:app --host 0.0.0.0 --port 8004
