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
- [x] Brevo (API key + base_url)
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
- Google Places:
  - `GOOGLE_PLACES_API_KEY` → `secretos.google.places_api_key`
  - `API_NEARBY_SEARCH`, `GOOGLE_PLACES_NEARBY_URL` → `organizaciones.config.google_places.nearby_url`
  - `GOOGLE_PLACES_TEXT_URL` → `organizaciones.config.google_places.text_url`
  - `GOOGLE_PLACES_DETAILS_URL` → `organizaciones.config.google_places.details_url`
  - `PLACES_FIELD_MASK` → `organizaciones.config.google_places.field_mask`
  - `PLACES_DETAILS_FIELD_MASK` → `organizaciones.config.google_places.details_field_mask`
  - `GOOGLE_PLACES_GRID_MAX_TILE_RADIUS_M` → `organizaciones.config.google_places.grid_max_tile_radius_m`
  - `GOOGLE_PLACES_PAUSE_BETWEEN_PAGES` → `organizaciones.config.google_places.pause_between_pages`
  - `GOOGLE_PLACES_DENSE_GRID_MAX_TILE_RADIUS_M` → `organizaciones.config.google_places.dense_grid_max_tile_radius_m`
  - `GOOGLE_PLACES_DENSE_PAUSE_BETWEEN_PAGES` → `organizaciones.config.google_places.dense_pause_between_pages`
  - `GOOGLE_PLACES_DENSE_MAX_RESULTS` → `organizaciones.config.google_places.dense_max_results`
  > `API_NEARBY_SEARCH` y `GOOGLE_PLACES_NEARBY_URL` son alias para el mismo valor (`nearby_url`); el formulario “Búsqueda” los expone como un solo campo y guarda los endpoints/límites por tenant para las búsquedas de `/api/prospeccion/google/*`.
- DENUE: `DENUE_BASE_URL` → `organizaciones.config.denue.base_url`, `DENUE_TOKEN` → `secretos.denue.token`
- Brevo: `BREVO_API_KEY`, `BREVO_BASE_URL`

Correo/Calendario:
- `TALIA_MAIL_USERNAME`, `TALIA_MAIL_CONTRASENA`, `TALIA_MAIL_INCOMING_SERVER`, `TALIA_MAIL_INCOMING_PORT_IMAP`, `TALIA_MAIL_OUTGOING_SERVER`, `TALIA_MAIL_OUTGOING_PORT_SMTP`, `TALIA_MAIL_USE_TLS`, `TALIA_MAIL_USE_SSL`
- `TALIA_CALENDARIO_DEFAULT_PROVIDER`, `TALIA_CALENDARIO_USERNAME`, `TALIA_CALENDARIO_PASSWORD`
- `TALIA_CALENDARIO_SERVER_URL`, `TALIA_CALENDARIO_SERVER_URL_ALTERNATE`, `TALIA_CALENDARIO_SERVER_PORT`
- `TALIA_CALENDARIO_FULL_CALENDAR_URL`, `TALIA_CALENDARIO_FULL_CONTACT_LIST_URL`

### Correo (por tenant)
- `TALIA_MAIL_USERNAME` → `mail.username` (secreto, nivel A)
- `TALIA_MAIL_CONTRASENA` → `mail.password` (secreto, nivel B)
- `TALIA_MAIL_INCOMING_SERVER` → `mail.incoming_server`
- `TALIA_MAIL_INCOMING_PORT_IMAP` → `mail.incoming_port_imap`
- `TALIA_MAIL_OUTGOING_SERVER` → `mail.outgoing_server`
- `TALIA_MAIL_OUTGOING_PORT_SMTP` → `mail.outgoing_port_smtp`
- `TALIA_MAIL_USE_SSL` → `mail.use_ssl`
- `TALIA_MAIL_USE_TLS` → `mail.use_tls`
- `BREVO_API_KEY` → `brevo.api_key` (secreto, nivel B)
- `BREVO_BASE_URL` → `brevo.base_url`

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

