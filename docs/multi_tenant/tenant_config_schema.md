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
- Acceso: solo platform admin.
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
- `openai.api_key` (nivel B)

### Twilio
- `twilio.account_sid` (nivel A)
- `twilio.auth_token` (nivel B)

### Messenger / Meta
- `meta.messenger.page_access_token` (nivel B)
- `meta.messenger.verify_token` (nivel A/B)
- `meta.messenger.app_secret` (nivel B)

### Correo/Calendario
- `mail.username` (nivel A)
- `mail.password` (nivel B)
- `calendar.username` (nivel A)
- `calendar.password` (nivel B)

### Google / Places / OAuth
- `google.places_api_key` (nivel B)
- `google.oauth.client_secret` (nivel B)

### DENUE
- `denue.token` (nivel A)

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
