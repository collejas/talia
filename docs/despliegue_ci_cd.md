# Estrategia de despliegue y CI/CD · Fase 0

## Arquitectura objetivo
- **Front (landing)**: se mantiene como sitio estático servido por Nginx en el droplet actual (`/var/www/talia-landing`). Se automatiza sincronización desde GitHub.
- **Backend FastAPI**: contenedor Docker ejecutando `uvicorn` detrás de Nginx (proxy en `/api/`). Logs enviados a `journald` o `docker logs` con forward a almacenamiento central futuro.
- **Servicios externos**: Twilio, OpenAI, Supabase/Postgres gestionados por proveedores.

## Ambientes
1. **Local** (`docker compose`): desarrollo de endpoints y pruebas.
2. **Staging** (droplet DigitalOcean secundario o namespace adicional): pruebas con Twilio sandbox y base superset (opcional en Fase 1).
3. **Producción** (droplet actual): landing + backend estable.

## Flujo propuesto
```
GitHub (main/pr) → GitHub Actions → build & test → push image (ghcr.io/talia/backend) → deploy vía SSH + docker compose → Nginx proxy → usuarios finales
```

## CI (GitHub Actions)
- Workflow `ci.yml` ejecutado en `pull_request` y `push` a `main`:
  1. Instalar dependencias (poetry/pip).
  2. Correr `ruff` (lint) y `pytest` (tests).
  3. Construir imagen Docker (`docker build`).
- Artefactos: reporte `coverage.xml` (para sonar/quality después).
- Al día de hoy, la suite `poetry run pytest` pasa 8 pruebas y mantiene 2 `skip` correspondientes a integraciones pendientes (Twilio voz/WhatsApp).

## CD (deploy)
- Workflow `deploy.yml` disparado en `push` a `main` con tag `deploy-backend` o al crear release.
- Pasos:
  1. Log in a `ghcr.io`.
  2. Build + push imagen con tag `main-<sha>` y `latest`.
  3. Conectar vía SSH al droplet (usuario `deploy` con key dedicada).
  4. Ejecutar `docker compose pull && docker compose up -d --remove-orphans` dentro de `/opt/talia-backend`.
- Para la landing, reusar el mismo pipeline con job separado `deploy-landing` que sincroniza `landing/src` usando `rsync` (modo `--delete --checksum`).

## Infraestructura mínima
- Crear carpeta `/opt/talia-backend` en el servidor con los archivos:
  - `docker-compose.yml` (servicio `api` + red `proxy` compartida con Nginx).
  - `.env` (variables sensibles desde bóveda, no versionado).
  - `compose.override.yml` para staging/local.
- Asegurar `systemd` unit `docker-compose@talia-backend.service` opcional para autorestart.

## Seguridad
- Limitar permisos de key `deploy` (sin shell interactivo, solo comandos específicos si se requiere).
- Mantener TLS vía Let's Encrypt ya configurado en Nginx.
- Añadir cabeceras de seguridad en Nginx (`Strict-Transport-Security`, `Content-Security-Policy` básica) en fase posterior.

## Backups
- Script `backend/scripts/backup_db.py` genera dumps completos (`.dump`) y de sólo esquema (`.sql`) usando `pg_dump`. Toma credenciales de `backend/.env` o de `DATABASE_URL` y debe integrarse a cron/CI antes de cada despliegue.

## Observabilidad local
- `backend/app/core/logging.py` emite JSON a stdout y a `/home/devuser/talia/logs/api.log` (rotación automática 5×10 MB) más archivos separados (`request.log`, `webchat.log`, `whatsapp.log`, `voice.log`).
- `backend/app/core/middleware.py` agrega `RequestLoggingMiddleware` con `request_id`. Ver registros recientes con `journalctl -u talia-api.service -f`.

## Próximos pasos
1. Definir si se usará Kubernetes/Supabase hosting en el futuro; de momento se conserva `docker compose` para velocidad.
2. Preparar `infra/` en el repo con plantillas (`docker-compose.yml`, `deploy.sh`, `github/workflows/ci.yml`, `github/workflows/deploy.yml`).
3. Habilitar GitHub Environments (`staging`, `production`) con secrets (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`).
4. Crear pipeline `deploy-landing` que ejecute `rsync` + `pm2 reload nginx` (o `sudo systemctl reload nginx`).
