# Mezcla de datos entre tenants

## Descripción
- La tenant `9bb3c9eb-1687-4ee5-9d69-80c30f7f0c57` carga desde el dashboard global (embudo, leads, crm, visitas, settings, etc.) información perteneciente al tenant maestro `00000000-0000-0000-0000-000000000001`.
- Los logs (`logs/tenant-access.log`) confirman que las peticiones se hacen con `X-Organizacion-Id=9bb...` y `X-Usuario-Id=d05c24a7-7052-4201-ba04-3d8144079c90`, así que el backend sí está recibiendo el tenant correcto.
- Aun así, las vistas muestran datos globales del tenant maestro, lo que implica que las funciones RPC que sirven esos endpoints ignoran el contexto y devuelven filas de todos los tenants.

## Evidencia
1. Logs recientes (tenant access) muestran las mismas rutas de `/api/crm/*` con `organizacion_id=9bb...` pero los resultados provenían de `0000...`.
2. La tabla `public.lineas_de_negocio` sólo tiene filas para `0000...` (consulta SQL, sin filas para `9bb...`), lo que confirma que el contenido que se ve en la UI no pertenece a `9bb...`.
3. El usuario `d05c24a7-7052-4201-ba04-3d8144079c90` está correctamente registrado en `public.usuarios` y en Supabase Auth con `organizacion_id=9bb...` (veáse `raw_user_meta_data`).

## Causa raíz
- Muchas funciones/RPC que alimentan las vistas (por ejemplo `dashboard_kpis`, `panel_visitantes_sin_chat_estados`, `analytics_catalog_*`, `crm_propiedad_hierarquia`, etc.) son `SECURITY DEFINER` y ejecutan consultas sobre tablas multi-tenant **sin filtrar por `organizacion_id`** ni por `public.usuario_organizacion_id(auth.uid())`.
- Las políticas RLS no aplican durante la ejecución porque el rol definidor (generalmente `postgres`) puede leer datos de cualquier tenant, por lo tanto el backend recibe el tenant correcto pero la función retorna resultados sin filtrado.

## Siguiente pasos
1. Catalogar todas las funciones en `public` que usan `organizacion_id` pero carecen de un filtro seguro (ya hay una consulta previa sobre `pg_proc`).
2. Para cada RPC que expone datos del CRM, agregar `WHERE organizacion_id = COALESCE(p_organizacion_id, public.usuario_organizacion_id(auth.uid()))` o similar, y/o recibir el UUID del backend e inyectarlo antes de leer tablas.
3. Alternativamente, hacer que las funciones establezcan `app.current_organizacion_id` y confíen en políticas como `conversaciones_rpc_access` para garantizar que sólo se procesen filas del tenant actual.
4. Revalidar las vistas con `9bb...` y confirmar que las respuestas ya están vacías cuando la org no tiene datos, en lugar de sangrar filas del tenant maestro.

## Referencias rápidas
- Logs: `logs/tenant-access.log`.
- SQL de auditoría/funciones: `backups/postgres_20260126_203110/postgres_20260126_203110_schema.sql` (funciones `dashboard_kpis`, `panel_*`, etc.).
- Código backend: `backend/app/api/routes/crm.py` y `backend/app/repositories/crm.py` hacen las llamadas, pero el filtrado debe moverse a las funciones.

## Catalogación de funciones sin filtro
Consultando `pg_proc` se identificaron las funciones del esquema `public` que mencionan `organizacion_id` pero no llaman a `public.usuario_organizacion_id(...)` ni aplican ningún `WHERE` seguro:

| Función | Descripción |
| --- | --- |
| `asignar_vendedor_round_robin` | Balancea asignaciones rrhh sin atarse al tenant del usuario. |
| `catalog_document_embeddings_delete_missing` | Limpia embeddings de catálogo y no comprueba organizaicón. |
| `catalog_document_embeddings_search` | Busca embeddings sin filtrar por tenant. |
| `crm_contact_restart_stats` | Agrega estadísticas de restarts de oportunidades sin tenant. |
| `crm_propiedad_hierarquia` | Devuelve jerarquía geoespacial de propiedades sin limitar el `organizacion_id`. |
| `crm_propiedades_geojson` | Genera geojson de propiedades con un `WHERE` global. |
| `ensure_cliente_from_oportunidad` | Inserta clientes desde oportunidades, pero puede mezclar organizaciones. |
| `manejar_usuario_auth_nuevo` | Trigger de Supabase que escribe en `public.usuarios` sin validar el tenant inferido. |
| `next_role_codigo` | Genera códigos incrementales para roles; debe obligarse a pasar `organizacion_id`. |
| `purge_organizacion` / `purge_organizacion_preserve_rrhh` | Limpian datos completos de una organización; deben forzar el tenant correcto. |
| `registrar_mensaje_messenger` / `registrar_mensaje_whatsapp` | Webhooks de canales que llaman a funciones sin filtrar y, por tanto, pueden registrar datos en cualquier tenant. |
| `roles_autofill_codigo` / `roles_before_insert_guard` | Triggers que llenan `roles.codigo` y podrían usar `public.usuario_organizacion_id` para mantener el tenant. |
| `upsert_resultados_lote` | Graba resultados de búsquedas en `public.resultados` sin asegurar la organización. |
| `usuario_organizacion_id` | *Debe* usarse en otras funciones; actualmente figura porque no se llama a sí misma (queda como referencia). |

Estas funciones deben adaptarse para que reciban explícitamente el tenant (`p_organizacion_id`) y/o usen `public.usuario_organizacion_id(auth.uid())` antes de acceder a tablas multi-tenant. Mientras se revisan todas, el riesgo es que cualquier vista que las invoque muestre datos del tenant maestro aunque el usuario esté en `9bb...`.

## Trabajo realizado
- Se agregó `supabase/migrations/20260203_150000_tenant_rpc_filters.sql` que reescribe las RPC críticas (`dashboard_kpis`, ambas versiones de `embudo_visitantes_contador` y las funciones `panel_visitantes_sin_chat_*`) para que tomen el tenant del token activo (o del `p_organizacion` opcional), y aplican el filtro en `conversaciones`, `contactos`, `mensajes`, `webchat_visitantes` y las CTE derivadas. De esa forma las vistas que dependen de estos RPC ya no pueden devolver filas de `0000...001`.

## Siguientes pasos
1. Revisar los RPC restantes listados arriba (por ejemplo `crm_propiedades_geojson`, `panel_leads_geo_base`, `registrar_mensaje_*`, etc.) y aplicar la misma lógica de `organizacion_id`.
2. Añadir pruebas automatizadas o scripts manuales para invocar cada RPC desde `9bb3...` y confirmar que el resultado está scoped al tenant; en particular, verificar que un tenant vacío ya no obtiene datos del maestro.
