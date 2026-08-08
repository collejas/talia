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
- El deploy de panel en producción ya soporta reinicio no interactivo con `sudoers` restringido.
- `talia-api.service` y `talia-panel.service` corren como `jorge`, no como `root`.
- Si aparecen errores de permisos, revisar ownership en `/var/www/talia/logs`, releases y archivos creados por procesos anteriores.
- La política `NOPASSWD` esperada para deploys está documentada en:
  - `infra/sudoers/talia-staging-deploy.sudoers`
  - `infra/sudoers/talia-production-deploy.sudoers`

1) Pre-check antes de promover
cd /var/www/talia
git checkout develop
git pull origin develop
git status

Resultado esperado:
- `working tree clean`
- `develop` actualizado y probado en staging

2) Merge de `develop` a `main`
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

4) Deploy de producción si hubo cambios de FRONTEND
Comando recomendado:
cd /var/www/talia
bash scripts/deploy_panel_atomic.sh

Variante rápida:
cd /var/www/talia
SKIP_LINT=1 bash scripts/deploy_panel_atomic.sh

Este script ya hace:
- `npm ci` si hace falta en el release temporal
- `npx tsc --noEmit`
- `npm run lint` salvo que `SKIP_LINT=1`
- `npm run build`
- swap atómico del release en `/var/www/talia/current/panel`
- restart de `talia-panel.service`
- restart de API solo si `RESTART_API=1`
- limpieza de releases viejos

Variables útiles:
- `SKIP_LINT=1`: omite lint
- `SKIP_TS=1`: omite TypeScript
- `SKIP_BUILD=1`: omite build
- `SKIP_RESTART=1`: no reinicia servicios
- `RESTART_API=1`: reinicia también `talia-api.service`

5) Deploy de producción si hubo SOLO cambios de BACKEND
cd /var/www/talia/backend
poetry install
sudo systemctl restart talia-api.service
sudo systemctl is-active --quiet talia-api.service

6) Si hubo cambios de FRONTEND y BACKEND al mismo tiempo
codex resume 019f4916-b736-7eb0-a99f-90c5c867c33b
cd /var/www/talia
RESTART_API=1 bash scripts/deploy_panel_atomic.sh

Variante rápida:
cd /var/www/talia
RESTART_API=1 SKIP_LINT=1 bash scripts/deploy_panel_atomic.sh

7) Verificación post-deploy en producción
Verificación operativa:
systemctl is-active talia-api.service talia-panel.service
curl -I https://talia.mx
curl -s -o /dev/null -w "dashboard=%{http_code}\n" https://talia.mx/dashboard

Verificación funcional recomendada:
- abre la ruta que realmente cambiaste en `https://talia.mx`
- si el cambio fue en panel SSR o vistas CRM, valida también una página funcional concreta

Resultado esperado:
- ambos servicios en `active`
- HTTP 200 en `/` y `/dashboard`
- la funcionalidad modificada visible y estable tras refrescar

8) Logs si algo falla
sudo journalctl -u talia-api.service -n 120 --no-pager
sudo journalctl -u talia-panel.service -n 120 --no-pager

y logs de archivos locales:
tail -n 120 /var/www/talia/logs/panel.log
tail -n 120 /var/www/talia/logs/panel-error.log
tail -n 120 /var/www/talia/logs/api.log
tail -n 120 /var/www/talia/logs/request.log

9) Troubleshooting útil
* Si falta espacio o quieres mantenimiento de disco:
sudo bash scripts/cleanup_disk.sh

* Esto también limpia logs locales viejos como `logs/*.log`, `denue_merge.log` y `frontend/panel/*.log`
* También incluye `PUI`, `maria_imlux`, `/home/devuser/richard` y `/home/devuser/talia` por defecto, y sus logs de `frontend/.next/dev/logs` si existen
* También limpia logs de usuario en `/home/jorge` como `.npm/_logs`, `.vscode-server`, `.codex/log` y `.twilio-cli`
* También limpia caches de usuario de npm, Playwright y Go, y recorta versiones viejas de VS Code Server

* Si quieres dejarlo explícito para GitHub/gh:
sudo RUN_USER_GH_CACHE_CLEAN=1 bash scripts/cleanup_disk.sh

* Si quieres purgar logs rotados aunque no hayan vencido:
sudo RUN_LOGS_PURGE=1 KEEP_CURRENT_LOGS=1 bash scripts/cleanup_disk.sh

* Para limpieza más profunda manual
sudo RUN_VSCODE_CACHE_CLEAN=1 RUN_EXTRA_PROJECTS_CLEAN=1 bash scripts/cleanup_disk.sh

* Para limpieza fuerte cuando no estés desarrollando panel en el server
sudo RUN_SOURCE_BUILD_CACHE_CLEAN=1 RUN_VSCODE_CACHE_CLEAN=1 bash scripts/cleanup_disk.sh

Si hiciste cambios en unit files de systemd:
sudo systemctl daemon-reload
sudo systemctl restart talia-panel.service
sudo systemctl restart talia-api.service

Si aparece un error de permisos en logs o archivos temporales:
ls -l /var/www/talia/logs
ls -ld /var/www/talia/releases/panel /var/www/talia/current /var/www/talia/.npm-cache

Si necesitas compilar pero no reiniciar todavía:
cd /var/www/talia
SKIP_RESTART=1 bash scripts/deploy_panel_atomic.sh

10) Rollback rapido de producción
VALID_RELEASES="$(ls -1dt /var/www/talia/releases/panel/* | grep -v '\\.tmp$')"
LATEST="$(echo "$VALID_RELEASES" | sed -n '1p')"
PREV="$(echo "$VALID_RELEASES" | sed -n '2p')"
ln -sfn "$PREV" /var/www/talia/current/panel
sudo systemctl restart talia-panel.service
sudo systemctl is-active --quiet talia-panel.service

11) Checklist recomendado por release
- Archivo: `checklists/RELEASE_STAGING_A_PROD.md`
- Marcar `OK/FAIL` en cada paso antes de cerrar release.
