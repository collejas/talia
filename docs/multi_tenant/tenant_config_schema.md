# Esquema propuesto: configuración y secretos por tenant

Objetivo: definir un “contrato” estable para que el backend lea configuración por tenant desde BD y para que el panel `/settings/tenants` pueda crear/editar valores sin depender de `.env` por tenant.

## Checklist

- [ ] Definir llaves canónicas de `organizaciones.config`
- [ ] Definir llaves canónicas de `secretos.clave`
- [ ] Definir qué va en routing (`organizacion_rutas_canal`)
- [ ] Definir niveles de seguridad (normal vs extendida)
- [ ] Definir validaciones (formatos/regex) por campo
- [ ] Definir migración de `.env` actual → BD

## Observaciones

- [ ] (pendiente) Decisiones finales del esquema y compatibilidad con settings actuales.

---

## 1) Tres “lugares” por tenant

1) `public.organizaciones.config` (JSONB)
- No sensible.
- Editable desde UI.
- Se puede retornar al frontend cuando sea necesario (branding, flags).

2) `public.secretos`
- Sensible.
- Nunca mostrar el valor una vez guardado (solo “rotar/actualizar”).
- En BD se guarda cifrado en `valor_cifrado` + `nonce`.

3) `public.organizacion_rutas_canal`
- Routing por clave externa → `organizacion_id`.
- Ejemplos: alias webchat, número WhatsApp, page_id Messenger.

---

## 2) Niveles de seguridad

Definición práctica (para implementar ya):

### Nivel A (normal)
- Cifrado con `TALIA_SECRETS_MASTER_KEY` (global, en `.env` del backend).
- Acceso: platform admin (o admin del tenant si decides delegarlo).
- Uso típico: tokens de proveedores “reemplazables” o no críticos.

### Nivel B (seguridad extendida)
- Cifrado con `TALIA_SECRETS_MASTER_KEY_HIGH` (segundo master key global).
- Acceso recomendado: solo platform admin.
- Decisión actual (2026-02-15): el rol tenant `owner` puede rotar secretos de su propio tenant (incluyendo nivel B).
- Recomendado para: credenciales de correo, tokens con permisos amplios, llaves de OpenAI si las vas a separar por cliente, etc.

Nota: esto da separación criptográfica (si se filtra una master key, no se filtra todo).

Referencia: `docs/multi_tenant/secrets_security.md`.

---

## 3) Llaves canónicas de `organizaciones.config` (propuesto)

### `features.*`
- `features.webchat.enabled` (bool)
- `features.whatsapp.enabled` (bool)
- `features.messenger.enabled` (bool)
- `features.voice.enabled` (bool)
- `features.productos.enabled` (bool)
- `features.propiedades.enabled` (bool)

> Nota: `features.productos.enabled` controla la visibilidad del catálogo comercial general
> (`/settings/productos`) y `features.propiedades.enabled` controla la visibilidad del módulo
> inmobiliario (`/settings/propiedades`). Ambos módulos comparten taxonomía base
> (`lineas`, `familias`, `modelos`), pero no comparten inventario operativo ni permisos de
> exposición por defecto.

### `webchat.*`
- `webchat.assistant_id` (string)  ← de `TALIA_OPENAI_WEBCHAT_ASSISTANT_ID`
- `webchat.prompt_version` (string|number) ← de `TALIA_OPENAI_PROMPT_WEBCHAT_VERSION`
- `webchat.inactivity_hours` (number) ← `TALIA_WEBCHAT_INACTIVITY_HOURS`
- `webchat.persist_session` (bool) ← `TALIA_WEBCHAT_PERSIST_SESSION`
- `webchat.reengage_minutes` / `webchat.reengage_max_attempts` / `webchat.escalate_minutes`
- `webchat.calendar.resource_id` (uuid|string)
- `webchat.calendar.timezone` (string)
- `webchat.calendar.default_days` (number)
- `webchat.calendar.hold_minutes` (number)

### `calendar.*`
- `calendar.provider` (string) ← `TALIA_CALENDARIO_DEFAULT_PROVIDER`
- `calendar.server_url` (string) ← `TALIA_CALENDARIO_SERVER_URL`
- `calendar.server_url_alternate` (string) ← `TALIA_CALENDARIO_SERVER_URL_ALTERNATE`
- `calendar.server_port` (number) ← `TALIA_CALENDARIO_SERVER_PORT`
- `calendar.full_calendar_url` (string) ← `TALIA_CALENDARIO_FULL_CALENDAR_URL`
- `calendar.full_contact_list_url` (string) ← `TALIA_CALENDARIO_FULL_CONTACT_LIST_URL`

> ✅ Esta sección ya se puede editar en la pestaña “Calendario” del panel de tenants y registra los valores por tenant.

### `mail.*`
- `mail.incoming_server` (string) ← `TALIA_MAIL_INCOMING_SERVER`
- `mail.incoming_port_imap` (number) ← `TALIA_MAIL_INCOMING_PORT_IMAP`
- `mail.outgoing_server` (string) ← `TALIA_MAIL_OUTGOING_SERVER`
- `mail.outgoing_port_smtp` (number) ← `TALIA_MAIL_OUTGOING_PORT_SMTP`
- `mail.use_ssl` (bool) ← `TALIA_MAIL_USE_SSL`
- `mail.use_tls` (bool) ← `TALIA_MAIL_USE_TLS`

> ✅ La pestaña “Correo” del panel ya persiste estas claves y rota los secretos correspondientes por tenant.

