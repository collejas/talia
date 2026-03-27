#!/usr/bin/env bash
set -euo pipefail

# Instala y activa probes de observabilidad minima por ambiente.
# Uso:
#   sudo bash scripts/install_observability_timers.sh

ROOT_DIR="/var/www/talia"
SYSTEMD_DIR="/etc/systemd/system"

install -m 0644 "${ROOT_DIR}/infra/systemd/talia-observability-production.service" "${SYSTEMD_DIR}/talia-observability-production.service"
install -m 0644 "${ROOT_DIR}/infra/systemd/talia-observability-production.timer" "${SYSTEMD_DIR}/talia-observability-production.timer"
install -m 0644 "${ROOT_DIR}/infra/systemd/talia-observability-staging.service" "${SYSTEMD_DIR}/talia-observability-staging.service"
install -m 0644 "${ROOT_DIR}/infra/systemd/talia-observability-staging.timer" "${SYSTEMD_DIR}/talia-observability-staging.timer"

if [[ ! -f "${ROOT_DIR}/.env.observability.production" ]]; then
  install -m 0644 "${ROOT_DIR}/infra/env/observability.production.env.example" "${ROOT_DIR}/.env.observability.production"
fi

if [[ ! -f "${ROOT_DIR}/.env.observability.staging" ]]; then
  install -m 0644 "${ROOT_DIR}/infra/env/observability.staging.env.example" "${ROOT_DIR}/.env.observability.staging"
fi

systemctl daemon-reload
systemctl enable --now talia-observability-production.timer
systemctl enable --now talia-observability-staging.timer

systemctl start talia-observability-production.service
systemctl start talia-observability-staging.service

echo "Timers activos:"
systemctl list-timers --all | grep 'talia-observability-' || true

echo "Ultimas lineas de log (production):"
tail -n 5 /var/www/talia/logs/observability/production-health.log || true

echo "Ultimas lineas de log (staging):"
tail -n 5 /var/www/talia/logs/observability/staging-health.log || true
