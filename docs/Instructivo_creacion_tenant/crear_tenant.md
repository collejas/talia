# Instructivo de creación y configuración de un tenant

Este instructivo recoge el flujo completo para registrar un nuevo tenant (el cliente que renta tu plataforma), crear su admin y pulir todas las variables que necesita para operar (config, rutas y secretos). Toda la lógica ya existe en el backend (`backend/app/api/routes/admin.py` + `backend/app/api/routes/tenant.py`), en los helpers que hablan con Supabase (`backend/app/repositories/platform_admin.py`, `backend/app/services/supabase_admin.py`, `backend/app/core/secrets_crypto.py`) y en el frontend (`frontend/panel/src/app/settings/tenants` y `frontend/panel/src/app/settings/variables`). La estructura física de las tablas está disponible en `/var/www/talia/backups/postgres_20260204_142816/postgres_20260204_142816_schema.sql` (organizaciones, permisos, rutas, secretos, departamentos, puestos, usuarios, empleados, roles, roles_permisos, etc.).

## 1. Pre-requisitos

1. **Cuenta platform admin** (solo esos usuarios aparecen en `public.platform_admins`). Si tu `auth.uid` no figura allí, `POST /admin/tenants*` devolverá `403 platform_admin_required`.
2. Variables de entorno necesarias (ver `backend/app/core/config.py`):
   - `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE` para usar los endpoints de Supabase.
   - `SUPABASE_RESET_REDIRECT_URL` (opcional) para el correo de recuperación del admin.
   - `TALIA_SECRETS_MASTER_KEY` (tier A) y `TALIA_SECRETS_MASTER_KEY_HIGH` (tier B) antes de escribir secretos.
3. Diagnóstico de la base: la copia `backups/postgres_20260204_142816/postgres_20260204_142816_schema.sql` muestra que `public.organizaciones` ya tiene columnas como `config` (`jsonb`), `estado_onboarding`, `activo`, `fecha_alta`, que se usan en el flujo, y que `organizacion_rutas_canal`, `secretos`, `permisos`, `roles`, `roles_permisos`, `departamentos`, `puestos`, `usuarios`, `usuarios_roles`, `empleados` son las tablas que recibirán los datos del seed.
4. `frontend/panel/src/lib/api/crm.ts` añade automáticamente `X-User-Token`, `X-Organizacion-Id` y `X-Usuario-Id` a cada llamada. Por eso el panel siempre manda tu JWT y los headers necesarios.

## 2. Paso 1: crear el tenant con su admin desde `/settings/tenants`

| Pantalla | Ruta | Backend involucrado |
| --- | --- | --- |
| `/settings/tenants` | `GET /admin/tenants` (listado) | `PlatformRepository.list_organizaciones` |
| Panel “Crear tenant + admin” (`TenantCreationPanel`) | `POST /admin/tenants/con_usuario` | `admin.create_tenant_with_admin` |

### 2.1. Campos que recoge la vista

`TenantCreationPanel` (archivo `frontend/panel/src/app/settings/tenants/components/tenant-creation-panel.tsx`) agrupa dos bloques:

- **Tenant**: `nombre` (obligatorio, mínimo 2 caracteres), `webchat_alias` (alias lowercase para `organizacion_rutas_canal`), `pais`, `estado`, `ciudad`, `dominio_principal`, `razon_social`, `rfc`, `telefono`, `sitio_web`, `activo` (checkbox), `estado_onboarding` (`pendiente|en_progreso|completado|pausado|cancelado`). Todos se envían como parte de `CreateTenantRequest`.
- **Admin**: `correo` (email validado), `nombre_completo`, `telefono` (E.164), `estado` (`activo`/`bloqueado`).

La acción `createTenantWithAdmin` en `frontend/panel/src/app/settings/tenants/actions.ts` arma el payload y añade un `seed` por defecto para compatibilidad operacional:

