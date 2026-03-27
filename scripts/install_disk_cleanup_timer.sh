#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/var/www/talia"
SYSTEMD_DIR="/etc/systemd/system"

install -m 0644 "${ROOT_DIR}/infra/systemd/talia-disk-cleanup.service" "${SYSTEMD_DIR}/talia-disk-cleanup.service"
install -m 0644 "${ROOT_DIR}/infra/systemd/talia-disk-cleanup.timer" "${SYSTEMD_DIR}/talia-disk-cleanup.timer"

if [[ ! -f "${ROOT_DIR}/.env.disk_cleanup" ]]; then
  install -m 0644 "${ROOT_DIR}/infra/env/disk_cleanup.env.example" "${ROOT_DIR}/.env.disk_cleanup"
fi

systemctl daemon-reload
systemctl enable --now talia-disk-cleanup.timer
systemctl start talia-disk-cleanup.service

echo "Timer activo:"
systemctl status talia-disk-cleanup.timer --no-pager -l | sed -n '1,12p'

echo "Ultimas lineas:"
tail -n 20 "${ROOT_DIR}/logs/maintenance/disk_cleanup.log" || true
