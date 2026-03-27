# E10 - Observabilidad minima por ambiente

## Objetivo
Ejecutar probes periodicos de salud para `production` y `staging` con alerta basica y bitacora local.

## Archivos
- `scripts/monitor_env_health.sh`
- `scripts/install_observability_timers.sh`
- `infra/systemd/talia-observability-production.service`
- `infra/systemd/talia-observability-production.timer`
- `infra/systemd/talia-observability-staging.service`
- `infra/systemd/talia-observability-staging.timer`
- `infra/env/observability.production.env.example`
- `infra/env/observability.staging.env.example`

## Checks incluidos
- `api_health` (`GET /api/health` local por puerto del ambiente)
- `panel_dashboard` (`GET /dashboard` via dominio publico)
- `auth_login` (`POST /api/auth/login` sintetico; respuesta esperada `401` o equivalente controlado)

## Umbrales por defecto
- `API_HEALTH_MAX_MS=300`
- `AUTH_LOGIN_MAX_MS=1200`
- `DASHBOARD_MAX_MS=2500`

## Activacion
```bash
cd /var/www/talia
sudo bash scripts/install_observability_timers.sh
```

## Variables opcionales de alerta
Copiar y editar:
- `cp infra/env/observability.production.env.example .env.observability.production`
- `cp infra/env/observability.staging.env.example .env.observability.staging`

Variables:
- `ALERT_WEBHOOK_URL=`
- `ALERT_EMAIL=`
- umbrales `*_MAX_MS`
- control de reintentos:
  - `MAX_ATTEMPTS=2`
  - `RETRY_SLEEP_SECONDS=1`

## Verificacion rapida
```bash
systemctl list-timers --all | grep talia-observability-
systemctl status talia-observability-production.timer --no-pager
systemctl status talia-observability-staging.timer --no-pager

tail -n 20 /var/www/talia/logs/observability/production-health.log
tail -n 20 /var/www/talia/logs/observability/staging-health.log
```
