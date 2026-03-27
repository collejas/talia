# Checklist de Release: Staging -> Produccion

Fecha: ________
Release manager: ________
Rama candidata: `develop`
Commit SHA: ________

## 1. Gate en Staging
- [ ] `OK` / `FAIL` `git checkout develop && git pull origin develop`
- [ ] `OK` / `FAIL` Deploy staging: `SKIP_LINT=1 bash scripts/deploy_panel_staging_atomic.sh`
- [ ] `OK` / `FAIL` `systemctl is-active talia-api-staging.service talia-panel-staging.service`
- [ ] `OK` / `FAIL` `curl -I https://staging.talia.mx` (HTTP 200)
- [ ] `OK` / `FAIL` Login tenant `0001`
- [ ] `OK` / `FAIL` Smoke `0001`: dashboard, inbox, crm, webchat

Notas staging:
- ______________________________________

## 2. Base de Datos (si aplica)
- [ ] `N/A` / `OK` / `FAIL` Este release NO incluye migraciones
- [ ] `OK` / `FAIL` Backup pre-release de produccion ejecutado
- [ ] `OK` / `FAIL` Migracion aplicada en staging y validada
- [ ] `OK` / `FAIL` Misma migracion aplicada en produccion

Notas DB:
- ______________________________________

## 3. Promocion Git
- [ ] `OK` / `FAIL` `git checkout main && git pull origin main`
- [ ] `OK` / `FAIL` `git merge --no-ff develop -m "release: promote develop to main"`
- [ ] `OK` / `FAIL` `git push origin main`

## 4. Deploy Produccion
- [ ] `OK` / `FAIL` `SKIP_LINT=1 bash scripts/deploy_panel_atomic.sh`
- [ ] `OK` / `FAIL` `systemctl is-active talia-api.service talia-panel.service`
- [ ] `OK` / `FAIL` `curl -I https://talia.mx` (HTTP 200)
- [ ] `OK` / `FAIL` `curl -s -o /dev/null -w "dashboard=%{http_code}\n" https://talia.mx/dashboard` (=200)
- [ ] `OK` / `FAIL` Login de validacion en produccion

Release activo:
- `readlink -f /var/www/talia/current/panel` -> __________________

## 5. Rollback (solo si hay incidente)
- [ ] `N/A` / `OK` / `FAIL` Rollback requerido
- [ ] `OK` / `FAIL` `ln -sfn "$PREV" /var/www/talia/current/panel`
- [ ] `OK` / `FAIL` `sudo systemctl restart talia-panel.service`
- [ ] `OK` / `FAIL` Validacion post-rollback (`https://talia.mx` = 200)

## 6. Cierre
- [ ] `OK` / `FAIL` Monitoreo 15-30 min sin alertas criticas
- [ ] `OK` / `FAIL` Registro en bitacora/plan actualizado
- [ ] `OK` / `FAIL` Equipo notificado

Decision final:
- [ ] `GO`
- [ ] `NO-GO`

Firmado: __________________
