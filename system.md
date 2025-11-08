# systemd/system/talia-api.service

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

---

# systemd/system/talia-panel.service

[Unit]
Description=Tal-IA Panel (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/devuser/talia/frontend/panel
Environment=NODE_ENV=production
Environment=PANEL_API_URL=http://127.0.0.1:8004/api
Environment=PATH=/home/devuser/.nvm/versions/node/v20.19.5/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStartPre=/usr/bin/install -o devuser -g devuser -m 0755 -d /home/devuser/talia/logs
ExecStartPre=/usr/bin/install -o devuser -g devuser -m 0644 /dev/null /home/devuser/talia/logs/panel.log
ExecStartPre=/usr/bin/install -o devuser -g devuser -m 0644 /dev/null /home/devuser/talia/logs/panel-error.log
ExecStart=/home/devuser/.nvm/versions/node/v20.19.5/bin/npm run start -- -p 3001
Restart=on-failure
RestartSec=5
User=devuser
StandardOutput=append:/home/devuser/talia/logs/panel.log
StandardError=append:/home/devuser/talia/logs/panel-error.log

[Install]
WantedBy=multi-user.target
