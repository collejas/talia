# Bootstrap inicial de staging

Este paquete prepara la base técnica para iniciar Fase 1 del plan sin tocar producción.

Archivos incluidos:
- `scripts/deploy_panel_staging_atomic.sh`
- `infra/systemd/talia-api-staging.service`
- `infra/systemd/talia-panel-staging.service`
- `infra/nginx/staging.talia.mx.conf.example`
- `backend/.env.staging.example`
- `frontend/panel/.env.staging.example`

## Pasos sugeridos
Opción rápida (recomendada):
- `sudo bash scripts/bootstrap_staging_root.sh`

Esta opción instala servicios systemd + sitio Nginx de staging y levanta ambos servicios.

Opción paso a paso:
1. Crear archivos reales de entorno:
- `cp backend/.env.staging.example backend/.env.staging`
- `cp frontend/panel/.env.staging.example frontend/panel/.env.staging`
- completar secretos reales

2. Instalar servicios systemd staging:
- copiar unit files desde `infra/systemd/` a `/etc/systemd/system/`
- `sudo systemctl daemon-reload`
- `sudo systemctl enable --now talia-api-staging.service`
- `sudo systemctl enable --now talia-panel-staging.service`

3. Configurar Nginx staging:
- copiar `infra/nginx/staging.talia.mx.conf.example` a `sites-available`
- habilitar sitio y validar con `nginx -t`
- recargar nginx

4. Deploy del panel staging:
- `bash scripts/deploy_panel_staging_atomic.sh`

## Nota importante
Estos archivos son plantillas de arranque. Ajustar rutas/puertos/env según política final del equipo antes de activar en servidor.
