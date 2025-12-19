# Auditoría rápida de multitenancy (organizacion_id)

Esta app ya usa `public.organizacion_id` como “tenant key” en varias tablas, con helpers como:

- `public.usuario_organizacion_id(auth.uid())`: devuelve la organización del usuario autenticado.
- `public.tg_set_organizacion_id()`: trigger helper para poblar `organizacion_id` en `INSERT` (en algunas tablas).
- RLS: muchas políticas filtran por `organizacion_id = usuario_organizacion_id(auth.uid())` o por funciones `puede_ver_*`.

## Hallazgos críticos (mezcla de tenants / fuga de datos)

1) **`public.es_admin(uid)` es “admin global” (no tenant-aware)**  
Hoy `es_admin()` solo verifica si el usuario tiene un rol con `codigo = 'admin'`, pero **no valida que ese rol pertenezca a la misma `organizacion_id` del usuario**.  
Impacto: un usuario “admin” en un tenant podría pasar como admin en todos, porque muchas RLS usan `es_admin(auth.uid())`.

2) **`public.roles` tiene `UNIQUE (codigo)` (impide roles por organización)**  
Con esa restricción, no puedes tener un rol `admin` por cada organización. En la práctica empuja el modelo hacia “roles globales”, lo cual rompe aislamiento si `es_admin()` se usa como override.

3) **`public.conversation_summaries` no tiene RLS habilitado**  
La tabla tiene `organizacion_id`, pero en la DB actual `rls_enabled = false` y además tiene GRANTs amplios.  
Impacto: riesgo alto de lectura/escritura cruzada entre tenants.

4) **Tablas de calendario (`calendar_*`) sin `organizacion_id` y con `SELECT USING (true)`**  
Además tienen GRANTs amplios y contienen referencias/IDs de entidades de negocio (por ejemplo `contact_id`, `conversacion_id`).  
Impacto: cualquier usuario autenticado podría leer datos de otros tenants si se usan en producción.

## Tablas sin `organizacion_id` (requieren decisión)

Estas tablas no traen `organizacion_id` hoy (parcial):  
`adjuntos`, `conversaciones`, `mensajes`, `calendar_*`, `catalog_*`, `agentes`, `prompts`, `prompt_versions`, `prompt_bindings`, `custom_fields`, `departamentos`, `puestos`, `empleados`, `secretos`, `roles_permisos`, `permisos`, `quote_templates`, `webhooks_entrantes`, `webchat_*`, etc.

Recomendación: clasificarlas en 2 grupos:

- **Global/shared** (mismo contenido para todos): catálogos, plantillas, permisos, etc.  
  Aun así: restringir GRANTs y/o RLS para evitar escrituras indebidas.
- **Tenant-scoped** (varía por cliente): calendario, agentes/prompts/custom_fields si cada cliente configura su IA, departamentos/puestos/empleados, etc.  
  En este grupo conviene **agregar `organizacion_id NOT NULL` + FK a `organizaciones` + RLS por org**.

## Relaciones que hoy pueden “cruzar” organización (a nivel DB)

Incluso en tablas que ya tienen `organizacion_id`, la mayoría de FKs apuntan a `... REFERENCES X(id)` sin incluir `organizacion_id`.  
Eso permite (a nivel estrictamente relacional) enlazar un registro de la organización A con un padre de la B si alguien inserta con privilegios.

Patrón recomendado para aislamiento fuerte:

- En tabla padre: `UNIQUE (organizacion_id, id)` (además del PK por `id`).
- En tabla hija: `FOREIGN KEY (organizacion_id, parent_id) REFERENCES parent(organizacion_id, id)`.

## Prioridad sugerida

1) Arreglar `es_admin()` para que sea tenant-aware y ajustar `roles` para permitir roles por organización.  
2) Habilitar RLS y políticas correctas en `conversation_summaries`.  
3) Decidir si `calendar_*` y “catálogos” son globales o por tenant; si son por tenant, agregar `organizacion_id` + políticas.  
4) Endurecer FKs a compuestas `(organizacion_id, id)` en entidades core (CRM/prospección) para evitar cruces en inserts privilegiados.

## Migraciones aplicadas/propuestas en este repo

- `supabase/migrations/20270519_090000_multitenant_security_hardening.sql`: roles por org + `es_admin()` tenant-aware + RLS para `conversation_summaries`.
- `supabase/migrations/20270519_100000_multitenant_calendar_catalog_agents.sql`: vuelve tenant-scoped `calendar_*`, `catalog_*`, `agentes/prompts/custom_fields`, y corrige `prospeccion_contacto_templates.slug` para que sea único por organización.
- `supabase/migrations/20270519_110000_multitenant_remaining_tables.sql`: completa tenant-scoping para inbox, panel, permisos/roles_permisos, secretos, webchat, etc. (incluye backfills y FKs compuestas donde aplica).

Ambas migraciones usan `00000000-0000-0000-0000-000000000001` como organización “legacy” para datos existentes; después conviene migrar datos a organizaciones reales.

## Queries útiles para detectar cruces (auditoría de datos)

Si ya tienes más de una organización cargada, estas consultas ayudan a detectar registros “mal enlazados”:

