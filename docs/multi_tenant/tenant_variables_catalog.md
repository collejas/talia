# Catálogo de variables: `.env` → configuración por tenant (BD)

Objetivo: decidir qué valores deben quedarse globales en `.env` (infra/runtime) y cuáles deben moverse a BD para poder gestionarlos desde la vista `/settings/tenants` por cada tenant.

**Importante:** este documento lista *nombres de variables*, no valores.

## Checklist

- [ ] Confirmar que **no** se moverán secretos del `backend/.env` a `frontend` (los `NEXT_PUBLIC_*` nunca son secretos)
- [ ] Clasificar variables del backend como: `global` | `config` | `secret` | `routing`
- [ ] Clasificar variables del panel como: `panel_global` | `tenant_config` | `tenant_secret` (solo server-side) | `no_usar`
- [ ] Definir llaves finales dentro de `organizaciones.config` (contrato estable)
- [ ] Definir claves estándar en `secretos` (nombres canónicos)
- [ ] Definir “seguridad extendida” (master key separada) y qué claves entran ahí
- [ ] Plan de migración: valores actuales (tenant legacy) → BD
- [ ] Plan de limpieza: reducir `.env` a mínimos globales

## Observaciones

- [ ] (pendiente) Notas y decisiones tomadas.

## Decisiones confirmadas (producto)

Se decidió que **todos** estos bloques son **POR_TENANT** (se guardan en BD por `organizacion_id`):
- [x] OpenAI `api_key`
- [x] Twilio (cuenta + auth token)
- [x] Meta/Messenger (app secret + page token + verify token)
- [x] Correo (SMTP/IMAP credenciales)
- [x] Calendario (usuario/contraseña/URLs)
- [x] Google Places / OAuth client secret

Implicación: el backend mantiene solo master key(s) globales para cifrar/descifrar, pero los valores viven por tenant en `public.secretos`.

## Inventario actual (extraído de archivos)

### `backend/.env` (nombres detectados)

Infra / runtime (candidatos a **global**):
- `DATABASE_URL`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, `SUPABASE_ANON_KEY`
- `TALIA_SUPABASE_URL`, `TALIA_SUPABASE_SERVICE_ROLE`, `TALIA_SUPABASE_LEGACY_JWT_SECRET`
- `TALIA_ENVIRONMENT`, `TALIA_LOG_LEVEL`, `TALIA_REQUEST_LOG_LEVEL`, `TALIA_LOG_FILE_PATH`, `TALIA_REQUEST_LOG_SKIP_PREFIXES`

IA / modelos (candidatos a **global** o **config** según modelo de negocio):
- `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_MAX_TOKENS`, `OPENAI_PROMPT_ID`, `OPENAI_PROMPT_ID_INSIGHTS`
- `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE`, `OPENAI_STT_MODEL`
- `TALIA_OPENAI_API_KEY`, `TALIA_OPENAI_PROJECT_ID`

Canales (candidatos a **config**/**routing**/**secret**):
- Webchat: `WEBCHAT_DEFAULT_TENANT_ALIAS`, `WEBCHAT_TENANT_ALIAS_MAP`, `WEBCHAT_DEFAULT_ORGANIZACION_ID`
- WhatsApp: `WHATSAPP_TENANT_PHONE_MAP`, `WHATSAPP_DEFAULT_ORGANIZACION_ID`
- Messenger: `MESSENGER_DEFAULT_ORGANIZACION_ID`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_PHONE_NUMBER_SID`, `TWILIO_VALIDATE_SIGNATURES`

Otros proveedores (según tenant):
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PLACES_API_KEY`, `GOOGLE_REDIRECT_URI`
- DENUE: `DENUE_BASE_URL`, `DENUE_TOKEN`
- Brevo: `BREVO_API_KEY`, `BREVO_BASE_URL`

Correo/Calendario:
- `TALIA_MAIL_USERNAME`, `TALIA_MAIL_CONTRASENA`, `TALIA_MAIL_INCOMING_SERVER`, `TALIA_MAIL_INCOMING_PORT_IMAP`, `TALIA_MAIL_OUTGOING_SERVER`, `TALIA_MAIL_OUTGOING_PORT_SMTP`, `TALIA_MAIL_USE_TLS`, `TALIA_MAIL_USE_SSL`
- `TALIA_CALENDARIO_DEFAULT_PROVIDER`, `TALIA_CALENDARIO_USERNAME`, `TALIA_CALENDARIO_PASSWORD`
- `TALIA_CALENDARIO_SERVER_URL`, `TALIA_CALENDARIO_SERVER_URL_ALTERNATE`, `TALIA_CALENDARIO_SERVER_PORT`
- `TALIA_CALENDARIO_FULL_CALENDAR_URL`, `TALIA_CALENDARIO_FULL_CONTACT_LIST_URL`

