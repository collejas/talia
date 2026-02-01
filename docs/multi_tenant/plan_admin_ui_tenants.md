# Plan: vista admin `/settings/tenants` (alta/edición de tenants + variables)

Objetivo: que un **platform admin** pueda crear/editar/eliminar tenants y configurar routing, config y secretos desde UI, sin tocar `.env` por cliente.

## Checklist

- [ ] Confirmar roles: `platform_admin` vs `tenant_admin` (por ahora solo platform admin)
- [ ] Definir tabs y campos de la UI (General/Routing/Config/Secretos/Validación)
- [ ] Conectar UI → endpoints `/api/admin/*`
- [ ] Implementar “no mostrar secretos” (solo set/rotate)
- [ ] Agregar validaciones por campo (regex + required)
- [ ] Agregar botón “Probar configuración” por canal
- [ ] Registrar auditoría (quién cambió qué)

## Observaciones

- [ ] (pendiente) Notas de implementación/decisiones de UI.

## Avances recientes

- [x] La pestaña Webchat ahora persiste `webchat.*` (assistant_id, prompt_version, timers/alias) y rota `openai.api_key` vía `secrets`.
- [x] La nueva pestaña Calendario grava `webchat.calendar.*` + `calendar.*` en `organizaciones.config`, rota las credenciales y ofrece un botón “Validar”.
- [x] La pestaña Correo ahora persiste `mail.*` en `organizaciones.config`, rota `mail.username`/`mail.password` y tiene un botón “Validar” específico.
- [x] La pestaña Twilio guarda `twilio.*` + `voice.*` en `organizaciones.config`, rota `twilio.account_sid`/`twilio.auth_token`/`voice.stream_jwt_secret` y tiene validación por canal.
- [x] La pestaña WhatsApp persiste `whatsapp.*` (prompt, tiempos de inactividad/reengage/escalate) y `whatsapp.templates.*` y el backend los consume vía `tenant_runtime` para enviar notificaciones y mensajes.
- [x] `app.services.tenant_runtime` ya se consume desde WhatsApp para resolver Twilio/Voz por tenant, así que la aplicación usa las credenciales que configuras en la UI.

## 1) Pantallas / tabs

### A) Lista de tenants
- [ ] Listar `organizaciones` (nombre, id, estado_onboarding, creado_en)
- [ ] Botón “Crear tenant”
- [ ] Acciones: Editar / Desactivar / Eliminar (si se permite)
- [ ] Link a detalle: `/settings/tenants/{tenantId}`

### B) Detalle de tenant

Tab **General** (`organizaciones`)
- [ ] `nombre`
- [ ] `dominio` (si aplica)
- [ ] `estado_onboarding` (enum/flag)
- [ ] Notas internas (opcional)

Tab **Routing** (`organizacion_rutas_canal`)
- [ ] Webchat alias (`canal=webchat`)
- [ ] WhatsApp E.164 (`canal=whatsapp`) (permitir múltiples)
- [ ] Messenger page_id (`canal=messenger`) (permitir múltiples)

Tab **Config** (`organizaciones.config` JSONB)
- [ ] Features flags: `features.*`
- [ ] `webchat.*` (assistant_id, prompt_version, reengage, calendar, timezone)
- [ ] `whatsapp.*` (prompt_id/version, templates, tiempos)
- [ ] `messenger.*` (prompt_id/version)
- [ ] `branding.*` (public_name, logo_url, theme)
- [ ] `openai.general` (TALIA_OPENAI_API_KEY, TALIA_OPENAI_PROJECT_ID) y validación de asistente

Tab **Openai General** (organizaciones.config + secretos)
- [ ] **General:** guarda `TALIA_OPENAI_API_KEY` y `TALIA_OPENAI_PROJECT_ID` como secretos/config dentro del tenant, siempre por nivel admin y con rotación controlada desde la UI.
- [ ] **Voz Openai:** agrupa los valores que controlan el canal de voz (`OPENAI_API_KEY`, `OPENAI_PROMPT_ID`, `OPENAI_MODEL`, `OPENAI_MAX_TOKENS`, `OPENAI_STT_MODEL`, etc.) para que cada tenant pueda rotarlos/editar el prompt, y el runtime los lea desde la base antes de caer al fallback global.

Tab **Secretos** (`secretos`)
- [ ] OpenAI `openai.api_key` (si aplica por tenant)
- [ ] Twilio `twilio.account_sid` / `twilio.auth_token`
- [ ] Meta `meta.messenger.page_access_token` / `meta.messenger.app_secret` / `meta.messenger.verify_token`
- [ ] Mail `mail.username` / `mail.password`
- [ ] Calendar `calendar.username` / `calendar.password`
- [ ] Google `google.places_api_key` / `google.oauth.client_secret`
- [ ] DENUE `denue.token`

Tab **Validación**
- [ ] Probar webchat: resolver alias → org + endpoint de conversación
- [ ] Probar WhatsApp: validar firma Twilio + webhook path (sin enviar mensaje real por defecto)
- [ ] Probar Messenger: validar verify token + webhook
- [ ] Probar SMTP/IMAP: conexión y auth (sin enviar email por defecto)
- [ ] Reporte de “faltantes” (campos requeridos no configurados)

## 2) Contratos API (backend)

Base: `/api/admin` (platform-admin-only)

- [ ] `GET /tenants` (lista)
- [ ] `POST /tenants` (crear)
- [ ] `GET /tenants/{org_id}` (detalle)
- [ ] `PATCH /tenants/{org_id}` (editar)
- [ ] `DELETE /tenants/{org_id}` (opcional)

- [ ] `GET /tenants/{org_id}/routes`
- [ ] `POST /tenants/{org_id}/routes`
- [ ] `DELETE /tenants/{org_id}/routes/{route_id}` (o por `canal+clave`)

- [ ] `GET /tenants/{org_id}/config`
- [ ] `PUT /tenants/{org_id}/config`

- [ ] `GET /tenants/{org_id}/secrets` (solo lista de claves + metadata, nunca valores)
- [ ] `PUT /tenants/{org_id}/secrets/{key}` (set/rotate)
- [ ] `DELETE /tenants/{org_id}/secrets/{key}`

- [ ] `POST /tenants/{org_id}/validate` (ejecuta checks y regresa reporte)

## 3) Reglas de seguridad (UI + backend)

- [ ] UI oculta el menú “Tenants” si no eres platform admin (opcional, backend ya bloquea)
- [ ] Backend valida platform admin en cada endpoint `/api/admin/*`
- [ ] Nunca devolver secretos (ni en logs)
- [ ] Rate limit de endpoints sensibles (especialmente validate + rotate)
