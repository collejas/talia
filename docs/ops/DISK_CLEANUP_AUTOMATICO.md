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
- `DRY_RUN`

## Verificacion
```bash
systemctl status talia-disk-cleanup.timer --no-pager
systemctl list-timers --all | grep talia-disk-cleanup
tail -n 50 /var/www/talia/logs/maintenance/disk_cleanup.log
```
