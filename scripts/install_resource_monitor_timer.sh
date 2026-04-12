#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/var/www/talia"
SYSTEMD_DIR="/etc/systemd/system"

install -m 0644 "${ROOT_DIR}/infra/systemd/talia-resource-health.service" "${SYSTEMD_DIR}/talia-resource-health.service"
install -m 0644 "${ROOT_DIR}/infra/systemd/talia-resource-health.timer" "${SYSTEMD_DIR}/talia-resource-health.timer"

if [[ ! -f "${ROOT_DIR}/.env.resource_health" ]]; then
  install -m 0644 "${ROOT_DIR}/infra/env/resource_health.env.example" "${ROOT_DIR}/.env.resource_health"
fi

systemctl daemon-reload
systemctl enable --now talia-resource-health.timer
systemctl start talia-resource-health.service

echo "Timer activo:"
systemctl status talia-resource-health.timer --no-pager -l | sed -n '1,12p'

echo "Ultimas lineas:"
tail -n 20 "${ROOT_DIR}/logs/maintenance/resource_health.log" || true
