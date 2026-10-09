#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/var/www/talia"
UNIT_NAME="talia-prospeccion-atribucion-worker.service"

sudo install -m 0644 "${ROOT_DIR}/infra/systemd/${UNIT_NAME}" "/etc/systemd/system/${UNIT_NAME}"
sudo systemctl daemon-reload
sudo systemctl enable --now "${UNIT_NAME}"
sudo systemctl --no-pager --full status "${UNIT_NAME}"
