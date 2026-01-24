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
Environment=PANEL_API_URL=http://127.0.0.1:8004
EnvironmentFile=/var/www/talia/frontend/panel/.env.local
# Nota: si `PANEL_API_URL` también existe en `.env.local`, systemd tomará el valor del archivo
# (por eso conviene que ambos coincidan).

# Crear carpeta de logs (propietario root)
ExecStartPre=/usr/bin/mkdir -p /var/www/talia/logs
ExecStartPre=/usr/bin/touch /var/www/talia/logs/panel.log
ExecStartPre=/usr/bin/touch /var/www/talia/logs/panel-error.log

# Usamos npm global (ajusta si `which npm` te da otra ruta)
ExecStart=/usr/bin/npm run start -- -p 3001

Restart=on-failure
RestartSec=5
User=root

StandardOutput=append:/var/www/talia/logs/panel.log
StandardError=append:/var/www/talia/logs/panel-error.log

[Install]
WantedBy=multi-user.target
