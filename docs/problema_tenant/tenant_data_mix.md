# Mezcla de datos entre tenants

## Descripción
- La tenant `9bb3c9eb-1687-4ee5-9d69-80c30f7f0c57` abre el dashboard con `X-Organizacion-Id=9bb...` (según `logs/tenant-access.log`) pero todas las vistas principales renderizan filas pertenecientes al tenant maestro `00000000-0000-0000-0000-000000000001`.
- Las vistas en las que se detectó mezcla inicialmente son las siguientes:
  - `embudo`
  - `mapa-de-conversion`
  - `leads`
  - `crm`
  - `crm/oportunidades`
  - `crm/leads`
  - `crm/whatsapp/asignaciones`
  - `prospeccion/prospectos`
  - `settings/propiedades`
  - `settings/productos/lineas`
  - `settings/productos/familias`
  - `settings/productos/modelos`
  - `settings/productos/items`
  - `settings/email`
  - `settings/formato-cotizacion`
  - `settings/usuarios`
  - `settings/usuarios/roles`
  - `settings/empleados`
  - `settings/empleados/departamentos`
  - `settings/empleados/puestos`
  - `visitas`
- Después de aplicar las correcciones recientes, aún siguen presentando datos del tenant maestro estas vistas del tenant `9bb3...`:
  - `mapa-de-conversion`
  - `prospeccion/prospectos`
  - `settings/email`
  - `settings/productos/items`
  - `settings/usuarios` (muestra al administrador global de `0000...001`)
  - `settings/usuarios/roles`
  - `settings/usuarios/permisos`
  - `settings/empleados/departamentos`
  - `settings/empleados/puestos`
  - `visitas`

## Evidencia
1. Los registros en `logs/tenant-access.log` indican `organizacion_id=9bb3...` y `usuario=d05c24a7-7052-4201-ba04-3d8144079c90` para todas las rutas afectadas, lo que confirma que el backend sí recibe el header correcto.
2. El tenant `9bb3...` no tiene filas en tablas como `public.lineas_de_negocio`, así que cualquier dato que aparezca en la UI no puede pertenecerle; solo el tenant `0000...001` tiene registros en la copia de la base de datos (`backups/postgres_20260126_203110`).
3. El usuario mencionado existe en `public.usuarios` y en Supabase Auth con `organizacion_id=9bb...` (buscando en `raw_user_meta_data`).

## Errores recientes durante migraciones
- Al ejecutar la migración se encontró el siguiente error: `function public.embudo_visitantes_contador(timestamp with time zone, timestamp with time zone, uuid) does not exist`. Significa que la función que alimenta la vista del embudo no está definida cuando se ejecuta la migración.
- Posteriormente salió `missing FROM-clause entry for table "summary"` en la misma consulta. Esa tabla/CTE no está declarada dentro del cuerpo del SQL que se intentaba aplicar.
- Ambos errores deben resolverse antes de volver a aplicar cualquier script que toque vistas/RPCs multitenant, porque actualmente el upgrade no llega a filtrado alguno.

## Causa raíz
- Las funciones/RPC que sirven las vistas mencionadas (por ejemplo, `dashboard_kpis`, `panel_visitantes_sin_chat_*`, `crm_propiedad_hierarquia`, `crm_propiedades_geojson`, `registrar_mensaje_whatsapp`, etc.) se ejecutan como `SECURITY DEFINER` y no aplican filtros por `organizacion_id` ni invocan `public.usuario_organizacion_id(auth.uid())` antes de leer tablas con datos compartidos.
- Durante la ejecución de estas RPC las políticas RLS no se aplican porque el rol definidor (generalmente `postgres`) puede acceder a cualquier tenant, así que la respuesta siempre contiene todas las filas; el backend pasa los headers correctos pero no hay ningún `WHERE` que los use.

