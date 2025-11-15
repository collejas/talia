# Configuración Nginx para Tal-IA (landing pública + panel)

Este documento prepara a Nginx para que:

1. `https://talia.mx` sirva **la landing estática** (con el chat del asistente) desde `/var/www/talia-landing`.
2. El **panel (Next.js)** viva detrás de `/panel/*` sin bloquear la landing.
3. Se mantengan disponibles los endpoints del backend FastAPI (`/api/webchat/*`, etc.) que usa el chat.

> Ajusta los puertos si tus servicios corren en otro número:
> - **FastAPI (`talia-api.service`)** → `uvicorn ... --port 8004` (según `backend/scripts/run_api.sh`).
> - **Panel (`talia-panel.service`)** → `next start --port 3001` (puedes cambiar 3001 por el que uses).

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name talia.mx www.talia.mx;

    root /var/www/talia-landing;
    index index.html;

    add_header X-Content-Type-Options "nosniff";

    # --- API del backend (FastAPI) ---
    # Webchat y rutas que expone FastAPI directamente.
    location ^~ /api/webchat {
        proxy_pass http://127.0.0.1:8004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /api;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    location ^~ /api/shared/ {
        proxy_pass http://127.0.0.1:8004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /api;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    location ^~ /api/panel/ {
        proxy_pass http://127.0.0.1:8004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /api;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    location ^~ /api/panel-react/ {
        proxy_pass http://127.0.0.1:8004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /api;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    location = /api/info {
        proxy_pass http://127.0.0.1:8004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /api;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    location = /api/health {
        proxy_pass http://127.0.0.1:8004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /api;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    # Endpoints de KPIs demográficos (FastAPI)
    location ^~ /api/kpis/ {
        proxy_pass http://127.0.0.1:8004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /api;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    # Todas las otras rutas /api/* las atiende Next.js.
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    # --- Panel (Next.js) bajo /panel ---
    location ^~ /panel/ {
        rewrite ^/panel/(.*)$ /$1 break;
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    # Vista de settings del panel.
    location ^~ /settings/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    location = /settings {
        return 301 /settings/;
    }

    # Prospección completo (Next.js)
    location ^~ /prospeccion/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    location = /prospeccion {
        return 301 /prospeccion/;
    }

    # Recursos generados por Next.js.
    location ^~ /_next/static/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location ^~ /_next/image {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location ^~ /_next/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Rutas principales del panel (Next.js) fuera de /panel
    location ~* ^/(auth|dashboard|contactos|leads|visitas|inbox|embudo|agenda|vista-1|mapa-de-conversion|vista-2|settings|prospeccion)(/.*)?$ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    # --- Landing estática (chat) ---
    location ~* \.(?:css|js|mjs|png|jpg|jpeg|gif|ico|svg|webp|woff|woff2|ttf|otf)$ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=86400";
    }

    # Fallback SPA (permite rutas internas del landing).
    location / {
        try_files $uri $uri/ /index.html;
    }

    ssl_certificate /etc/letsencrypt/live/talia.mx/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/talia.mx/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

# (Opcional) Si prefieres mover el panel a panel.talia.mx más adelante,
# apunta el DNS y habilita un bloque como este:
#
# server {
#     listen 443 ssl http2;
#     listen [::]:443 ssl http2;
#     server_name panel.talia.mx;
#
#     add_header X-Content-Type-Options "nosniff";
#
#     location / {
#         proxy_pass http://127.0.0.1:3001;
#         proxy_http_version 1.1;
#         proxy_set_header Host $host;
#         proxy_set_header X-Real-IP $remote_addr;
#         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#         proxy_set_header X-Forwarded-Proto $scheme;
#         proxy_set_header Connection "";
#         proxy_buffering off;
#     }
#
#     location ^~ /_next/ {
#         proxy_pass http://127.0.0.1:3001;
#         proxy_http_version 1.1;
#         proxy_set_header Host $host;
#         proxy_set_header X-Forwarded-Proto $scheme;
#     }
#
#     ssl_certificate /etc/letsencrypt/live/talia.mx/fullchain.pem;
#     ssl_certificate_key /etc/letsencrypt/live/talia.mx/privkey.pem;
#     include /etc/letsencrypt/options-ssl-nginx.conf;
#     ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
# }

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name tal-ia.mx www.tal-ia.mx;

    ssl_certificate /etc/letsencrypt/live/talia.mx/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/talia.mx/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    return 301 https://talia.mx$request_uri;
}

server {
    listen 80;
    listen [::]:80;
    server_name talia.mx www.talia.mx tal-ia.mx www.tal-ia.mx;
    return 301 https://talia.mx$request_uri;
}
```

## Checklist antes de recargar Nginx

1. **Verifica servicios**  
   - `sudo systemctl status talia-api.service` → debe escuchar en el puerto indicado (8004 en el ejemplo).  
   - `sudo systemctl status talia-panel.service` → confirma el puerto (`next start --port 3001`).

2. **Publica la landing actualizada**  
   `sudo rsync -av --delete ~/talia/landing/src/ /var/www/talia-landing/`

3. **Prueba y recarga**  
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. **Validaciones rápidas**  
   - `curl -I https://talia.mx/` → devuelve el HTML de la landing.  
   - `curl -I https://talia.mx/api/webchat/config` → responde FastAPI.  
   - `curl -I https://talia.mx/panel/` → muestra la pantalla de login del panel (Next.js).  
   - Abre `https://talia.mx` y valida que el chat esté operativo; luego entra a `https://talia.mx/panel/auth`.

Con esto los clientes navegan a **talia.mx** y hablan con el asistente inmediatamente, mientras tú conservas el panel administrativo sin cambiar tu flujo actual. Cuando quieras mover el panel a un subdominio independiente, habilita el bloque opcional y apunta DNS.***