> Nota: el `backend/.env` todavía define `TALIA_MAIL_*` y `TALIA_CALENDARIO_*` por compatibilidad con el tenant legacy, pero esos valores deben vivir en BD (config + secretos) y solo permanecer en `.env` mientras se migra; el panel ya los edita por tenant.

## Estado actual de la migración (tenant legacy `000...001`)

- `organizaciones.config` del tenant `00000000-0000-0000-0000-000000000001` ya contiene valores para `features`, `webchat.*` (incluyendo calendario), `calendar.*`, `mail.*`, `twilio.*` y `voice.*` tal como los captura la UI de `/settings/tenants`. Los servidores de correo/calendario y los recursos ya apuntan a `mail.talia.mx` y el alias webchat apunta a `pmpt_6963d2de04ac81948b43bf4c7adf24f300a7d41c8e65c375` con los timers deseados.
- `public.secretos` para el mismo tenant almacena los secretos de nivel A/B: `openai.api_key`, `calendar.username`, `calendar.password`, `mail.username`, `mail.password`, `twilio.account_sid` y `twilio.auth_token` (más `voice.stream_jwt_secret` si se necesitara). Esto confirma que la información sensible ya vive en BD y que solo quedan pendientes los ajustes runtime que consumen estos valores.
- La nueva pestaña WhatsApp guarda `whatsapp.prompt_id`, `whatsapp.prompt_version`, `whatsapp.assistant_id`, `whatsapp.inactivity_minutes`, `whatsapp.reengage_*`, `whatsapp.escalate_minutes` y los template SIDs (`whatsapp.templates.*`) dentro de `organizaciones.config`, y el backend ahora los lee vía `tenant_runtime` para que cada tenant use su layout propio (mensajes de venta, reenganches, sesiones de OpenAI).

El siguiente hito es garantizar que el backend (en especial `tenant_runtime` y los servicios de WhatsApp/agenda/correo) lea estos bloques por tenant y utilice el fallback a `.env` únicamente para valores globales que no se migraron.

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

Flags de módulo:
- `features.webchat.enabled`
- `features.whatsapp.enabled`
- `features.messenger.enabled`
- `features.voice.enabled`
- `features.productos.enabled`
- `features.propiedades.enabled`

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

Correo (ejemplos):
- `TALIA_MAIL_INCOMING_SERVER` → `mail.incoming_server`
- `TALIA_MAIL_INCOMING_PORT_IMAP` → `mail.incoming_port_imap`
- `TALIA_MAIL_OUTGOING_SERVER` → `mail.outgoing_server`
- `TALIA_MAIL_OUTGOING_PORT_SMTP` → `mail.outgoing_port_smtp`
- `TALIA_MAIL_USE_SSL` → `mail.use_ssl`
- `TALIA_MAIL_USE_TLS` → `mail.use_tls`

> ✅ La pestaña “Correo” del panel ya expone estos campos y rota los secretos relacionados por tenant.

Twilio / Voz (ejemplos):
- `TWILIO_PHONE_NUMBER` → `twilio.phone_number`
- `TWILIO_PHONE_NUMBER_SID` → `twilio.phone_number_sid`
- `TWILIO_VALIDATE_SIGNATURES` → `twilio.validate_signatures`
- `WEBHOOK_PATH` → `voice.webhook_path`
- `VOICE_FULL_DUPLEX` → `voice.full_duplex`
- `VOICE_STREAM_JWT_SECRET` → `voice.stream_jwt_secret`
- `DEBUG_VOICE_VERBOSE` → `voice.debug_verbose`
- `DEBUG_ENERGY_EVERY_N` → `voice.energy_every_n`

> ✅ La pestaña “Twilio” del panel ya configura estos bloques (config + secretos) y ofrece validación por canal.

