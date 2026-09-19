#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/var/www/talia"
BACKEND_DIR="$BASE_DIR/backend"
mkdir -p "$BASE_DIR/logs"
cd "$BACKEND_DIR"

VENV_PY="$BACKEND_DIR/.venv/bin/python"
if [[ -x "$VENV_PY" ]]; then
  exec "$VENV_PY" -m app.workers.postmark_preparer
fi

exec /usr/bin/python3 -m app.workers.postmark_preparer