Inventario completo (lista plana):
- `API_NEARBY_SEARCH`
- `BARGE_ENERGY_HIGH`, `BARGE_ENERGY_LOW`, `BARGE_IN_COOLDOWN_MS`, `BARGE_IN_ENABLED`, `BARGE_IN_MIN_AI_MS`, `BARGE_MIN_SPEECH_MS`, `BARGE_REQUIRE_AI_SPEAKING`, `BARGE_REQUIRE_VAD`
- `BREVO_API_KEY`, `BREVO_BASE_URL`
- `CONVERSATION_SUMMARY_HISTORY_LIMIT`, `CONVERSATION_SUMMARY_MAX_OUTPUT_TOKENS`, `CONVERSATION_SUMMARY_MODEL`, `CONVERSATION_SUMMARY_TEMPERATURE`
- `DEBUG_ENERGY_EVERY_N`, `DEBUG_VOICE_VERBOSE`
- `DENUE_BASE_URL`, `DENUE_TOKEN`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PLACES_API_KEY`
- `GOOGLE_PLACES_DENSE_GRID_MAX_TILE_RADIUS_M`, `GOOGLE_PLACES_DENSE_MAX_RESULTS`, `GOOGLE_PLACES_DENSE_PAUSE_BETWEEN_PAGES`
- `GOOGLE_PLACES_DETAILS_URL`, `GOOGLE_PLACES_GRID_MAX_TILE_RADIUS_M`, `GOOGLE_PLACES_NEARBY_URL`, `GOOGLE_PLACES_PAUSE_BETWEEN_PAGES`, `GOOGLE_PLACES_TEXT_URL`
- `GOOGLE_REDIRECT_URI`
- `MESSENGER_APP_SECRET`, `MESSENGER_DEFAULT_ORGANIZACION_ID`, `MESSENGER_PAGE_ACCESS_TOKEN`, `MESSENGER_PROMPT_ID`, `MESSENGER_PROMPT_VERSION`, `MESSENGER_VERIFY_TOKEN`
- `OPENAI_API_KEY`, `OPENAI_MAX_TOKENS`, `OPENAI_MODEL`, `OPENAI_PROMPT_ID`, `OPENAI_PROMPT_ID_INSIGHTS`, `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE`, `OPENAI_STT_MODEL`
- `PLACES_DETAILS_FIELD_MASK`, `PLACES_FIELD_MASK`
- `PLUSVALICA`
- `REALTIME_CREATE_RESPONSE`, `REALTIME_INPUT_FORMAT`, `REALTIME_INTERRUPT_RESPONSE`, `REALTIME_MIN_COMMIT_MS`, `REALTIME_OUTPUT_FORMAT`, `REALTIME_PREFIX_PADDING_MS`, `REALTIME_TURN_SILENCE_MS`, `REALTIME_VAD_THRESHOLD`
- `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- `TALIA_CALENDARIO_DEFAULT_PROVIDER`, `TALIA_CALENDARIO_FULL_CALENDAR_URL`, `TALIA_CALENDARIO_FULL_CONTACT_LIST_URL`, `TALIA_CALENDARIO_PASSWORD`, `TALIA_CALENDARIO_SERVER_PORT`, `TALIA_CALENDARIO_SERVER_URL`, `TALIA_CALENDARIO_SERVER_URL_ALTERNATE`, `TALIA_CALENDARIO_USERNAME`
- `TALIA_CLIENTE_PORTAL_BASE_URL`
- `TALIA_ENVIRONMENT`
- `TALIA_GEOLOCATION_API_TOKEN`, `TALIA_GEOLOCATION_API_URL`, `TALIA_GEOLOCATION_CACHE_TTL_SECONDS`
- `TALIA_LOG_FILE_PATH`, `TALIA_LOG_LEVEL`
- `TALIA_MAIL_CONTRASENA`, `TALIA_MAIL_INCOMING_PORT_IMAP`, `TALIA_MAIL_INCOMING_SERVER`, `TALIA_MAIL_OUTGOING_PORT_SMTP`, `TALIA_MAIL_OUTGOING_SERVER`, `TALIA_MAIL_USERNAME`, `TALIA_MAIL_USE_SSL`, `TALIA_MAIL_USE_TLS`
- `TALIA_OPENAI_API_KEY`, `TALIA_OPENAI_PROJECT_ID`, `TALIA_OPENAI_PROMPT_WEBCHAT_VERSION`, `TALIA_OPENAI_WEBCHAT_ASSISTANT_ID`
- `TALIA_PORTAL_CLIENTE_URL`
- `TALIA_REQUEST_LOG_LEVEL`, `TALIA_REQUEST_LOG_SKIP_PREFIXES`
- `TALIA_SUPABASE_LEGACY_JWT_SECRET`, `TALIA_SUPABASE_SERVICE_ROLE`, `TALIA_SUPABASE_URL`
- `TALIA_WEBCHAT_CALENDAR_DEFAULT_DAYS`, `TALIA_WEBCHAT_CALENDAR_HOLD_MINUTES`, `TALIA_WEBCHAT_CALENDAR_RESOURCE_ID`, `TALIA_WEBCHAT_CALENDAR_TIMEZONE`, `TALIA_WEBCHAT_INACTIVITY_HOURS`, `TALIA_WEBCHAT_PERSIST_SESSION`
- `TTS_VOICE_ES`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_PHONE_NUMBER_SID`, `TWILIO_VALIDATE_SIGNATURES`
- `VOICE_FULL_DUPLEX`, `VOICE_STREAM_JWT_SECRET`
- `WEBCHAT_DEFAULT_ORGANIZACION_ID`, `WEBCHAT_DEFAULT_TENANT_ALIAS`, `WEBCHAT_ESCALATE_MINUTES`, `WEBCHAT_REENGAGE_MAX_ATTEMPTS`, `WEBCHAT_REENGAGE_MINUTES`, `WEBCHAT_TENANT_ALIAS_MAP`
- `WEBHOOK_PATH`
- `WHATSAPP_DEFAULT_ORGANIZACION_ID`, `WHATSAPP_ESCALATE_MINUTES`, `WHATSAPP_INACTIVITY_MINUTES`, `WHATSAPP_PROMPT_ID`, `WHATSAPP_PROMPT_VERSION`, `WHATSAPP_REENGAGE_MINUTES`
- `WHATSAPP_SALES_APPOINTMENT_TEMPLATE_SID`, `WHATSAPP_SALES_CANCEL_APPOINTMENT_TEMPLATE_SID`, `WHATSAPP_SALES_TEMPLATE_SID`
- `WHATSAPP_TENANT_PHONE_MAP`

### `frontend/panel/.env.local` (nombres detectados)

Nunca deben ser secretos en el browser (públicos por diseño):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_MAPBOX_TOKEN` (es “public token”, aún así conviene rotarlo si se filtra)
- `NEXT_PUBLIC_PANEL_ORIGIN`

