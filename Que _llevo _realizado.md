# Proyecto TalIA

Este repositorio contiene los activos iniciales de TalIA, incluyendo el landing page público y la futura API alojada en DigitalOcean.

## Landing page (talia.mx)

El sitio está inspirado en la experiencia conversacional de OpenAI. Incluye:
- Sección hero con propuesta de valor y vista previa de una conversación.
- Desglose de capacidades, casos de uso y planes de servicio.
- Chat interactivo donde TalIA explica qué puede y qué no puede hacer en la versión demo.
- Formulario de contacto deshabilitado hasta el lanzamiento.

### Estructura

```
landing/
└── src/
    ├── index.html           # Página principal con la estructura de la landing.
    ├── assets/
    │   ├── css/styles.css   # Estilos base, layout y variantes responsivas.
    │   └── js/main.js       # Lógica del chat simulado y utilidades de UI.
    └── data/chat-responses.js # Respuestas y textos reutilizables para el chat.
```

Puedes añadir carpetas hermanas dentro de `assets/` (por ejemplo `img/` o `fonts/`) manteniendo la separación de responsabilidades.

### Cómo previsualizar

1. Abre el archivo `landing/src/index.html` directamente en tu navegador **o** levanta un servidor local:
   ```bash
   cd landing/src
   python3 -m http.server 5173
   ```
2. Visita `http://localhost:5173` para navegar el landing y probar el chat.

Si necesitas adaptar el contenido a otro stack (por ejemplo, Next.js o un generador estático), puedes usar estos archivos como punto de partida.

### Temas de color

Desde el encabezado puedes alternar entre tres combinaciones preconfiguradas:
- `Aurora violeta`: tema oscuro original con un acento violeta añadido.
- `Espectro vibrante`: tema claro con acentos fuertes en naranja, verde y violeta/morado.
- `Nocturno`: esquema negro al estilo OpenAI con acento verde.

La preferencia se guarda en `localStorage`, por lo que la página recuerda el tema elegido en visitas futuras.

### Instalacion de SSL con Cerbot
  - Instala Certbot y el plugin de Nginx (sudo snap install core && sudo snap refresh core, luego sudo snap install --classic certbot y sudo ln -s /snap/bin/certbot /usr/bin/certbot).
  - Verifica que tu bloque server HTTP en /etc/nginx/sites-available/talia pase el lint (sudo nginx -t) y recarga (sudo systemctl reload nginx).
  - Ejecuta Certbot con sudo certbot --nginx -d talia.mx -d www.talia.mx; detectará el bloque existente, solicitará el correo y aceptará los ToS.
  - Acepta la redirección automática a HTTPS; Certbot añadirá un bloque listen 443 ssl con los certificados en /etc/letsencrypt/live/talia.mx/.
  - Comprueba el resultado con sudo nginx -t, sudo systemctl reload nginx, curl -I https://talia.mx y revisa el log /var/log/letsencrypt/letsencrypt.log.
  - Renueva en seco (sudo certbot renew --dry-run); el timer systemd se encargará de reacondicionar el certificado cada ~60 días.


### Configuracion de Certificado de SSL en nginx en puerto 8004 (LISTO)
  server {
      listen 443 ssl http2;
      listen [::]:443 ssl http2;
      server_name talia.mx www.talia.mx;

      root /var/www/talia-landing;
      index index.html;

      add_header Cache-Control "public, max-age=300";
      add_header X-Content-Type-Options "nosniff";

      # FastAPI (puerto 8004)
      location /api/ {
          proxy_pass http://127.0.0.1:8004/;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
          proxy_redirect off;
      }

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



## Avances adicionales
- Se añadió infraestructura backend bajo `backend/` con FastAPI, routers por canal (WhatsApp, webchat, voz) y configuración centralizada (`app/core/`).
- El canal webchat consume el asistente de OpenAI: `app/channels/webchat/service.py` resuelve `TALIA_OPENAI_ASSISTANT_ID`, llama al SDK asíncrono y responde al frontend.
- Servicios compartidos encapsulan clientes de OpenAI y Twilio (`app/services/openai.py`, `app/services/twilio.py`) reutilizando el prefijo `TALIA_` en `.env`.
- Se documentó el prompt comercial en `docs/prompt_landing.md` para capturar nombre, correo y teléfono en menos de seis turnos.
- `docs/despliegue_ci_cd.md` detalla la estrategia de CI/CD (GitHub Actions, build Docker, deploy vía SSH) y coexistencia con Nginx.
- El inventario de credenciales (`docs/credenciales.md`) centraliza Twilio, OpenAI, Supabase y otros servicios con responsables y políticas de rotación.
- Se normalizó el esquema operativo en Supabase (contactos, conversaciones, mensajes, eventos) y se aplicaron políticas RLS específicas mediante la migración `supabase/migrations/20251023_160500_rls_policies.sql`.
- El script `backend/scripts/backup_db.py` genera respaldos automáticos (dump completo y sólo esquema) tomando credenciales desde `backend/.env`.
- Nueva migración `supabase/migrations/20251024_170500_webchat_persistence.sql` añade la función `registrar_mensaje_webchat` para crear contactos/identidades webchat y guardar mensajes desde el backend/conversación.
- El servicio `backend/app/channels/webchat/service.py` ahora persiste mensajes entrantes y salientes en Supabase, anexando IP, user-agent y geolocalización (si `TALIA_GEOLOCATION_API_URL/TOKEN` están configurados); los tests (`poetry run pytest`) pasan 8 suites y mantienen 2 marcadas como `skip`.

## Próximos pasos sugeridos
1. Implementar la lógica real de Twilio WhatsApp (webhook, adjuntos y callbacks) aprovechando los stubs existentes.
2. Completar el flujo de voz en tiempo real usando `<Connect><Stream>` y definir persistencia de transcripts.
3. Construir agregados/consultas para KPIs y exponer endpoints `/api/dashboard/*` basados en el nuevo esquema.
4. Automatizar despliegues con los workflows descritos y sincronización de la landing mediante `rsync`.