```ts
DEFAULT_SEED = {
  departamento: "Administración",
  puesto: "Admin CRM",
  rol_nombre: "Admin",
  rol_descripcion: "Administrador principal",
  permisos: [{ codigo: "usuarios.write" }, { codigo: "roles.write" }],
}
```
Este `seed` ya no define el alcance final del usuario maestro: el backend eleva al usuario al rol `owner` del tenant (si existe) y garantiza permisos críticos de configuración.

### 2.2. Qué hace el backend al recibir el payload (`create_tenant_with_admin`)

El método `create_tenant_with_admin` en `backend/app/api/routes/admin.py` sigue estos pasos (todas las llamadas se canalizan por `PlatformRepository`):

1. **Crear organización** (`PlatformRepository.create_organizacion`) con los campos enviados. `config` se deja como se recibe (JSON) y `estado_onboarding` / `activo` se pueden escribir desde el formulario.
2. **Bootstrap técnico del tenant (automático)**:
   - Crea un recurso en `public.calendar_resources` (agenda principal) si no existe `webchat.calendar.resource_id`.
   - Completa `organizaciones.config` con defaults faltantes de configuración base:
     - `features.webchat.enabled=true`
     - `webchat.persist_session`, `webchat.reengage_*`, `webchat.escalate_minutes`, `webchat.inactivity_hours` (si existe en settings), `webchat.assistant_id` y `webchat.prompt_version` (si existen en settings)
     - `webchat.calendar.resource_id`
     - `webchat.calendar.timezone`
     - `webchat.calendar.default_days`
     - `webchat.calendar.hold_minutes`
     - `calendar.provider/server_url/server_port/...` cuando existen defaults globales en `settings`.
     - `mail.use_ssl/use_tls` y servidores/puertos de mail cuando existan en settings.
     - `denue.base_url` y `brevo.base_url` desde defaults globales.
   - Este paso evita que el owner tenga que capturar manualmente IDs internos de BD.
2. **Alias webchat**: si se envía `webchat_alias`, el backend crea una fila en `organizacion_rutas_canal` con `canal="webchat"` y `clave=alias.lower()` y llama a `channel_routing.invalidate_cache` para que el router detecte el alias nuevo.
3. **Semillas**:
   - Sembrar catálogo base de permisos tenant (incluye permisos de navegación del panel, settings, CRM, prospección y compatibilidad legacy de middleware).
   - Crear/asegurar catálogo de roles base del tenant (`owner`, `admin_operativo`, `supervisor`, `agente`, `capturista`, `marketing`, `soporte`, `auditor`, `invitado`).
   - Asociar permisos base a roles semilla. `owner` y roles administrativos quedan con cobertura alta para operar la app desde el día 1.
   - Crear/asegurar rol de seed (`payload.seed.rol_nombre`) y asociar sus permisos explícitos.
   - Crear departamento y puesto (`departamentos`, `puestos`).
4. **Usuario Supabase**: `create_supabase_user` (en `backend/app/services/supabase_admin.py`) lanza:
   - `POST /auth/v1/admin/users` + `PUT /auth/v1/admin/users/{id}` para fijar metadata/app_metadata con `organizacion_id`. Se genera una contraseña temporal, se marca `email_confirm`, y se formatea el teléfono a E.164 (fallback `+000...` si no es válido).
   - Envía `POST /auth/v1/recover` con `supabase_reset_redirect_url` para que el admin reciba un correo de recuperación.
5. **Persistir en el CRM**:
   - `upsert_usuario` crea/actualiza la fila en `public.usuarios` (nota: la tabla sólo admite `estado`=`activo`/`inactivo` y `telefono_e164` validado).
   - El backend resuelve el rol administrativo del tenant:
     - Usa `owner` (por nombre) si existe en el catálogo del tenant.
     - Si no existe, usa el rol creado por `seed`.
   - Antes de asignar el rol, garantiza permisos críticos mínimos:
     - `ver_panel`
     - `settings.view`
     - `settings.manage`
     - `user.manage`
     - `role.manage`
   - Luego otorga al rol administrativo todos los permisos existentes del tenant y ejecuta `assign_user_role`.
   - `create_employee` deja un `empleado` con departamento/puesto y el mismo `usuario_id`.

