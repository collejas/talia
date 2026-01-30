# Onboarding de Tenants (sin crecer `.env`)

## Checklist

- [ ] Definir alcance y roles (platform admin)
- [ ] Migraciones aplicadas (tablas routing/admin)
- [ ] Vista `/settings/tenants` operativa
- [ ] CRUD de rutas por canal (routing)
- [ ] CRUD de config por tenant (`organizaciones.config`)
- [ ] CRUD/rotación de secretos por tenant (`secretos`)
- [ ] Migrar runtime para leer de BD (no `.env` por tenant)
- [ ] Validaciones automáticas por canal (botón Probar)
- [ ] Hardening (auditoría, logs, masking, mínimos permisos)

## Observaciones

- [ ] (pendiente) Primer arranque / notas de implementación.

## Objetivo
Registrar nuevos tenants (tabla `public.organizaciones`) y configurar el **routing** de canales (por ejemplo `tenant_alias` del widget webchat) desde una vista/admin interna, sin añadir un bloque nuevo de variables por cada cliente en `.env`.

## Alcance (qué cubre y qué no)

Este documento cubre:
- Crear tenants.
- Enrutar canales hacia tenants (webchat/whatsapp/messenger).
- Guardar configuración por tenant y secretos por tenant en la BD.

Este documento **no** cubre todavía:
- Provisioning automático de recursos externos (Twilio subaccounts, Meta apps, dominios, DNS, etc.).
- Rotación de secretos / KMS (se puede añadir después).

## Esquema (Supabase)

- `public.organizaciones`: entidad principal del tenant (ya existe).
- `public.platform_admins`: lista de usuarios Supabase Auth con permisos globales (cross-tenant).
- `public.organizacion_rutas_canal`: mapea claves externas por canal hacia `organizacion_id`.
  - Ejemplos:
    - `canal=webchat`, `clave=<alias>` (alias público para widget)
    - `canal=whatsapp`, `clave=<numero_e164>` (número Twilio que recibe el webhook)
    - `canal=messenger`, `clave=<page_id>` (Page ID de Facebook)

### Dónde guardar “variables” y secretos por tenant

Recomendación práctica (y simple):
- **Config no-secreta** (URLs, flags, nombres, IDs no sensibles): en `public.organizaciones.config` (JSONB).
- **Secretos** (tokens, API keys, app secrets, contraseñas): en `public.secretos` (tenant-scoped, admin-only).
- **Routing** (alias, phone/page_id): en `public.organizacion_rutas_canal`.

Con esto evitas `.env` gigantes y puedes agregar tenants desde UI.

## Backend

- Endpoint global: `GET/POST /api/admin/tenants` (requiere ser *platform admin*).
- Endpoint global: `GET/POST /api/admin/tenants/{organizacion_id}/routes`.
- Resolución webchat:
  - El widget envía `metadata.tenant_alias`.
  - El backend intenta resolver `organizacion_id` con `organizacion_rutas_canal` y cachea el resultado (TTL ~10 min).

### Próximo paso: endpoints de configuración por tenant

Para poder reemplazar `.env` por BD, se agregan endpoints *platform-admin-only*:
- `GET/PUT /api/admin/tenants/{org}/config` (lee/escribe `organizaciones.config`)
- `GET/POST/DELETE /api/admin/tenants/{org}/secrets` (lee lista de claves / crea o rota secretos)

Luego el runtime migra a leer “settings por org” desde BD.

## Panel

- Vista: `/settings/tenants`
  - Lista tenants.
  - Crea tenant y opcionalmente registra `webchat_alias` como ruta `canal=webchat`.

### UI propuesta (iteración siguiente)

En la vista de Tenants, por tenant:
- **General**: nombre, dominio, estado_onboarding, flags.
- **Routing**: webchat alias, WhatsApp número, Messenger page_id.
- **Canales / secretos**: tokens (Twilio, Meta, etc.) vía `secretos`.
- **IA**: assistant_id/prompt_id por canal (IDs no secretos) en `organizaciones.config`.
- **Correo**: remitentes/plantillas por org.
- **Calendario**: resource_id/timezone/defaults por org.

## Bootstrap (primer uso)

1. Ejecuta la migración `supabase/migrations/20280330_090000_platform_admins_and_channel_routes.sql`.
2. Inserta tu usuario (Auth) como platform admin:

```sql
insert into public.platform_admins (user_id)
values ('<TU_AUTH_USER_ID_UUID>')
on conflict (user_id) do nothing;
```

3. Entra al panel y abre `/settings/tenants`.

## Nota sobre variables `.env`

Con este enfoque, ya no necesitas mantener mapas grandes en variables tipo:
- `WEBCHAT_TENANT_ALIAS_MAP`
- `WHATSAPP_TENANT_PHONE_MAP`
- `MESSENGER_PAGE_ORGANIZACION_MAP`

Se reservan para defaults globales o fallback, no para onboarding por cliente.

## Checklist: alta de un tenant “completo” (objetivo final)

1) Crear `organizaciones` (nombre/dominio).
2) Crear rutas por canal:
   - webchat alias
   - whatsapp número(s)
   - messenger page_id(s)
3) Guardar config por tenant (JSONB):
   - features flags
   - assistant_id/prompt_id por canal
   - timezone/calendario
   - branding (logo, colores, nombre público)
4) Guardar secretos por tenant (`secretos`):
   - Twilio auth token / API key
   - Meta verify token / app secret / page token
   - Proveedores externos (geolocalización, email provider, etc.)
5) Validación automática (botón “Probar”):
   - ping webhook endpoints
   - prueba de envío (WhatsApp/Messenger) si aplica
   - prueba widget (webchat)
