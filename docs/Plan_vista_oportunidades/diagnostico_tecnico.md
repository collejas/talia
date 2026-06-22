# Diagnostico Tecnico Vista Oportunidades

## Resumen ejecutivo

La vista `/oportunidades` hoy funciona como un listado y panel de consulta rapido, pero todavia no cumple del todo como listado maestro porque:

- Carga un lote fijo y no representa el total real.
- Filtra parcialmente en cliente sobre el lote cargado.
- Usa acciones ligeras de operacion que pertenecen al embudo, como la reasignacion.
- No tiene una frontera tecnica suficientemente clara entre consulta y operacion.

La base tecnica permite separar bien ambos mundos:

- `/embudo` ya concentra el trabajo operativo del pipeline.
- `/oportunidades` puede quedarse como listado maestro, detalle ligero y control rapido.

## Diagnostico por capa

### Frontend

#### Lo que ya existe

- La pagina principal de oportunidades usa un layout simple con resumen y tabla.
- Hay filtros por etapa, estado, asignado, cuenta, persona, canal, monto, fechas y reinicios.
- La tabla permite una accion de reasignacion.

#### Hallazgos

1. La pagina carga oportunidades con un limite fijo y luego aplica filtros locales sobre ese lote.
2. El resumen de KPIs depende de un componente aparte y no esta integrado a paginacion real del listado.
3. La tabla no expone un detalle formal de oportunidad.
4. La accion de reasignacion usa el mismo patron operativo del embudo, lo que mezcla las fronteras.
5. La vista de filtros depende de opciones derivadas de APIs auxiliares y de valores hardcoded en el cliente.

#### Archivos relevantes

- [frontend/panel/src/app/oportunidades/page.tsx](/var/www/talia/frontend/panel/src/app/oportunidades/page.tsx)
- [frontend/panel/src/app/oportunidades/oportunidades-table.client.tsx](/var/www/talia/frontend/panel/src/app/oportunidades/oportunidades-table.client.tsx)
- [frontend/panel/src/app/oportunidades/oportunidades-filters.client.tsx](/var/www/talia/frontend/panel/src/app/oportunidades/oportunidades-filters.client.tsx)
- [frontend/panel/src/app/oportunidades/oportunidades-summary-lazy.client.tsx](/var/www/talia/frontend/panel/src/app/oportunidades/oportunidades-summary-lazy.client.tsx)
- [frontend/panel/src/lib/crm/opportunities.ts](/var/www/talia/frontend/panel/src/lib/crm/opportunities.ts)
- [frontend/panel/src/app/api/oportunidades/filter-options/route.ts](/var/www/talia/frontend/panel/src/app/api/oportunidades/filter-options/route.ts)

### Backend

#### Lo que ya existe

- `GET /crm/oportunidades` devuelve oportunidades filtradas.
- `POST /crm/oportunidades` crea una oportunidad.
- `GET /crm/oportunidades/{id}` consulta una oportunidad.
- `POST /crm/oportunidades/{id}/reasignar` reasigna vendedor.
- `POST /crm/pipeline/opportunities`, `PATCH ...` y `DELETE ...` ya existen para operacion del embudo.

#### Hallazgos

1. El endpoint de listado devuelve `items`, `limit` y `offset`, pero no un `total` real del universo consultado.
2. El repositorio de oportunidades devuelve solo la pagina actual y no expone conteo completo.
3. La ruta de reasignacion hace mas que reasignar: alinea persona y conversacion cuando aplica, por lo que es una accion operativa y no solo de listado.
4. El backend ya tiene el contrato de update general de oportunidad, pero la UI actual no lo aprovecha como CRUD basico separado.

#### Archivos relevantes

- [backend/app/api/routes/crm.py](/var/www/talia/backend/app/api/routes/crm.py)
- [backend/app/repositories/crm.py](/var/www/talia/backend/app/repositories/crm.py)

### Base de datos

#### Lo que ya existe

