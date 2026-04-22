# Security/RLS Hardening por fases

Fecha: 2026-03-28  
Contexto actual: `develop` y `production` apuntan al mismo `project-ref` (`qnimyamtczbbwmlrlejc`), por lo que no se recomienda aplicar cambios de seguridad directo sin staging DB aislado.

## Fase 1 (implementada en migración)
Migración: `supabase/migrations/20280428_120000_security_rls_hardening_phase1.sql`

Objetivo:
- habilitar RLS en tablas tenant-scoped sin políticas;
- cerrar tablas internas a `service_role`;
- cubrir lint de tabla con RLS sin policy;
- mover catálogos SCIAN a modelo explícito de lectura autenticada.

Tablas incluidas:
- Tenant scoped: `lineas_de_negocio`, `familias_productos`, `modelos_productos`, `recursos_media`, `propiedad_desarrollos_mix`, `propiedad_desarrollos_mix_items`.
- Internas (service only): `platform_admins`, `organizacion_rutas_canal`, `roles_codigo_counters`, `sales_notification_jobs`, `tenant_bootstrap_catalog`, `scian_vector_store_progress`.
- Legacy lint fix: `propiedad_niveles` (service only).
- SCIAN catálogos read-only para authenticated: `scian_sector`, `scian_subsector`, `scian_rama`, `scian_subrama`, `scian_clase`, `scian_clase_indice`.

Validación mínima recomendada (staging):
1. Login + navegación panel.
2. Settings productos (líneas/familias/modelos/media) CRUD básico.
3. Prospección SCIAN autocompletados/listados.
4. Endpoints de platform-admin (tenants y rutas de canal).
5. Jobs de notificaciones de ventas.

## Fase 2 (implementada en migración)
Migración: `supabase/migrations/20280428_130000_security_definer_views_phase2.sql`

Objetivo:
- revisar y corregir `security_definer_view` con estrategia de vistas seguras:
1. cambiar a `security_invoker` cuando aplique, o
2. encapsular acceso en funciones `SECURITY DEFINER` con `search_path` fijo y grants mínimos.

Vistas marcadas:
- `public.scian_clases_flat`
- `public.prospeccion_prospecto_contacto_stats`
- `public.v_asignaciones_vendedores`
- `public.organizaciones_missing_etapas_pipeline`

## Fase 3 (implementada en migración)
Migración: `supabase/migrations/20280428_140000_security_function_search_path_phase3.sql`

Objetivo:
- resolver `function_search_path_mutable` en funciones críticas.

Acción:
- `ALTER FUNCTION/PROCEDURE ... SET search_path = public, extensions, pg_temp;`
- priorizar funciones expuestas a `authenticated` y/o llamadas desde APIs públicas.

## Fase 3.1 (implementada parcialmente en migración)
Migración aplicada: `supabase/migrations/20280428_150500_security_rls_remaining_errors_phase3_1_app_tables.sql`

Objetivo:
- cerrar errores `rls_disabled_in_public` remanentes.

Estado:
- resuelto en tablas de app:
  - `public.asignaciones_vendedores`
  - `public.producto_metadata_schemes`
- pendiente técnico en tabla de extensión:
  - `public.spatial_ref_sys` (PostGIS, ownership no editable desde rol actual de migración).

## Fase 4 (implementada parcialmente en migraciones)
Migraciones:
- `supabase/migrations/20280428_160000_security_phase4_remove_permissive_rls.sql`
- `supabase/migrations/20280428_170000_security_phase4_lock_materialized_views.sql`

Objetivo:
- performance hardening derivado de advisors.

Acción:
1. índices faltantes en FKs de tablas de alto tráfico;
2. deduplicar índices (`prospeccion_prospectos_org_creado_idx` vs `prospeccion_prospectos_organizacion_idx`);
3. reducir políticas permisivas duplicadas por tabla/acción donde sea viable.

Estado actual (security):
- resuelto:
  - `rls_policy_always_true` en `prospeccion_contactos_log` y `prospeccion_prospectos` (se eliminaron políticas globales redundantes).
  - `materialized_view_in_api` en:
    - `public.inbox_conversation_snapshot_mv`
    - `public.mv_resultados_por_actividad`
    - `public.prospeccion_query_daily_mv`
    (acceso directo revocado para `anon/authenticated`, queda `service_role`).
- pendientes técnicos/operativos:
  - `public.spatial_ref_sys` (`rls_disabled_in_public`) por ownership de extensión.
  - `extension_in_public` para `btree_gist`, `pg_trgm`, `postgis`, `unaccent`, `vector`.
  - `auth_leaked_password_protection` (setting de Auth en dashboard).

## Excepciones Operativas Aceptadas
Fecha de registro: 2026-03-28

- `public.spatial_ref_sys`:
  - Motivo: tabla de metadatos de PostGIS. La app consume la extensión, pero no es dueña del objeto ni puede aplicar `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` desde el flujo normal de migraciones.
  - Decisión: excepción aceptada. Se documenta como warning esperado del advisor, no como deuda funcional de multitenancy.
  - Nota: no afecta datos de negocio; solo acompaña a las geometrías y funciones de PostGIS.

- `extension_in_public` (`btree_gist`, `pg_trgm`, `postgis`, `unaccent`, `vector`):
  - Motivo: mover extensiones fuera de `public` requiere refactor y validación amplia.
  - Decisión: excepción aceptada temporalmente; no mover en esta fase para evitar regresiones.

## Regla operativa
- Aplicar primero en proyecto Supabase de staging aislado.
- Ejecutar smoke suite tenant `0001`.
- Solo después promover la misma migración a producción.
