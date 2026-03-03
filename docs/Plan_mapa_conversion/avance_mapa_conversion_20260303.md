# Avance Mapa de Conversion · 2026-03-03

## Resumen
Se inició la implementacion por base de datos para soportar el `Mapa de Conversion` integral (trafico web + webchat + whatsapp + voz), manteniendo compatibilidad con la vista actual.

## Cambios aplicados

### 1) Sesiones web first-party (base)
Archivo:
- `supabase/migrations/20260303_120000_web_sessions_base.sql`

Estado:
- Aplicada en Supabase via MCP.

Incluye:
- Tabla `public.web_sessions` multi-tenant con RLS.
- Indices para consultas por organizacion, fuente, UTM y geografia.
- Funcion `public.record_web_session(...)` para upsert idempotente por `(organizacion_id, session_id)`.
- Clasificacion inicial de origen (`source_class`) y extraccion de `utm_*`, `eid`, `cid`, `tid`.

### 2) Agregado geografico v2 para mapa
Archivo:
- `supabase/migrations/20260303_123000_panel_visitantes_geo_resumen_v2.sql`

Estado:
- Aplicada en Supabase via MCP.

Funcion nueva:
- `public.panel_visitantes_geo_resumen_v2(...)`

Parametros soportados:
- `p_nivel` (`pais|estado|municipio`)
- `p_from`, `p_to`
- `p_estado` (filtro para nivel municipio)
- `p_source_class`, `p_utm_source`, `p_utm_medium`, `p_utm_campaign`

Salida principal por ubicacion:
- `sesiones_web_total`
- `sesiones_webchat_total`
- `sesiones_con_chat_webchat`
- `sesiones_sin_chat_webchat`
- `conversaciones_whatsapp`
- `conversaciones_voz`
- `fuentes_top` (jsonb)
- `utm_top` (jsonb)

Campos de compatibilidad conservados:
- `total_visitas`, `visitas_con_chat`, `visitas_sin_chat`
- `webchat_total`, `webchat_con_chat`, `webchat_sin_chat`
- `whatsapp_total`, `voz_total`, `has_data`

## Validaciones realizadas

1. Existencia de funciones:
- `record_web_session(...)`: OK
- `panel_visitantes_geo_resumen_v2(...)`: OK

2. Prueba de humo:
- La funcion `panel_visitantes_geo_resumen_v2('estado', ...)` responde con datos.
- En el entorno actual se observan datos en `webchat`.
- `web_sessions` aun aparece en 0, esperado hasta habilitar la ingesta web first-party desde `talia.mx`.

## Decisiones tecnicas

1. No se reemplazo la funcion anterior `panel_visitantes_geo_resumen_ext`.
- Motivo: evitar ruptura del frontend/backend actual mientras se migra a endpoints v2.

2. Se priorizo compatibilidad incremental.
- El nuevo agregado v2 ya esta listo para ser consumido por nuevas rutas API sin afectar las existentes.

## Siguientes pasos (orden recomendado)

1. Backend:
- Crear endpoints `GET /crm/demografia/resumen-v2` y `GET /crm/demografia/mapa-v2` consumiendo `panel_visitantes_geo_resumen_v2`.

2. Ingesta web:
- Implementar `POST /crm/web/visit` para poblar `web_sessions` desde `talia.mx`.

3. Frontend mapa:
- Migrar vista `mapa-de-conversion` a contrato v2 (bloques web/conversacion/leads/atribucion).

4. Exportacion XLSX:
- Implementar `GET /crm/demografia/mapa-v2/export/xlsx` respetando filtros activos.

## Evidencia de archivos

- `supabase/migrations/20260303_120000_web_sessions_base.sql`
- `supabase/migrations/20260303_123000_panel_visitantes_geo_resumen_v2.sql`
- `docs/Plan_mapa_conversion/plan_mapa_conversion_integral.md`