### `twilio.*`
- `twilio.phone_number` (string) ← `TWILIO_PHONE_NUMBER`
- `twilio.phone_number_sid` (string) ← `TWILIO_PHONE_NUMBER_SID`
- `twilio.validate_signatures` (bool) ← `TWILIO_VALIDATE_SIGNATURES`

### `voice.*`
- `voice.webhook_path` (string) ← `WEBHOOK_PATH`
- `voice.full_duplex` (bool) ← `VOICE_FULL_DUPLEX`
- `voice.debug_verbose` (bool) ← `DEBUG_VOICE_VERBOSE`
- `voice.energy_every_n` (number) ← `DEBUG_ENERGY_EVERY_N`

> ✅ La pestaña “Twilio” del panel ahora persiste `twilio.*` y `voice.*` (incluidas las flags de streaming) y rota los secretos asociados.

### `denue.*`
- `denue.base_url` (string) ← `DENUE_BASE_URL` / `TALIA_DENUE_BASE_URL`

> ✅ La pestaña “Búsqueda” guarda el endpoint (config) y activa la rotación de `denue.token` como secreto por tenant.

### `google_places.*`
- `google_places_nearby_url` (string) ← `API_NEARBY_SEARCH` / `GOOGLE_PLACES_NEARBY_URL`
- `google_places_text_url` (string) ← `GOOGLE_PLACES_TEXT_URL`
- `google_places_details_url` (string) ← `GOOGLE_PLACES_DETAILS_URL`
- `google_places_field_mask` (string) ← `PLACES_FIELD_MASK`
- `google_places_details_field_mask` (string) ← `PLACES_DETAILS_FIELD_MASK`
- `google_places_language_code` (string) ← `PLACES_LANGUAGE_CODE`
- `google_places_region_code` (string) ← `PLACES_REGION_CODE`
- `google_places_grid_max_tile_radius_m` (number) ← `GOOGLE_PLACES_GRID_MAX_TILE_RADIUS_M`
- `google_places_pause_between_pages` (number) ← `GOOGLE_PLACES_PAUSE_BETWEEN_PAGES`
- `google_places_dense_grid_max_tile_radius_m` (number) ← `GOOGLE_PLACES_DENSE_GRID_MAX_TILE_RADIUS_M`
- `google_places_dense_pause_between_pages` (number) ← `GOOGLE_PLACES_DENSE_PAUSE_BETWEEN_PAGES`
- `google_places_dense_max_results` (number) ← `GOOGLE_PLACES_DENSE_MAX_RESULTS`

> ✅ La pestaña “Búsqueda” ahora permite editar los endpoints/límites de Google Places por tenant y rota `google.places_api_key`.
> ℹ️ `tenant_runtime.get_google_places_runtime_settings` combina `organizaciones.config.google_places` + `secretos.google.places_api_key` antes de caer al `.env`, así que lo que configuras desde la UI alimenta los jobs de `/api/prospeccion/google/*`.

### `whatsapp.*`
- `whatsapp.prompt_id` / `whatsapp.prompt_version`
- `whatsapp.inactivity_minutes` / `whatsapp.reengage_minutes` / `whatsapp.escalate_minutes`
- `whatsapp.templates.sales` / `whatsapp.templates.appointment` / `whatsapp.templates.cancel_appointment`

### `messenger.*`
- `messenger.prompt_id` / `messenger.prompt_version`

### `branding.*`
- `branding.public_name`
- `branding.logo_url` (si aplica)
- `branding.theme` (colores)

---

## 4) Llaves canónicas de `secretos.clave` (propuesto)

Convención: `canal/proveedor.nombre` o `proveedor.nombre`.

Ejemplos:

### OpenAI
- `openai.api_key` (nivel B, POR_TENANT)

### Twilio
- `twilio.account_sid` (nivel A, POR_TENANT)
- `twilio.auth_token` (nivel B, POR_TENANT)
- `voice.stream_jwt_secret` (nivel B, POR_TENANT)

### Messenger / Meta
- `meta.messenger.page_access_token` (nivel B, POR_TENANT)
- `meta.messenger.verify_token` (nivel A/B, POR_TENANT)
- `meta.messenger.app_secret` (nivel B, POR_TENANT)

### Correo/Calendario
- `mail.username` (nivel A, POR_TENANT)
- `mail.password` (nivel B, POR_TENANT)
- `calendar.username` (nivel A, POR_TENANT)
- `calendar.password` (nivel B, POR_TENANT)

### Google / Places / OAuth
- `google.places_api_key` (nivel B, POR_TENANT)
- `google.oauth.client_secret` (nivel B, POR_TENANT)

### DENUE
- `denue.token` (nivel A)

> ✅ El tab “Búsqueda” ahora orquesta la persistencia de `denue.base_url` y `denue.token` (el valor solo se rota desde la UI y nunca se expone).

---

## 5) Routing (`organizacion_rutas_canal`)

### Webchat
- `canal = "webchat"`, `clave = <alias>` (ej: `talia`, `cliente-x`)

### WhatsApp
- `canal = "whatsapp"`, `clave = <E.164>` (ej: `+5214443354450`)

### Messenger
- `canal = "messenger"`, `clave = <page_id>`

---

## 6) Migración desde `.env` (estrategia)

- Paso 1: leer variables actuales y poblar config/secretos/routing para el tenant legacy `000...001`.
- Paso 2: cambiar runtime para leer primero de BD y fallback a `.env` solo si falta algo.
- Paso 3: limpiar `.env` removiendo valores que ya estén en BD.
