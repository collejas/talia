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
Description=Tal-IA Panel (Next.js Standalone)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/var/www/talia/current/panel

User=jorge
Group=jorge

Environment=NODE_ENV=production
Environment=PORT=3001
Environment=HOSTNAME=0.0.0.0
Environment=NODE_OPTIONS=--max-old-space-size=384
Environment=PANEL_API_URL=http://127.0.0.1:8004/api
EnvironmentFile=/var/www/talia/current/panel/.env.production

ExecStartPre=/usr/bin/mkdir -p /var/www/talia/logs

ExecStart=/bin/bash -lc '/usr/bin/node /var/www/talia/current/panel/.next/standalone/server.js >> /var/www/talia/logs/panel.log 2>> /var/www/talia/logs/panel-error.log'

Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
