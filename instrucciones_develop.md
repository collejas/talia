INSTRUCCIONES: DEPLOY DESDE DEVELOP A STAGING (staging.talia.mx)

Objetivo:
- Hacer cambios en rama `develop`.
- Desplegar a `staging` sin afectar producción.
- Validar cambios funcionales antes de promover a `main`.

IMPORTANTE:
- No uses servicios de producción (`talia-api.service` / `talia-panel.service`) mientras estés trabajando en staging.
- Para staging usa solo:
  - `talia-api-staging.service`
  - `talia-panel-staging.service`
- `talia-api-staging.service` y `talia-panel-staging.service` corren como `jorge`, no como `root`.
- El deploy de frontend en staging ya es no interactivo para reinicios de servicios; no hace falta `sudo systemctl ...` manual para el flujo normal.
- La política `NOPASSWD` esperada para deploys está documentada en:
  - `infra/sudoers/talia-staging-deploy.sudoers`
  - `infra/sudoers/talia-production-deploy.sudoers`

1) Ir al repo y actualizar `develop`
cd /var/www/talia
git checkout develop
git pull origin develop

2) Si hubo cambios en FRONTEND (panel Next.js)
Comando recomendado:
cd /var/www/talia
bash scripts/deploy_panel_staging_atomic.sh

Variante rápida si solo quieres saltarte lint:
cd /var/www/talia
SKIP_LINT=1 bash scripts/deploy_panel_staging_atomic.sh

Este script ya hace:
- `npm ci` si hace falta en el release temporal
- `npx tsc --noEmit`
- `npm run lint` salvo que `SKIP_LINT=1`
- `npm run build`
- swap atómico del release en `/var/www/talia/current/panel-staging`
- restart de `talia-panel-staging.service`
- restart de API solo si `RESTART_API=1`
- limpieza de releases viejos

Variables útiles:
- `SKIP_LINT=1`: omite lint
- `SKIP_TS=1`: omite TypeScript
- `SKIP_BUILD=1`: omite build
- `SKIP_RESTART=1`: no reinicia servicios
- `RESTART_API=1`: reinicia también `talia-api-staging.service`

3) Si hubo SOLO cambios en BACKEND (FastAPI)
cd /var/www/talia/backend
poetry install
sudo systemctl restart talia-api-staging.service
sudo systemctl is-active --quiet talia-api-staging.service

4) Si hubo cambios en FRONTEND y BACKEND al mismo tiempo
cd /var/www/talia
RESTART_API=1 bash scripts/deploy_panel_staging_atomic.sh

Variante rápida:
cd /var/www/talia
RESTART_API=1 SKIP_LINT=1 bash scripts/deploy_panel_staging_atomic.sh

5) Verificar servicios y sitio en staging
Verificación operativa:
systemctl is-active talia-api-staging.service talia-panel-staging.service
curl -I https://staging.talia.mx

Verificación funcional recomendada:
- abre la ruta que realmente cambiaste en `https://staging.talia.mx`
- si el cambio fue en panel SSR o vistas CRM, valida también una página funcional concreta, por ejemplo:
  - `https://staging.talia.mx/dashboard`
  - `https://staging.talia.mx/mapa-de-conversion`

Resultado esperado:
- ambos servicios en `active`
- HTTP 200 en staging
- la funcionalidad modificada visible y estable tras refrescar

6) Ver logs si algo falla
sudo journalctl -u talia-api-staging.service -n 120 --no-pager
sudo journalctl -u talia-panel-staging.service -n 120 --no-pager

y logs de archivos locales:
tail -n 120 /var/www/talia/logs/panel-staging.log
tail -n 120 /var/www/talia/logs/panel-staging-error.log
tail -n 120 /var/www/talia/logs/api-staging.log
tail -n 120 /var/www/talia/logs/request-staging.log

7) Troubleshooting útil
Si falta espacio o quieres mantenimiento de disco:
sudo bash scripts/cleanup_disk.sh

Si hiciste cambios en unit files de systemd:
sudo systemctl daemon-reload
sudo systemctl restart talia-api-staging.service
sudo systemctl restart talia-panel-staging.service

Si aparece un error de permisos en logs o archivos temporales:
ls -l /var/www/talia/logs
ls -ld /var/www/talia/releases/panel-staging /var/www/talia/current /var/www/talia/.npm-cache

Si necesitas compilar pero no reiniciar todavía:
cd /var/www/talia
SKIP_RESTART=1 bash scripts/deploy_panel_staging_atomic.sh

8) Rollback rápido de staging (si un release falla)
VALID_RELEASES="$(ls -1dt /var/www/talia/releases/panel-staging/* | grep -v '\\.tmp$')"
LATEST="$(echo "$VALID_RELEASES" | sed -n '1p')"
PREV="$(echo "$VALID_RELEASES" | sed -n '2p')"
ln -sfn "$PREV" /var/www/talia/current/panel-staging
sudo systemctl restart talia-panel-staging.service
sudo systemctl is-active --quiet talia-panel-staging.service

Notas:
- URL correcta de pruebas: `https://staging.talia.mx`
- Producción (`https://talia.mx`) queda intacta mientras trabajas en staging.

9) Cuando staging pasa todo, promover a producción

9.1) Pasar cambios de `develop` a `main` (Git)
cd /var/www/talia
git checkout main
git pull origin main
git merge --no-ff develop -m "release: promote develop to main"
git push origin main

9.2) Si hay migraciones DB en `supabase/migrations` (OBLIGATORIO)
- Hacer backup pre-release de producción.
- Aplicar primero en staging y validar.
- Aplicar el mismo set en producción.

9.3) Deploy de producción si hubo cambios de FRONTEND
cd /var/www/talia
bash scripts/deploy_panel_atomic.sh

Variante rápida:
cd /var/www/talia
SKIP_LINT=1 bash scripts/deploy_panel_atomic.sh

9.4) Deploy de producción si hubo cambios SOLO de BACKEND
cd /var/www/talia/backend
poetry install
sudo systemctl restart talia-api.service
sudo systemctl is-active --quiet talia-api.service

9.5) Si hubo cambios de FRONTEND y BACKEND en producción
Primero backend, luego panel:
cd /var/www/talia/backend
poetry install
sudo systemctl restart talia-api.service
sudo systemctl is-active --quiet talia-api.service

cd /var/www/talia
bash scripts/deploy_panel_atomic.sh

10) Verificación post-deploy en producción
systemctl is-active talia-api.service talia-panel.service
curl -I https://talia.mx
curl -s -o /dev/null -w "dashboard=%{http_code}\n" https://talia.mx/dashboard

Resultado esperado:
- ambos servicios de producción en `active`
- HTTP 200 en `/` y `/dashboard`
- la funcionalidad modificada visible en producción

11) Rollback rápido de producción (si falla)
VALID_RELEASES="$(ls -1dt /var/www/talia/releases/panel/* | grep -v '\\.tmp$')"
LATEST="$(echo "$VALID_RELEASES" | sed -n '1p')"
PREV="$(echo "$VALID_RELEASES" | sed -n '2p')"
ln -sfn "$PREV" /var/www/talia/current/panel
sudo systemctl restart talia-panel.service
sudo systemctl is-active --quiet talia-panel.service

12) Checklist oficial (recomendado en cada release)
- Archivo: `checklists/RELEASE_STAGING_A_PROD.md`
- Marca `OK/FAIL` en cada paso antes de promover a producción.
