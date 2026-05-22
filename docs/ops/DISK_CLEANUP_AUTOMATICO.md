# Limpieza automatica de disco

## Archivos
- `scripts/cleanup_disk.sh`
- `scripts/install_disk_cleanup_timer.sh`
- `infra/systemd/talia-disk-cleanup.service`
- `infra/systemd/talia-disk-cleanup.timer`
- `infra/env/disk_cleanup.env.example`

## Instalacion
```bash
cd /var/www/talia
sudo bash scripts/install_disk_cleanup_timer.sh
```

## Ajustes opcionales
Editar:
- `/var/www/talia/.env.disk_cleanup`

Variables principales:
- `KEEP_PROD_RELEASES`
- `KEEP_STG_RELEASES`
- `KEEP_BACKUPS`
- `JOURNAL_VACUUM_TIME`
- `KEEP_LOG_DAYS`
- `RUN_LOGS_PURGE`
- `KEEP_CURRENT_LOGS`
- `RUN_USER_LOG_CLEAN`
- `USER_HOME_DIRS`
- `DRY_RUN`

Notas:
- `scripts/cleanup_disk.sh` limpia `logs/` y también logs sueltos de nivel raíz dentro de cada proyecto, por ejemplo `denue_merge.log` o `frontend/panel/build.log`.
- Por defecto también procesa `/var/www/PUI` y `/var/www/maria_imlux`.
- Si existen, limpia sus logs de `frontend/.next/dev/logs` y corre `git gc` sobre esos repos para reducir reflogs y objetos sueltos.
- También limpia logs de usuario en `/home/jorge`, incluyendo `.npm/_logs`, `.vscode-server`, `.codex/log` y `.twilio-cli`.
- Con `RUN_LOGS_PURGE=1` borra rotados (`.log.*`, `.out`, `.err`) aunque todavía no hayan vencido; con `KEEP_CURRENT_LOGS=1` conserva los `.log` activos.

## Verificacion
```bash
systemctl status talia-disk-cleanup.timer --no-pager
systemctl list-timers --all | grep talia-disk-cleanup
tail -n 50 /var/www/talia/logs/maintenance/disk_cleanup.log
```
