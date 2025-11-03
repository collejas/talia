# Configuración Nginx para TalIA (Next.js sirviendo en la raíz)

Este archivo parte de la premisa de que el backend legacy en 8004 ya no se usa y que todo el frontend (incluyendo login y dashboard) vive en el Next.js alojado en `127.0.0.1:8004`. Con este ajuste, las rutas públicas serán directas (`https://talia.mx/`, `https://talia.mx/auth/login`, `https://talia.mx/dashboard`, etc.), sin el prefijo `panel-react`.

Aspectos clave:
- `/` y cualquier ruta dinámica (excepto las estáticas de la landing si decides conservarla) se proxéan al Next.js.
- `/panel/` y `/panel-react/` redirigen a `/` para mantener la compatibilidad.
- Si agregas rutas API dentro de Next (por ejemplo `src/app/api/*`), el bloque `/api/` reenvía las solicitudes al mismo servidor de Next.
- Si aún necesitas archivos de la landing antigua (`/var/www/talia-landing`), deja esas rutas como estáticos específicos o migra los assets a la carpeta `public/` de Next.

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name talia.mx www.talia.mx;

    add_header X-Content-Type-Options "nosniff";

    # Aplicación Next.js (todas las vistas públicas)
    location / {
        proxy_pass http://127.0.0.1:8004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    # API opcional servida por Next.js (app/api/*)
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:8004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    # Assets estáticos generados por Next.js
    location ^~ /_next/static/ {
        proxy_pass http://127.0.0.1:8004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Imágenes optimizadas por Next.js
    location ^~ /_next/image {
        proxy_pass http://127.0.0.1:8004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Otros endpoints internos de Next.js (datos, etc.)
    location ^~ /_next/ {
        proxy_pass http://127.0.0.1:8004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }


    # Cache agresiva para assets generados por Next
    location ~* ^/panel-react/_next/static/ {
        proxy_pass http://127.0.0.1:8004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Assets estáticos del panel (imágenes, fuentes, etc.)
    location ~* ^/panel-react/(.*\.(?:js|css|png|jpg|jpeg|gif|ico|svg|webp|woff|woff2))$ {
        proxy_pass http://127.0.0.1:8004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "public, max-age=86400";
    }

    # Normalizar /panel-react sin slash
    location = /panel-react {
        return 301 /;
    }

    # Redirecciones legacy
    location ^~ /panel/ {
        return 301 /;
    }
    location ^~ /panel-react/ {
        return 301 /;
    }

    # Activos heredados de la landing (opcional). Si ya migraste todo a Next, elimina estas reglas.
    location ~* ^/landing-assets/(.*\.(?:css|js|png|jpg|jpeg|gif|webp|ico))$ {
        root /var/www/talia-landing;
        add_header Cache-Control "public, max-age=86400";
        try_files $uri =404;
    }

    ssl_certificate /etc/letsencrypt/live/talia.mx/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/talia.mx/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

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

### Pasos recomendados
1. Detén y deshabilita el servicio legacy (`sudo systemctl stop talia-api.service`, `sudo systemctl disable talia-api.service`).
2. Configura un unit systemd (por ejemplo `talia-panel.service`) que ejecute `npm run start -- -p 8004` en `~/talia/frontend/panel` y reinicie automáticamente.
3. Copia esta configuración a `/etc/nginx/sites-available/talia`, ejecuta `sudo nginx -t`, `sudo systemctl daemon-reload` y `sudo systemctl reload nginx`.
4. Verifica:
   - `curl -I https://talia.mx/` → 200 del Next.js.
   - `curl -I https://talia.mx/auth/login` → 200.
   - `curl -I https://talia.mx/_next/static/...` → 200.
   - `curl -I https://talia.mx/panel-react/` → 301 → `/`.

Siempre que agregues más rutas o activos estáticos, publícalos en la carpeta `public/` del proyecto Next y, si hace falta, ajusta estas reglas.
