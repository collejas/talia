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
- `DRY_RUN`

Notas:
- `scripts/cleanup_disk.sh` limpia `logs/` y también logs sueltos de nivel raíz dentro de cada proyecto, por ejemplo `denue_merge.log` o `frontend/panel/build.log`.
- Con `RUN_LOGS_PURGE=1` borra rotados (`.log.*`, `.out`, `.err`) aunque todavía no hayan vencido; con `KEEP_CURRENT_LOGS=1` conserva los `.log` activos.

## Verificacion
```bash
systemctl status talia-disk-cleanup.timer --no-pager
systemctl list-timers --all | grep talia-disk-cleanup
tail -n 50 /var/www/talia/logs/maintenance/disk_cleanup.log
```
