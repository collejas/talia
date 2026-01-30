# Onboarding de Tenants (sin crecer `.env`)

## Objetivo
Registrar nuevos tenants (tabla `public.organizaciones`) y configurar el **routing** de canales (por ejemplo `tenant_alias` del widget webchat) desde una vista/admin interna, sin añadir un bloque nuevo de variables por cada cliente en `.env`.

## Esquema (Supabase)

- `public.organizaciones`: entidad principal del tenant (ya existe).
- `public.platform_admins`: lista de usuarios Supabase Auth con permisos globales (cross-tenant).
- `public.organizacion_rutas_canal`: mapea claves externas por canal hacia `organizacion_id`.
  - Ejemplos:
    - `canal=webchat`, `clave=<alias>` (alias público para widget)
    - `canal=whatsapp`, `clave=<numero_e164>` (número Twilio que recibe el webhook)
    - `canal=messenger`, `clave=<page_id>` (Page ID de Facebook)

## Backend

- Endpoint global: `GET/POST /api/admin/tenants` (requiere ser *platform admin*).
- Endpoint global: `GET/POST /api/admin/tenants/{organizacion_id}/routes`.
- Resolución webchat:
  - El widget envía `metadata.tenant_alias`.
  - El backend intenta resolver `organizacion_id` con `organizacion_rutas_canal` y cachea el resultado (TTL ~10 min).

## Panel

- Vista: `/settings/tenants`
  - Lista tenants.
  - Crea tenant y opcionalmente registra `webchat_alias` como ruta `canal=webchat`.

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