Solo server-side del panel (candidatos a secreto/config por tenant si se vuelve multi-tenant en panel):
- `SUPABASE_SERVICE_ROLE`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_USE_SSL`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`

Infra del panel:
- `PANEL_API_URL`
- `NODE_ENV`

Inventario completo (lista plana):
- `NEXT_PUBLIC_MAPBOX_TOKEN`
- `NEXT_PUBLIC_ORGANIZACION_ID`, `NEXT_PUBLIC_USUARIO_ID` (nota: estos “hardcodes” conviene eliminarlos cuando el panel sea realmente multi-tenant)
- `NEXT_PUBLIC_PANEL_ORIGIN`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`
- `NODE_ENV`
- `PANEL_API_URL`, `PANEL_ORGANIZACION_ID`, `TALIA_ORGANIZACION_ID`
- `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `SMTP_HOST`, `SMTP_PASS`, `SMTP_PORT`, `SMTP_USER`, `SMTP_USE_SSL`
- `SUPABASE_ANON_KEY`, `SUPABASE_RESET_REDIRECT_URL`, `SUPABASE_SERVICE_ROLE`, `SUPABASE_URL`

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
  - Page ID → rutas `canal=messenger`, `clave=<page_id>` (si hoy está hardcoded en `.env`, mover a routing)

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

## Nota de seguridad (para decisión de producto)

Guardar secretos en BD **sí puede ser seguro** si se cumplen estas condiciones:
- Cifrado fuerte a nivel de aplicación (antes de persistir), con master key(s) fuera de la BD (en `.env` del backend).
- RLS/políticas y endpoints: solo el backend (service role) y usuarios platform-admin pueden escribir/rotar.
- La UI nunca “lee” el valor del secreto una vez guardado (solo permite rotar/actualizar).
- Auditoría y masking en logs (no registrar tokens).
