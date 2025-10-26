# Configuración Nginx para TalIA (API + Panel)

Este es el archivo de configuración completo basado en tu setup actual, con la recomendación aplicada para servir también el Panel bajo el prefijo `/panel/`. Puedes copiar y pegarlo en tu configuración.

Notas clave:
- Se mantiene el proxy existente en `^~ /api/` (con `X-Forwarded-Prefix: /api`).
- Se agrega `^~ /panel/` apuntando al mismo backend FastAPI en `127.0.0.1:8004` (con `X-Forwarded-Prefix: /panel`).
- Los bloques `^~` tienen precedencia sobre los regex de estáticos, evitando conflictos con `.css`, `.js`, `.png`, etc.

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name talia.mx www.talia.mx;

    root /var/www/talia-landing;
    index index.html;

    add_header Cache-Control "public, max-age=300";
    add_header X-Content-Type-Options "nosniff";

    # FastAPI (puerto 8004) - API
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:8004;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /api;
        proxy_redirect off;
    }

    # FastAPI (puerto 8004) - Panel estático/SPA bajo /panel
    # Importante: usar ^~ para que este bloque tenga precedencia sobre los regex de estáticos.
    # Nota: La app tiene root_path "/api"; reescribimos /panel/* -> /api/panel/* para que siempre exista.
    location ^~ /panel/ {
        rewrite ^/panel/(.*)$ /api/panel/$1 break;
        proxy_pass http://127.0.0.1:8004;  # upstream en 8004
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /api;  # la app está en root_path /api
        proxy_redirect off;
    }

    # Archivos estáticos de la landing
    location ~* \.(css|js)$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
        try_files $uri =404;
    }

    location ~* \.(svg|png|jpg|jpeg|gif|webp|ico)$ {
        add_header Cache-Control "public, max-age=86400";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ =404;
    }

    ssl_certificate /etc/letsencrypt/live/talia.mx/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/talia.mx/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    listen 80;
    listen [::]:80;
    server_name talia.mx www.talia.mx;
    return 301 https://$host$request_uri;
}
```

Verificación rápida:
- `sudo nginx -t`
- `sudo systemctl reload nginx`
- `curl -I https://talia.mx/api/panel/auth/login.html` → 200
- `curl -I https://talia.mx/panel/auth/login.html` → 200

Frontend ya actualizado:
- El botón "Cerrar sesión" y `ensureSession()` detectan automáticamente si entraste por `/api/panel` o `/panel` y redirigen al prefijo correcto.
