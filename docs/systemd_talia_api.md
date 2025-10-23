# Servicio systemd para TalIA API

Usa este archivo de unidad y el script con ruta absoluta a Poetry para que el servicio arranque correctamente bajo systemd.

## 1) Archivo de unidad `/etc/systemd/system/talia-api.service`

Copiar exactamente este contenido (sin guiones, ni indentaciones adicionales):

```ini
[Unit]
Description=TalIA FastAPI service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/devuser/talia/backend
ExecStart=/home/devuser/talia/backend/scripts/run_api.sh
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

> Nota: Ejecuta como root porque el script hace `rsync` y `chown`. Dentro del script bajamos privilegios al lanzar Uvicorn con `devuser`.

## 2) Script `backend/scripts/run_api.sh`

Asegúrate de que la última línea usa la ruta absoluta de Poetry. Puedes reemplazar el script por este contenido completo:

```bash
#!/usr/bin/env bash
set -euo pipefail

LANDING_SRC="/home/devuser/talia/landing/src/"
LANDING_DEST="/var/www/talia-landing/"
LOG_DIR="/home/devuser/talia/logs"
LOG_FILE="$LOG_DIR/api.log"
REQUEST_LOG="$LOG_DIR/request.log"
WEBCHAT_LOG="$LOG_DIR/webchat.log"

if [ -d "$LANDING_SRC" ]; then
  rsync -av --delete "$LANDING_SRC" "$LANDING_DEST"
  chown -R www-data:www-data "$LANDING_DEST"
fi

mkdir -p "$LOG_DIR"
chown devuser:devuser "$LOG_DIR"
for file in "$LOG_FILE" "$REQUEST_LOG" "$WEBCHAT_LOG"; do
  touch "$file"
  chown devuser:devuser "$file"
done

cd /home/devuser/talia/backend

# Lanza Uvicorn como devuser usando Poetry con ruta absoluta
exec /usr/sbin/runuser -u devuser -- /home/devuser/.local/bin/poetry run \
  uvicorn app.main:app --host 0.0.0.0 --port 8004 --proxy-headers
```

Hazlo ejecutable si aún no lo es:

```bash
chmod +x /home/devuser/talia/backend/scripts/run_api.sh
```

## 3) Recargar y arrancar el servicio

```bash
sudo systemctl daemon-reload
sudo systemctl enable talia-api.service
sudo systemctl restart talia-api.service
sudo systemctl status talia-api.service --no-pager -l
```

Si hubiera errores, consulta logs:

```bash
sudo journalctl -u talia-api.service -n 200 --no-pager
```