### 2.3. Validaciones y errores

- `webchat_alias` usa `create_channel_route`, que lanza `409` si existe otra ruta igual (el alias se normaliza con `lower()`).
- El correo pasa por `email_validator`; el teléfono se normaliza.
- Si cualquier llamada a PlatformRepository falla el endpoint devuelve `502 repo_error`.
- Si hay conflicto de alias webchat, se devuelve `409`.
- Si falla bootstrap técnico (calendar resource/config), se devuelve `502`.

### 2.4. ¿Qué se devuelve?

El backend responde con `CreateTenantWithAdminResponse` que incluye:

- `tenant_id`, `usuario_id`.
- `seed`: `rol_id`, lista de `permisos_ids`, `departamento_id`, `puesto_id`, `empleado_id`.
- `recovery_email_sent: true`.
- `activo`: el valor guardado en `organizaciones.activo`.

Este bloque aparece en la UI (`TenantCreationPanel`) para que el platform admin pueda copiar los UUIDs y confirmar que el correo de recuperación se disparó.

## 3. Paso 2: alimentar variables, rutas y secretos del tenant

Una vez creado el tenant, el admin global debe ingresar las variables (config + secretos + rutas). El panel usa `settings/variables` (`frontend/panel/src/app/settings/variables/page.tsx`) que replica las mismas pestañas que los tenants ven en `/settings/account`.

### 3.1. Configuraciones gestionadas por `TenantSectionForm`

`TenantVariablesSectionsPanel` (`frontend/panel/src/app/settings/variables/components/tenant-variables-sections-panel.tsx`) define las secciones siguientes. Cada `field.path` se graba en `organizaciones.config` usando el endpoint `/admin/tenants/{organizacion_id}/config` (el API de la vista hace un `mergeDeep` que conserva las claves previas):

| Sección | Campos clave en `organizaciones.config` | Secretos administrados | Rutas necesarias | Validación |
| --- | --- | --- | --- | --- |
| **Webchat** | `features.webchat.enabled`, `webchat.assistant_id`, `webchat.prompt_version`, `webchat.inactivity_hours`, `webchat.persist_session`, `webchat.reengage_*`, `webchat.escalate_minutes` | `openai.api_key` (tier B) | `webchat` (alias) | scope `webchat` |
| **Calendario** | `webchat.calendar.*`, `calendar.provider`, `calendar.server_url`, `calendar.server_port`, `calendar.full_calendar_url`, `calendar.full_contact_list_url` | `calendar.username` (tier A), `calendar.password` (tier B) | — | scope `calendar` |
| **Mail y Brevo** | `mail.incoming_server`, `mail.incoming_port_imap`, `mail.outgoing_server`, `mail.outgoing_port_smtp`, `mail.use_ssl`, `mail.use_tls`, `brevo.base_url` | `mail.username` (A), `mail.password` (B), `brevo.api_key` (B) | — | scope `mail` |
| **Twilio & Voice** | `twilio.phone_number`, `twilio.phone_number_sid`, `twilio.validate_signatures`, `voice.webhook_path`, `voice.full_duplex`, `voice.debug_verbose`, `voice.energy_every_n` | `twilio.account_sid` (A), `twilio.auth_token` (B), `voice.stream_jwt_secret` (B) | — | scope `twilio` |
| **WhatsApp** | `whatsapp.prompt_*`, `whatsapp.assistant_id`, `whatsapp.reengage_*`, `whatsapp.templates.*` | — | `whatsapp` (número) | scope `whatsapp` |
| **Messenger** | `messenger.prompt_*`, `messenger.assistant_id`, `messenger.inactivity_hours` | `meta.messenger.page_access_token` (B), `meta.messenger.verify_token` (A), `meta.messenger.app_secret` (B) | `messenger` (page_id) | scope `messenger` |
| **Búsqueda** | `denue.base_url`, `google_places.*` (`nearby_url`, `text_url`, `details_url`, `field_mask`, `language_code`, etc.) | `denue.token` (A), `google.places_api_key` (B) | — | — |
| **OpenAI** | `openai.general.project_id`, `openai.voice.*` | `openai.general.api_key` (B), `openai.voice.api_key` (B) | — | — |