OpenAI (General + Voz):
- `TALIA_OPENAI_API_KEY`, `TALIA_OPENAI_PROJECT_ID` → pestaña “Openai General / General”: credenciales del proyecto que guardan las referencias a los prompts/assistant_id (config + secretos; sólo platform admin puede editarlas por tenant).
- `OPENAI_API_KEY`, `OPENAI_PROMPT_ID` (más metadata: `OPENAI_MODEL`, `OPENAI_MAX_TOKENS`, `OPENAI_STT_MODEL`) → subsección “Voz Openai”: controla el comportamiento del canal de voz (Twilio + Realtime); estos valores también se deben rotar por tenant y leer desde `tenant_runtime` antes de caer al fallback global.

## 4) Secretos por tenant (BD: `public.secretos`)

Valores sensibles que NO deben vivir en `.env` por tenant y que la UI debe manejar sin mostrar el valor una vez guardado (solo “actualizar/rotar”).

OpenAI (si quieres llave por tenant):
- `TALIA_OPENAI_API_KEY` / `OPENAI_API_KEY`

Twilio:
- `twilio.account_sid` (nivel A)
- `twilio.auth_token` (nivel B)
- `voice.stream_jwt_secret` (nivel B)

Messenger:
- `MESSENGER_PAGE_ACCESS_TOKEN`
- `MESSENGER_VERIFY_TOKEN`
- `MESSENGER_APP_SECRET`

Correo/Calendario:
- `TALIA_MAIL_USERNAME`, `TALIA_MAIL_CONTRASENA`
- `TALIA_CALENDARIO_USERNAME`, `TALIA_CALENDARIO_PASSWORD`
- `TALIA_CALENDARIO_SERVER_URL` (puede ser config), etc.
- `brevo.api_key`

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
- Tab **Config**: agrupa flags/features y campos generales (`webchat.*`, `whatsapp.*`, `messenger.*`, `branding.*`).
- Tab **Secretos**: CRUD/rotación de `secretos` (nunca leer el valor).
- Tab **Openai General**: primera sección “General” para `TALIA_OPENAI_API_KEY`/`TALIA_OPENAI_PROJECT_ID` y segunda sección “Voz Openai” para `OPENAI_API_KEY`/`OPENAI_PROMPT_ID` (y model metadata) con su validación respectiva.
- Tab **Validación**: botones de “probar” por canal (webchat/whatsapp/messenger).

## Estado actual (enero 2026)

- El panel `/settings/tenants` ya tiene pestañas para Webchat, Calendario y Correo, cada una guardando los campos de `organizaciones.config`, rotando los secretos (`openai.api_key`, `calendar.username`/`password`, `mail.username`/`password`) y mostrando un botón “Validar” centrado en el scope correspondiente.
- El backend todavía lee valores heredados de `backend/.env` (`TALIA_MAIL_*`, `TALIA_CALENDARIO_*`, `WEBCHAT_*`), pero el objetivo es migrar esos valores al tenant legacy y dejar en `.env` solo variables globales (infraestructura, URLs, master keys de cifrado).
- Falta ejecutar el plan de migración completo (leer del `.env` actual → poblar BD → eliminar de `.env`) para que solo queden las variables que no cambian por tenant.
- El backend ya usa `app.services.tenant_runtime` para cargar `twilio.*`/`voice.*` por `organizacion_id` cuando responde en WhatsApp, así que esas credenciales se pueden rotar desde el panel y el runtime encuentra el token adecuado para cada tenant.
- La pestaña “Twilio” ya guarda `twilio.*` / `voice.*` y los secretos `twilio.account_sid` / `twilio.auth_token` / `voice.stream_jwt_secret`, así que ese bloque puede migrar a BD también.

## Nota de seguridad (para decisión de producto)

Guardar secretos en BD **sí puede ser seguro** si se cumplen estas condiciones:
- Cifrado fuerte a nivel de aplicación (antes de persistir), con master key(s) fuera de la BD (en `.env` del backend).
- RLS/políticas y endpoints: solo el backend (service role) y usuarios platform-admin pueden escribir/rotar.
- La UI nunca “lee” el valor del secreto una vez guardado (solo permite rotar/actualizar).
- Auditoría y masking en logs (no registrar tokens).