## Siguiente pasos inmediatos
1. Repasar todas las funciones/RPC en `public` que mencionan `organizacion_id` y validar si usan `public.usuario_organizacion_id(...)` o reciben el UUID del tenant desde el backend. Ya hay una catalogación inicial (ver tabla más abajo).
2. Para cada RPC crítica que alimenta las vistas afectadas, forzar un filtro como `WHERE organizacion_id = COALESCE(p_organizacion_id, public.usuario_organizacion_id(auth.uid()))` o alternar los `JOIN` con tablas formateadas para ese tenant.
3. Revisar los webhooks (por ejemplo, `registrar_mensaje_whatsapp` y `registrar_mensaje_messenger`), los triggers y los scripts de purgado para asegurarse de que no escriban en otros tenants.
4. Una vez aplicados los filtros, validar desde `9bb3...` y confirmar que el backend responde con datasets vacíos para vistas que todavía no tienen datos en ese tenant.

## Referencias rápidas
- `logs/tenant-access.log`
- Copia del esquema: `backups/postgres_20260126_203110/postgres_20260126_203110_schema.sql` (ahí están los `dashboard_*`, `panel_*`, `embudo_visitantes_contador`, etc.).
- Código backend que expone los RPC: `backend/app/api/routes/crm.py` y `backend/app/repositories/crm.py`.

## Catalogación de funciones sin filtro
Consultando `pg_proc` se identificaron las funciones del esquema `public` que mencionan `organizacion_id` pero no aplican filtros seguros:

| Función | Descripción |
| --- | --- |
| `asignar_vendedor_round_robin` | Balancea asignaciones sin atarse al tenant del usuario. |
| `catalog_document_embeddings_delete_missing` | Limpia embeddings de catálogo sin comprobar organización. |
| `catalog_document_embeddings_search` | Busca embeddings sin filtrar por tenant. |
| `crm_contact_restart_stats` | Agrega estadísticas de restarts de oportunidades sin tenant. |
| `crm_propiedad_hierarquia` | Devuelve jerarquía geoespacial sin limitar `organizacion_id`. |
| `crm_propiedades_geojson` | Genera geojson con filtrado global. |
| `ensure_cliente_from_oportunidad` | Inserta clientes desde oportunidades y puede mezclar organizaciones. |
| `manejar_usuario_auth_nuevo` | Trigger de Supabase que escribe en `public.usuarios` sin validar tenant. |
| `next_role_codigo` | Genera códigos de roles; debe recibir `organizacion_id`. |
| `purge_organizacion` / `purge_organizacion_preserve_rrhh` | Limpian datos completos; deben forzar el tenant. |
| `registrar_mensaje_messenger` / `registrar_mensaje_whatsapp` | Webhooks que pueden escribir para cualquier tenant. |
| `roles_autofill_codigo` / `roles_before_insert_guard` | Triggers que llenan `roles.codigo` y necesitan el tenant correcto. |
| `upsert_resultados_lote` | Graba resultados en `public.resultados` sin asegurar organización. |
| `usuario_organizacion_id` | Debe reutilizarse; la función figura aquí porque no se auto-invoca. |

Estas funciones deben adaptarse para recibir el tenant por parámetro y/o usar `public.usuario_organizacion_id(auth.uid())` antes de tocar tablas multitenant. Mientras tanto, cualquier vista que las llame seguirá devolviendo filas del tenant maestro aunque el usuario esté en `9bb3...`.

## Trabajo realizado previo
- Se intentó aplicar `supabase/migrations/20260203_150000_tenant_rpc_filters.sql`, que reescribe `dashboard_kpis`, las variantes de `embudo_visitantes_contador` y `panel_visitantes_sin_chat_*` para que tomen el tenant del token activo o de un `p_organizacion` opcional y filtren por `organizacion_id` en las CTE relacionadas. Sin embargo, la migración falló por los errores listados más arriba, así que aún no está en producción.

## Siguientes pasos secundarios
1. Terminar de adaptar las RPC restantes (`crm_propiedades_geojson`, `panel_leads_geo_base`, `registrar_mensaje_*`, etc.) con el mismo enfoque de `organizacion_id`.
2. Crear pruebas manuales o scripts que llamen cada RPC desde el tenant `9bb3...` para garantizar que los resultados estén scoped a ese tenant; especialmente verificar que el tenant vacío ya no obtiene datos del maestro `0000...001`.