Los formularios usan `TenantSectionForm` para:

1. Recolectar valores de los campos (`fields` en `SECTIONS`) y crear un JSON patch.
2. Llamar a `/api/settings/variables/config` (a su vez `PUT /admin/tenants/{id}/config`) enviando la parte modificada.
3. Enviar los secretos escritos en el formulario a `/api/settings/variables/secrets` (que usa `/tenant/me/secrets` o `/admin/tenants/{id}/secrets/{clave}` con cifrado AES-GCM via `encrypt_secret` en `backend/app/core/secrets_crypto.py`).
4. Mostrar mensajes de resultado sin que el valor guardado vuelva a la UI (se mantiene en blanco).

### 3.2. Rutas de canal

`TenantRoutesManager` permite crear/ eliminar rutas por canal. Para cada canal (webchat, whatsapp, messenger) se invoca:

- `POST /tenant/me/routes` / `POST /admin/tenants/{id}/routes` con `canal` + `clave` (minúsculas). El repo graba `organizacion_rutas_canal` y `canal_routing.invalidate_cache`.
- `DELETE /tenant/me/routes/{route_id}` para limpiar alias obsoletos.

Ejemplos habituales de `clave`: alias textuales para webchat (`cliente-x`), un número E.164 para WhatsApp, un `page_id` para Messenger.

### 3.3. Secretos cifrados (tiers)


1. Si el secreto es tier **A**, el backend usa `TALIA_SECRETS_MASTER_KEY`; tier **B** usa `TALIA_SECRETS_MASTER_KEY_HIGH`.
2. Antes de guardar (`PlatformRepository.upsert_secret`) se llama a `encrypt_secret`, y la tabla `public.secretos` almacena `clave`, `valor_cifrado`, `nonce`, `etiqueta`, `version`, `organizacion_id` (sin devolver valor plano).
3. `tenant` admins usan `/tenant/me/secrets`; los global admins usan `/admin/tenants/{id}/secrets/{clave}`. Ambos endpoints respetan `_normalize_secret_key`.
4. Revisa `TenantSecretsResponse` y `SecretMetadata` para ver los metadatos que sí se devuelven.

### 3.4. Validaciones con `TenantValidationPanel`

- Cualquier sección con `validationScope` ejecuta `/api/settings/variables/validate` → `/tenant/me/validate` → `build_validation_report`.
- Este reporte regresa `missing_routes`, `missing_config`, `missing_secrets` y `notes`.
- `build_validation_report` exige:
  - **Routes**: `webchat`, `whatsapp`, `messenger` según el scope.
  - **Config (scope full)**: `webchat.*`, `calendar.*`, `mail.*`, `twilio.*`, `voice.*`, `messenger.*`.
  - **Secrets (scope full)**: `openai.api_key`, `twilio.account_sid`, `twilio.auth_token`, `meta.messenger.page_access_token`, `meta.messenger.app_secret`, `meta.messenger.verify_token`, `mail.username`, `mail.password`, `calendar.username`, `calendar.password`, `google.places_api_key`, `google.oauth.client_secret`, `voice.stream_jwt_secret`.
- Para scopes individuales reduce el conjunto (por ejemplo, scope `mail` sólo pide los `mail.*` y sus secretos).
- También agrega notas si falta alguna master key (`TALIA_SECRETS_MASTER_KEY`, `_HIGH`).

## 4. Checklist operacional posterior (ver `docs/creacion_tenants/plan_creacion_tenants.md`)

