#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/var/www/talia"
SYSTEMD_SRC_DIR="$BASE_DIR/infra/systemd"
NGINX_SRC_FILE="$BASE_DIR/infra/nginx/staging.talia.mx.conf.example"

API_UNIT_SRC="$SYSTEMD_SRC_DIR/talia-api-staging.service"
PANEL_UNIT_SRC="$SYSTEMD_SRC_DIR/talia-panel-staging.service"
API_UNIT_DST="/etc/systemd/system/talia-api-staging.service"
PANEL_UNIT_DST="/etc/systemd/system/talia-panel-staging.service"

NGINX_AVAIL_DST="/etc/nginx/sites-available/staging.talia.mx.conf"
NGINX_ENABLED_DST="/etc/nginx/sites-enabled/staging.talia.mx.conf"

for f in "$API_UNIT_SRC" "$PANEL_UNIT_SRC" "$NGINX_SRC_FILE"; do
  [[ -f "$f" ]] || { echo "Missing required file: $f"; exit 1; }
done

[[ -f "$BASE_DIR/backend/.env.staging" ]] || { echo "Missing $BASE_DIR/backend/.env.staging"; exit 1; }
[[ -f "$BASE_DIR/frontend/panel/.env.staging" ]] || { echo "Missing $BASE_DIR/frontend/panel/.env.staging"; exit 1; }

mkdir -p "$BASE_DIR/current"
ln -sfn "$BASE_DIR/frontend/panel" "$BASE_DIR/current/panel-staging"

install -m 0644 "$API_UNIT_SRC" "$API_UNIT_DST"
install -m 0644 "$PANEL_UNIT_SRC" "$PANEL_UNIT_DST"

install -m 0644 "$NGINX_SRC_FILE" "$NGINX_AVAIL_DST"
ln -sfn "$NGINX_AVAIL_DST" "$NGINX_ENABLED_DST"

systemctl daemon-reload
systemctl enable --now talia-api-staging.service
systemctl enable --now talia-panel-staging.service

nginx -t
systemctl reload nginx

systemctl --no-pager --full status talia-api-staging.service | sed -n '1,30p'
systemctl --no-pager --full status talia-panel-staging.service | sed -n '1,30p'

echo "[ok] staging services enabled and nginx reloaded"
