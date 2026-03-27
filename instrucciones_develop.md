INSTRUCCIONES: DEPLOY DESDE DEVELOP A STAGING (staging.talia.mx)

Objetivo:
- Hacer cambios en rama develop.
- Compilar y reiniciar servicios de staging.
- Probar en https://staging.talia.mx sin afectar producción.

IMPORTANTE:
- No uses servicios de producción (talia-api.service / talia-panel.service).
- Para staging usa solo:
  - talia-api-staging.service
  - talia-panel-staging.service

1) Ir al repo y actualizar develop
cd /var/www/talia
git checkout develop
git pull origin develop

2) Si hubo cambios en FRONTEND (panel Next.js)
cd /var/www/talia
SKIP_RESTART=0 SKIP_LINT=1 bash scripts/deploy_panel_staging_atomic.sh

Este script ya hace:
- npm ci (si hace falta)
- npx tsc --noEmit
- npm run build
- swap atómico de release
- restart de API y Panel de staging

3) Si hubo SOLO cambios en BACKEND (FastAPI)
cd /var/www/talia/backend
poetry install
sudo systemctl restart talia-api-staging.service

4) Verificar servicios y sitio
systemctl is-active talia-api-staging.service talia-panel-staging.service
curl -I https://staging.talia.mx

Resultado esperado:
- ambos servicios en "active"
- HTTP 200 en staging

5) Ver logs si algo falla
sudo journalctl -u talia-api-staging.service -n 120 --no-pager
sudo journalctl -u talia-panel-staging.service -n 120 --no-pager

6) Rollback rápido de staging (si un release falla)
VALID_RELEASES="$(ls -1dt /var/www/talia/releases/panel-staging/* | grep -v '\\.tmp$')"
LATEST="$(echo "$VALID_RELEASES" | sed -n '1p')"
PREV="$(echo "$VALID_RELEASES" | sed -n '2p')"
ln -sfn "$PREV" /var/www/talia/current/panel-staging
sudo systemctl restart talia-panel-staging.service

Notas:
- URL correcta de pruebas: https://staging.talia.mx
- Producción (https://talia.mx) queda intacta mientras trabajas en staging.

7) Cuando staging pasa todo, promover a producción

7.1) Pasar cambios de develop a main (Git)
cd /var/www/talia
git checkout main
git pull origin main
git merge --no-ff develop -m "release: promote develop to main"
git push origin main

7.2) Si hay migraciones DB en supabase/migrations (OBLIGATORIO)
- Hacer backup pre-release de producción.
- Aplicar primero en staging y validar.
- Aplicar el mismo set en producción.

7.3) Deploy de producción (panel)
cd /var/www/talia
SKIP_LINT=1 bash scripts/deploy_panel_atomic.sh

7.4) Verificación post-deploy en producción
systemctl is-active talia-api.service talia-panel.service
curl -I https://talia.mx
curl -s -o /dev/null -w "dashboard=%{http_code}\n" https://talia.mx/dashboard

Resultado esperado:
- ambos servicios de producción en "active"
- HTTP 200 en / y /dashboard

8) Rollback rápido de producción (si falla)
VALID_RELEASES="$(ls -1dt /var/www/talia/releases/panel/* | grep -v '\\.tmp$')"
LATEST="$(echo "$VALID_RELEASES" | sed -n '1p')"
PREV="$(echo "$VALID_RELEASES" | sed -n '2p')"
ln -sfn "$PREV" /var/www/talia/current/panel
sudo systemctl restart talia-panel.service

9) Checklist oficial (recomendado en cada release)
- Archivo: `checklists/RELEASE_STAGING_A_PROD.md`
- Marca `OK/FAIL` en cada paso antes de promover a producción.