1. Confirmar rutas `webchat`, `whatsapp`, `messenger` y mostrar alias en `organizacion_rutas_canal`.
2. Revisar secrets y config con `POST /admin/tenants/{id}/validate?scope=...`.
3. Abrir `/settings/hr` del tenant para extender roles, empleados y departamentos si se necesitan más permisos.
4. Completar `organizaciones.config` con branding/flags/calendario/Twilio/WhatsApp/Messenger/OpenAI.
5. Notificar al nuevo admin que el correo de recuperación fue enviado (supabase envía link a `supabase_reset_redirect_url`).

## 5. Qué ve el admin del tenant

- `GET /tenant/me/settings` carga su `organizacion_id`, datos básicos y rutas (`PlatformRepository.get_organizacion_details`, `list_channel_routes`).
- La vista `/settings/variables` muestra las mismas secciones que la vista global (tabs en `TenantVariablesSectionsPanel`), pero el botón “Tenants” del sidebar sólo aparece si estás en `platform_admins`.
- En la pestaña Calendario de owner tenant, `calendar.resource_id` se muestra en solo lectura: lo provisiona la plataforma durante el alta.
- Los tenant admins usan `/tenant/me/routes`, `/tenant/me/secrets`, `/tenant/me/validate` para tocar sus propios datos, y nunca entran a `/admin/tenants/*`.

## 6. Referencias rápidas

- `backend/app/api/routes/admin.py` (`create_tenant_with_admin`, `set_tenant_config`, `set_tenant_secret`, `validate_tenant`).
- `backend/app/api/routes/tenant.py` (`get_tenant_settings`, `upsert_tenant_secrets`, `create_tenant_route`, `tenant_validate`).
- `backend/app/repositories/platform_admin.py` (todas las llamadas `create_*`, `assign_user_role`, `create_employee`, `list_organizaciones`, `upsert_secret`).
- `backend/app/services/supabase_admin.py` (creación de usuario Supabase + recovery email).
- `backend/app/core/secrets_crypto.py` (AES-GCM antes de persistir en `public.secretos`).
- `frontend/panel/src/app/settings/tenants/components/tenant-creation-panel.tsx` + `../actions.ts` (formulario y seed por defecto).
- `frontend/panel/src/app/settings/variables/components/tenant-variables-sections-panel.tsx` y los componentes `TenantSectionForm`, `TenantRoutesManager`, `TenantValidationPanel`.
- `frontend/panel/src/app/api/settings/variables/{config, routes, secrets, validate}` (las rutas del panel que llaman a `/tenant/me/*` o `/admin/tenants/*`).
- `frontend/panel/src/lib/api/crm.ts` (headers `X-User-Token`, `X-Organizacion-Id` y revalidaciones).
- `backups/postgres_20260204_142816/postgres_20260204_142816_schema.sql` (estructura de `organizaciones`, `organizacion_rutas_canal`, `secretos`, `permisos`, `roles`, `roles_permisos`, `departamentos`, `puestos`, `usuarios`, `usuarios_roles`, `empleados`, `platform_admins`).
- `docs/creacion_tenants/plan_creacion_tenants.md` (contexto general y checklist detallado).

## 7. Plan de implementación (automatización completa)

Objetivo del plan:
- Que al crear un tenant nuevo, el sistema deje lista su estructura mínima (recursos + seguridad + configuración base) sin pasos manuales.
- Que el usuario maestro del tenant tenga permisos altos dentro de su organización y cero acceso cross-tenant.

### Fase A: Bootstrap técnico automático (backend)

Estado esperado al finalizar:
- [x] `POST /admin/tenants` y `POST /admin/tenants/con_usuario` crean `calendar_resources` por tenant si falta.
- [x] `organizaciones.config.webchat.calendar.resource_id` queda asignado automáticamente.
- [x] Se escriben defaults faltantes de `webchat.calendar.*` y `calendar.*` sin pisar valores existentes.
- [x] Si falla bootstrap, la API responde error controlado (`502`) y no queda onboarding “a medias”.

