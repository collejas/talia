INSTRUCCIONES: MERGE A MAIN Y DEPLOY A PRODUCCION (talia.mx)

Objetivo:
- Promover cambios ya validados en `develop` hacia `main`.
- Hacer deploy en producción de forma segura.
- Tener pasos claros de verificación y rollback.

IMPORTANTE:
- Producción usa:
  - `talia-api.service`
  - `talia-panel.service`
- No desplegar a producción si staging no fue validado funcionalmente.

1) Pre-check antes de promover
cd /var/www/talia
git checkout develop
git pull origin develop
git status

Resultado esperado:
- `working tree clean`
- `develop` actualizado y probado en staging

2) Merge de develop a main
cd /var/www/talia
git checkout main
git pull origin main
git merge --no-ff develop -m "release: promote develop to main"
git push origin main

Si hay conflictos:
- Resolver archivos en conflicto.
- `git add <archivo>`
- `git commit`
- `git push origin main`

3) Migraciones de base de datos (si aplica)
Si hay cambios en `supabase/migrations`:
- Confirmar que ya se probaron en staging.
- Respaldar producción antes de aplicar.
- Aplicar exactamente el mismo set de migraciones en producción.

4) Deploy de producción (panel)
cd /var/www/talia
NODE_OPTIONS=--max-old-space-size=1536 bash scripts/deploy_panel_atomic.sh

Notas:
- Este script compila, hace swap atómico de release y reinicia servicios de producción.
- Si falla por sudo no interactivo, usar flujo alterno:

4.1) Flujo alterno (sin restart automático)
cd /var/www/talia
NODE_OPTIONS=--max-old-space-size=1536 SKIP_RESTART=1 bash scripts/deploy_panel_atomic.sh
sudo systemctl restart talia-api.service talia-panel.service
sudo systemctl is-active talia-api.service
sudo systemctl is-active talia-panel.service

Resultado esperado:
- deploy completado
- ambos servicios en `active` tras reinicio manual

5) Verificación post-deploy en producción
systemctl is-active talia-api.service talia-panel.service
curl -I https://talia.mx
curl -s -o /dev/null -w "dashboard=%{http_code}\n" https://talia.mx/dashboard

Resultado esperado:
- ambos servicios en `active`
- HTTP 200 en `/` y `/dashboard`

6) Logs si algo falla
sudo journalctl -u talia-api.service -n 120 --no-pager
sudo journalctl -u talia-panel.service -n 120 --no-pager

7) Rollback rapido de producción
VALID_RELEASES="$(ls -1dt /var/www/talia/releases/panel/* | grep -v '\.tmp$')"
LATEST="$(echo "$VALID_RELEASES" | sed -n '1p')"
PREV="$(echo "$VALID_RELEASES" | sed -n '2p')"
ln -sfn "$PREV" /var/www/talia/current/panel
sudo systemctl restart talia-panel.service
systemctl is-active talia-panel.service

8) Checklist recomendado por release
- Archivo: `checklists/RELEASE_STAGING_A_PROD.md`
- Marcar `OK/FAIL` en cada paso antes de cerrar release.