- `public.oportunidades` tiene columnas reales para los campos de negocio principales.
- Existe `public.oportunidad_etapas_historial` para trazabilidad.
- Hay RLS por organizacion para oportunidades.
- Existen columnas materializadas para `canal`, `contacto_nombre` y `restart_sequence`.

#### Hallazgos

1. El modelo soporta bien listado, filtro y auditoria.
2. El esquema aun usa `metadata` para parte de la logica derivada, pero ya hay una materializacion parcial correcta.
3. Hay indices utiles, pero la estrategia de listado sigue limitada por el contrato de API y no por la BD.

#### Archivos relevantes

- [supabase/migrations/20260601_200500_crm_core_entities.sql](/var/www/talia/supabase/migrations/20260601_200500_crm_core_entities.sql)
- [supabase/migrations/20260601_201500_crm_rls_policies.sql](/var/www/talia/supabase/migrations/20260601_201500_crm_rls_policies.sql)
- [supabase/migrations/20280513_020000_oportunidades_materialized_columns.sql](/var/www/talia/supabase/migrations/20280513_020000_oportunidades_materialized_columns.sql)
- [supabase/migrations/20280513_010000_oportunidades_dashboard_indexes.sql](/var/www/talia/supabase/migrations/20280513_010000_oportunidades_dashboard_indexes.sql)

### Seguridad

#### Lo que ya existe

- El backend valida permisos con `pipeline.view`.
- El backend vuelve a validar scope y permisos para reasignar.
- La RLS de oportunidades protege el tenant.

#### Hallazgos

1. Supabase reporto `public.spatial_ref_sys` con RLS deshabilitado en schema public.
2. Supabase reporto varias funciones `SECURITY DEFINER` ejecutables desde el API, incluyendo `asignar_vendedor_round_robin`.
3. La capa frontend no debe considerarse suficiente para limitar acciones; la validacion de backend ya existe y debe mantenerse.

#### Referencias de auditoria

- [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database linter](https://supabase.com/docs/guides/database/database-linter)

## Brechas prioritarias

### P0

- Paginacion real con total real.
- El listado no debe depender solo del lote cargado en cliente.
- Separar claramente lectura/listado de acciones operativas.

### P1

- Agregar detalle formal de oportunidad.
- Agregar CRUD basico controlado.
- Definir ruta de acceso a embudo desde la fila o detalle.

### P2

- Mejorar filtros guardados y presets.
- Mejorar exportacion.
- Mejorar indicadores de auditoria y actividad reciente.

## Tareas tecnicas derivadas

### Frontend

- Cambiar la pagina de oportunidades para paginar con estado real de pagina.
- Mostrar total real, no solo el numero de items cargados.
- Separar acciones de fila: ver detalle, reasignar, ir al embudo.
- Agregar drawer o pagina de detalle si el listado debe soportar CRUD basico.
- Mantener filtros pero sincronizados con paginacion.

### Backend

- Modificar `GET /crm/oportunidades` para devolver `total` real.
- Definir contrato de paginacion estable: `items`, `total`, `page` o `offset`, `limit`.
- Separar una respuesta de detalle de oportunidad si la UI necesita drawer.
- Mantener reasignacion como accion controlada y validada.

### Base de datos

- Validar indices para los filtros usados por el listado.
- Revisar si falta indice compuesto para consultas frecuentes de listado.
- Mantener `canal`, `contacto_nombre` y `restart_sequence` como columnas reales.

### Seguridad

- Revisar funciones `SECURITY DEFINER` expuestas por Supabase.
- Revisar la table `spatial_ref_sys` por el aviso de RLS en public.
- Mantener permisos por backend aunque la UI oculte acciones.

## Conclusion

Si quieres que `/oportunidades` sea el listado maestro, el trabajo tecnico clave no es rehacer el embudo, sino:

1. Darle paginacion y total reales.
2. Encerrar las acciones operativas en `/embudo`.
3. Definir un CRUD ligero y un detalle claro para oportunidades.