Plan de ejecución (configuración):
1. [x] Extender `_build_default_tenant_config` para inyectar defaults base de `features.webchat`, `webchat.*` operativo y `webchat.calendar.*`.
2. [x] Mantener merge no destructivo (`_merge_missing_config`) para no sobrescribir configuración ya capturada en payload o UI.
3. [x] Incluir defaults técnicos reutilizables de `mail.*`, `denue.base_url` y `brevo.base_url`.
4. [ ] Agregar/ajustar tests automáticos de creación de tenant con validación de `config` bootstrap.
5. [x] Validar en entorno real que el owner de tenant nuevo puede entrar a `/settings/variables` sin datos manuales internos.

Validación:
- [x] Tenant nuevo aparece con `resource_id` válido en `organizaciones.config`.
- [x] Existe fila relacionada en `public.calendar_resources` con el mismo `organizacion_id`.
- [x] En `/settings/variables` (tenant), Calendario muestra `resource_id` en solo lectura.

### Fase B: Bootstrap de seguridad (roles/permisos/usuario maestro)

Estado esperado al finalizar:
- [x] Usuario maestro se asigna a `owner` (si existe), o al rol administrativo fallback.
- [x] Se garantizan permisos críticos: `ver_panel`, `settings.view`, `settings.manage`, `user.manage`, `role.manage`.
- [x] El rol administrativo queda con permisos altos del tenant para operar settings/usuarios/roles.
- [x] La asignación siempre se guarda en `usuarios_roles` con `organizacion_id` correcta.
- [x] Se siembra catálogo base de permisos tenant (incluye permisos de navegación y compatibilidad legacy).
- [x] Se siembra catálogo base de roles tenant (`owner`, `admin_operativo`, `supervisor`, `agente`, `capturista`, `marketing`, `soporte`, `auditor`, `invitado`).

Validación:
- [x] `mi_contexto_permisos` del usuario maestro refleja permisos de settings y panel.
- [x] `/settings/variables` carga sin errores de permisos.
- [x] El usuario puede gestionar configuración y secretos de su tenant.

### Fase C: Aislamiento estricto por tenant (scope)

Estado esperado al finalizar:
- [x] Los endpoints owner-enabled (`/admin/tenants/*`) validan `owner_scope_violation` fuera de su organización.
- [x] El owner no puede listar ni editar recursos de otro tenant.
- [x] El sidebar/UI no expone operaciones cross-tenant a usuarios no `platform_admin`.

Validación:
- [x] Prueba negativa: owner tenant A intentando `/admin/tenants/{tenantB}` devuelve `403`.
- [x] Prueba positiva: owner tenant A operando `/tenant/me/*` y `/admin/tenants/{tenantA}/*` funciona.

### Fase D: Backfill de tenants existentes

Estado esperado al finalizar:
- [x] Script SQL de backfill corrige tenants previos al cambio (ejecutado manualmente en tenant de prueba):
  - owner asignado al usuario maestro,
  - permisos altos de owner,
  - `calendar_resources` + `webchat.calendar.resource_id` cuando falten.
- [x] Resultado auditable por tenant (antes/después).
- [ ] Pendiente formalizar el backfill como migración SQL versionada en `supabase/migrations`.

Validación:
- [x] Para cada tenant existente en entorno de pruebas: owner + permisos críticos + resource_id enlazado.
- [x] Cero regresiones en tenant de pruebas.

### Fase E: Pruebas de aceptación (obligatorias)

Casos mínimos:
- [x] Crear tenant por UI (`/settings/tenants`) con usuario admin.
- [x] Iniciar sesión como owner del nuevo tenant.
- [x] Entrar a `/settings/variables` y guardar cambios en Webchat/Calendario/Mail.
- [x] Validar scope: owner no accede a otro tenant.
- [x] Validar que platform admin sí mantiene acceso cross-tenant.

### Entregables

- [x] Código backend de bootstrap y scope.
- [x] Ajustes frontend de UX para campos internos (`resource_id` readonly en tenant).
- [ ] SQL de backfill versionado y reusable.
- [x] Documentación actualizada (`crear_tenant.md`, `rbac_and_scope.md`, `Matriz-permisos-v2.md`).