```sql
-- Actividades apuntando a contactos de otra org
select count(*) as mismatches
from public.actividades a
join public.contactos c on c.id = a.contacto_id
where a.organizacion_id <> c.organizacion_id;

-- Tickets apuntando a contactos/cuentas de otra org
select count(*) as mismatches
from public.tickets t
join public.contactos c on c.id = t.contacto_id
where t.organizacion_id <> c.organizacion_id;

select count(*) as mismatches
from public.tickets t
join public.cuentas cu on cu.id = t.cuenta_id
where t.organizacion_id <> cu.organizacion_id;
```




# HICE ESTO 

• Continué y ya quedó cerrada la parte crítica de multitenancy a nivel RLS + relaciones + creación de registros.

  - Corregí un problema fuerte: varias policies tipo *_admin_all usaban es_admin() sin filtrar por organizacion_id, lo que permitía
    que un admin de un tenant pudiera ver/modificar filas de otros tenants. Esto ya quedó tenant-safe.
  - Eliminé todos los defaults de organizacion_id (evita que algo caiga “por accidente” en 000...001) y aseguré triggers BEFORE
    INSERT en todas las tablas tenant-scoped para completar organizacion_id cuando viene NULL (y si no se puede inferir, ahora falla
    en vez de contaminar).
  - Forcé RLS en todas las tablas public (excepto spatial_ref_sys).

  Migrations nuevas en el repo (ya aplicadas):


  - supabase/migrations/20270519_090000_multitenant_security_hardening.sql
  - supabase/migrations/20270519_100000_multitenant_calendar_catalog_agents.sql
  - supabase/migrations/20270519_110000_multitenant_remaining_tables.sql
  - supabase/migrations/20270519_120000_multitenant_fk_hardening.sql
  - supabase/migrations/20270519_130000_multitenant_fk_hardening_crm.sql
  - supabase/migrations/20270519_140000_multitenant_policy_hardening.sql
  - supabase/migrations/20270519_150000_multitenant_policy_org_enforcement.sql
  - supabase/migrations/20270519_160000_multitenant_orgid_defaults_and_triggers.sql
  - supabase/migrations/20270519_170000_multitenant_force_rls.sql
  - supabase/migrations/20270519_183000_quotes_bucket_private.sql
  - supabase/migrations/20270519_184500_panel_calendar_bookings_grant.sql
  - supabase/migrations/20270519_185500_calendar_tables_select.sql
  - supabase/migrations/20270519_190000_panel_agenda_table_grants.sql

  Checks finales:

  - Tablas sin organizacion_id: solo organizaciones.
  - FKs “débiles” sin (organizacion_id, …): 0.
  - Policies sin guard de organizacion_id: 0.
  - Triggers faltantes BEFORE INSERT: 0.
  
  
  
## Lockdown de GRANTS

- `supabase/migrations/20270519_180500_multitenant_grants_lockdown.sql` revoca absolutamente todos los privilegios que tenían `anon` y `authenticated` sobre `public.*` (tablas, vistas, materialized views y secuencias) y elimina los *default privileges* que volvían a otorgarlos para objetos nuevos.  
- Únicamente se restauran permisos `SELECT/INSERT/UPDATE/DELETE` para `authenticated` en los módulos que todavía hablan directo con Supabase (`empleados`, `departamentos`, `puestos`, `usuarios`, `usuarios_roles`, `roles`, `roles_permisos`, `permisos`). Todo lo demás queda accesible sólo vía `service_role`.
- Con esto, un actor que tenga únicamente el anon key ya no puede consultar ninguna tabla `public.*`, y un usuario autenticado necesita pasar por FastAPI salvo en la sección de RRHH.
- `supabase/migrations/20270519_181500_multitenant_function_grants.sql` barre todas las funciones/RPC definidas por la app (excluye las que pertenecen a extensiones Postgres/PostGIS mediante `pg_depend`) y les revoca `EXECUTE` para `anon` y `authenticated`. Las funciones siguen disponibles para `service_role`, que es lo que usa FastAPI; desde el frontend ya no se pueden invocar RPCs directamente.
- `supabase/migrations/20270519_182500_storage_realtime_grants.sql` quita cualquier `SELECT/INSERT/UPDATE/DELETE` o acceso a secuencias en los schemas `storage` y `realtime` para `anon`/`authenticated`. Los servicios nativos de Supabase ya usan roles dedicados (`supabase_storage_admin`, `supabase_realtime_admin`), así que no impacta el backend pero evita que alguien con el anon key lea buckets/objetos directamente vía SQL.
- El bucket `quotes` dejó de ser público: los PDFs ahora viven privados en `storage` y se entregan con enlaces firmados efímeros a través de `/crm/quotes/{quote_id}/pdf` (consumido por `/api/embudo/quotes/[quoteId]/pdf`). Cualquier envío por WhatsApp genera un link firmado nuevo, y el panel ya no usa `storage/v1/object/public/*`.

# FALTANTE:
 - siguiente nivel: revisar funciones expuestas (RPCs), GRANTS en schemas fuera de `public` (storage/realtime) y definir si alguna tabla debe quedar totalmente “server-side” (ni siquiera HR).
