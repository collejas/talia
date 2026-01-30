# Catálogo de variables: `.env` → configuración por tenant (BD)

Objetivo: decidir qué valores deben quedarse globales en `.env` (infra/runtime) y cuáles deben moverse a BD para poder gestionarlos desde la vista `/settings/tenants` por cada tenant.

**Importante:** este documento lista *nombres de variables*, no valores.

## Checklist

- [ ] Revisar `backend/.env` (global vs por-tenant)
- [ ] Revisar `frontend/panel/.env.local` (global vs por-tenant)
- [ ] Marcar variables como: `global` | `config` | `secret` | `routing`
- [ ] Definir keys finales dentro de `organizaciones.config`
- [ ] Definir claves estándar en `secretos` (nombres canónicos)
- [ ] Acordar qué secretos se cifran con “seguridad extendida”

## Observaciones

- [ ] (pendiente) Notas y decisiones tomadas.

## 1) Global (se queda en `.env` del backend)

Estos valores son de infraestructura o “service role” y no deben configurarse por tenant desde UI:

- `TALIA_ENVIRONMENT`, `TALIA_LOG_LEVEL`, `TALIA_REQUEST_LOG_LEVEL`, `TALIA_LOG_FILE_PATH`, `TALIA_REQUEST_LOG_SKIP_PREFIXES`
- `SUPABASE_URL`, `TALIA_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE`, `TALIA_SUPABASE_SERVICE_ROLE`
- `SUPABASE_ANON_KEY` (solo si el backend lo usa)
- `DATABASE_URL`
- `TALIA_SUPABASE_LEGACY_JWT_SECRET` (si se usa para compatibilidad)

Recomendación:
- Añadir una **master key de cifrado** global (ej. `TALIA_SECRETS_MASTER_KEY`) para cifrar/descifrar valores de `public.secretos` desde el backend.

## 2) Routing por tenant (BD: `public.organizacion_rutas_canal`)

Valores que sirven para “mapear” tráfico entrante a `organizacion_id`:

- Webchat:
  - `WEBCHAT_DEFAULT_TENANT_ALIAS` (se reemplaza por una ruta `canal=webchat`, `clave=<alias>`)
  - `WEBCHAT_TENANT_ALIAS_MAP` (se reemplaza por múltiples rutas)
- WhatsApp:
  - `TWILIO_PHONE_NUMBER` (o múltiples números) → rutas `canal=whatsapp`, `clave=<E.164>`
  - `WHATSAPP_TENANT_PHONE_MAP` (se reemplaza por múltiples rutas)
- Messenger:
  - `MESSENGER_PAGE_ID`/mapeo (si hoy existe como mapa env) → rutas `canal=messenger`, `clave=<page_id>`

## 3) Config por tenant (BD: `public.organizaciones.config`)

Valores no sensibles que quieres editar desde UI por tenant.

Webchat (ejemplos):
- `TALIA_OPENAI_WEBCHAT_ASSISTANT_ID`
- `TALIA_OPENAI_PROMPT_WEBCHAT_VERSION`
- `TALIA_WEBCHAT_INACTIVITY_HOURS`
- `TALIA_WEBCHAT_PERSIST_SESSION`
- `WEBCHAT_REENGAGE_MINUTES`, `WEBCHAT_REENGAGE_MAX_ATTEMPTS`, `WEBCHAT_ESCALATE_MINUTES`
- `TALIA_WEBCHAT_CALENDAR_RESOURCE_ID`
- `TALIA_WEBCHAT_CALENDAR_TIMEZONE`
- `TALIA_WEBCHAT_CALENDAR_DEFAULT_DAYS`
- `TALIA_WEBCHAT_CALENDAR_HOLD_MINUTES`

WhatsApp (ejemplos):
- `WHATSAPP_PROMPT_ID`, `WHATSAPP_PROMPT_VERSION`
- `WHATSAPP_INACTIVITY_MINUTES`, `WHATSAPP_REENGAGE_MINUTES`, `WHATSAPP_ESCALATE_MINUTES`
- `WHATSAPP_SALES_TEMPLATE_SID`
- `WHATSAPP_SALES_APPOINTMENT_TEMPLATE_SID`
- `WHATSAPP_SALES_CANCEL_APPOINTMENT_TEMPLATE_SID`

Messenger (ejemplos):
- `MESSENGER_PROMPT_ID`, `MESSENGER_PROMPT_VERSION`

Otros (según si varía por cliente):
- `TALIA_GEOLOCATION_API_URL`
- `DENUE_BASE_URL`
- `GOOGLE_REDIRECT_URI` (si cambia por dominio/tenant)

## 4) Secretos por tenant (BD: `public.secretos`)

Valores sensibles que NO deben vivir en `.env` por tenant y que la UI debe manejar sin mostrar el valor una vez guardado (solo “actualizar/rotar”).

OpenAI (si quieres llave por tenant):
- `TALIA_OPENAI_API_KEY` / `OPENAI_API_KEY`

Twilio:
- `TWILIO_ACCOUNT_SID` (no siempre secreto, pero sensible)
- `TWILIO_AUTH_TOKEN`
- `VOICE_STREAM_JWT_SECRET` (si se usa)

Messenger:
- `MESSENGER_PAGE_ACCESS_TOKEN`
- `MESSENGER_VERIFY_TOKEN`
- `MESSENGER_APP_SECRET`

Correo/Calendario:
- `TALIA_MAIL_USERNAME`, `TALIA_MAIL_CONTRASENA`
- `TALIA_CALENDARIO_USERNAME`, `TALIA_CALENDARIO_PASSWORD`
- `TALIA_CALENDARIO_SERVER_URL` (puede ser config), etc.

Google:
- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_CLIENT_SECRET`

DENUE:
- `DENUE_TOKEN`

Supabase:
- `SUPABASE_SERVICE_ROLE` **NO** debe ser por tenant (se queda global).

## 5) Panel (`frontend/panel/.env.local`)

Global (infra):
- `PANEL_API_URL`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` (server-side del panel)

Por tenant (a mover a BD, si aplica al producto):
- SMTP del panel (`SMTP_*`) si cada tenant va a enviar con su propio servidor.

## 6) Resultado: estructura de UI (Tenants)

En `/settings/tenants`, por tenant:
- Tab **General**: nombre/dominio/estado + `organizaciones.config` (no sensible).
- Tab **Routing**: CRUD de `organizacion_rutas_canal`.
- Tab **Secretos**: CRUD/rotación de `secretos` (nunca leer el valor).
- Tab **Validación**: botones de “probar” por canal (webchat/whatsapp/messenger).
