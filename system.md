# systemd/system/talia-api.service

[Unit]
Description=TalIA FastAPI service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/var/www/talia/backend
ExecStart=/var/www/talia/backend/scripts/run_api.sh
EnvironmentFile=/var/www/talia/backend/.env
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1
User=root

[Install]
WantedBy=multi-user.target

---

# systemd/system/talia-panel.service

[Unit]
Description=Tal-IA Panel (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/var/www/talia/frontend/panel

# Variables de entorno
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--max-old-space-size=384
Environment=PANEL_API_URL=http://127.0.0.1:8004/api
EnvironmentFile=/var/www/talia/frontend/panel/.env.local
# Nota: si `PANEL_API_URL` también existe en `.env.local`, systemd tomará el valor del archivo
# (por eso conviene que ambos coincidan).

# Crear carpeta de logs
ExecStartPre=/usr/bin/mkdir -p /var/www/talia/logs

# El shell abre los logs como el usuario del servicio y evita que queden root:root.
ExecStart=/bin/bash -lc '/usr/bin/npm run start -- -p 3001 >> /var/www/talia/logs/panel.log 2>> /var/www/talia/logs/panel-error.log'

Restart=on-failure
RestartSec=5
User=jorge
Group=jorge

[Install]
WantedBy=multi-user.target
