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

### 3) Backend conectado a la capa v2 y endpoint de ingesta web
Archivos:
- `backend/app/services/demografia_service.py`
- `backend/app/api/routes/crm.py`
- `backend/app/repositories/crm.py`

Estado:
- Implementado en código.

Incluye:
- Nuevo consumo RPC en backend:
  - `fetch_visitantes_resumen_v2(...)` -> usa `panel_visitantes_geo_resumen_v2`.
- Nuevos endpoints CRM:
  - `GET /crm/demografia/resumen-v2`
  - `GET /crm/demografia/mapa-v2`
- Nuevo endpoint público de ingesta web first-party:
  - `POST /crm/web/visit`
  - Registra sesiones en `web_sessions` vía RPC `record_web_session`.
  - Soporta resolución de tenant por `tenant_alias` (payload/header/meta) y fallback al tenant maestro.
  - Captura `session_id`, `landing/referrer`, `user_agent`, `ip`, geografía, UTM y metadata.

### 4) Instrumentación frontend de visitas web + consumo v2 en panel
Archivos:
- `landing/src/assets/js/modules/visit-tracking.js`
- `landing/src/assets/js/main.js`
- `frontend/panel/src/lib/mapa-conversion/api.ts`

Estado:
- Implementado en código.

Incluye:
- Nuevo tracker first-party en `talia.mx`:
  - Envía `POST /api/crm/web/visit` con `session_id`, `landing_url`, `referrer`, `user_agent`, `device_type`, `utm_*`, `tenant_alias` y metadata.
  - Dispara en:
    - carga inicial (`page_load`)
    - navegación cliente (`history push/replace`, `popstate`, `hashchange`).
  - Mantiene `session_id` persistente (`talia-web-session`) y reutiliza `talia-webchat-session` cuando exista para facilitar unión de funnels web <-> webchat.
- El panel de `mapa-de-conversion` ahora consume:
  - `GET /crm/demografia/resumen-v2`
  - `GET /crm/demografia/mapa-v2`
  - mediante `loadDemografiaData(...)`.
- La vista de mapa ahora soporta filtros de atribución en URL/UI:
  - `source_class`
  - `utm_source`
  - `utm_medium`
  - `utm_campaign`
- El detalle por ubicación muestra:
  - `sesiones_web_total`
  - `fuentes_top`
  - `utm_top`
- KPIs superiores refinados para v2:
  - `sesiones_web_total` global
  - conversaciones por canal (`webchat`, `whatsapp`, `voz`)
  - fuente principal agregada desde `fuentes_top`
- Ajustes de calidad aplicados:
  - `Top ubicación` evita priorizar `UNK/Desconocido` cuando existen ubicaciones válidas.
  - `Tráfico web` toma fallback por suma de dataset (`traffic_web.sesiones_web_total`) si el total resumido llega en 0.
  - `Fuente principal` agrega señales desde `summary.visitantes.items.fuentes_top` + `map.dataset[*].traffic_web.fuentes_top`.
- Filtro de fechas global para toda la vista:
  - soporta `rango` (`hoy`, `7d`, `30d`, `mes`, `fechas`)
  - soporta `desde` / `hasta`
  - aplica tanto a `resumen-v2` como a `mapa-v2`.

### 5) Fix de ingesta web en dominio `talia.mx` + fallback KPI v3
Archivos:
- `frontend/panel/src/app/api/crm/web/visit/route.ts`
- `backend/app/services/demografia_service.py`
- `supabase/migrations/20260303_131500_panel_visitantes_geo_resumen_v3_webchat_fallback.sql`

Estado:
- Implementado en código y migración aplicada en Supabase via MCP.

Incluye:
- Nuevo proxy Next público:
  - `POST /api/crm/web/visit` (en `frontend/panel`) reenviando a `POST /crm/web/visit` del backend.
  - Conserva cabeceras de trazabilidad (`X-Forwarded-For`, `X-Real-IP`, `Referer`, `User-Agent`) para no perder contexto de origen.
- Ajuste backend demografía:
  - `fetch_visitantes_resumen_v2(...)` ahora consulta `panel_visitantes_geo_resumen_v3(...)`.
- Nueva función SQL `panel_visitantes_geo_resumen_v3(...)`:
  - Mantiene salida compatible con v2.
  - Si `web_sessions` está vacío, calcula fallback de:
    - `sesiones_web_total`
    - `fuentes_top`
    - `utm_top`
    usando señales de `webchat_visitantes`.
  - Cuando hay filtros de atribución (`source_class`, `utm_*`), también aplica el filtro a métricas de `webchat_total`, `visitas_con_chat`, `visitas_sin_chat` y `total_visitas` para que mapa + resumen cambien de forma consistente.
  - Ajuste adicional de consistencia:
    - Con filtros de atribución activos, `conversaciones_whatsapp` y `conversaciones_voz` se recalculan sólo para contactos atribuibles (vía `webchat_visitantes.contacto_id` -> `conversaciones.contacto_id`).
    - `Etapa líder` no se reporta como métrica atribuible bajo estos filtros y se muestra como `No atribuible por origen` para evitar mezclar datos no filtrables.

### 6) Ajuste de nomenclatura UI (sin tecnicismos)
Archivos:
- `frontend/panel/src/lib/mapa-conversion/source-class.ts`
- `frontend/panel/src/components/mapa-conversion/map-kpis.tsx`
- `frontend/panel/src/components/mapa-conversion/controls.tsx`
- `frontend/panel/src/components/mapa-conversion/row-detail.tsx`
- `frontend/panel/src/app/mapa-de-conversion/page.tsx`

Estado:
- Implementado en código.

Objetivo:
- Evitar términos técnicos confusos (`campaign`, `UTM`, `source_class`) en textos visibles al usuario final.

Cambios de nombres aplicados:
- Tarjeta KPI:
  - `Fuente principal` -> `Origen principal`.
  - Subtexto: `Top source de sesiones web` -> `Origen principal de sesiones web`.
- Catálogo de origen (`source_class`) en UI:
  - `campaign` -> `Enlace de campaña`
  - `direct` -> `Entrada directa`
  - `organic_search` -> `Búsqueda en Google`
  - `organic_social` -> `Redes sociales`
  - `referral` -> `Otro sitio web`
  - vacío/desconocido -> `Sin identificar`
- Controles de atribución:
  - Placeholder selector: `Fuente de tráfico` -> `Origen de visita`.
  - `utm_source` -> `Origen de campaña`.
  - `utm_medium` -> `Tipo de medio`.
  - `utm_campaign` -> `Nombre de campaña`.
  - Los 3 campos dejaron de ser texto libre y ahora son `select` con opciones existentes en BD para el filtro activo (tomadas de `utm_top` del resumen y dataset).
- Detalle por ubicación:
  - Etiquetas de `fuentes_top` ahora usan el mismo mapeo de negocio.
  - Mensaje `Sin UTM top...` -> `Sin campañas top...`.

## Validaciones realizadas

1. Existencia de funciones:
- `record_web_session(...)`: OK
- `panel_visitantes_geo_resumen_v2(...)`: OK

2. Prueba de humo:
- La funcion `panel_visitantes_geo_resumen_v2('estado', ...)` responde con datos.
- En el entorno actual se observan datos en `webchat`.
- `web_sessions` aun aparece en 0, esperado hasta habilitar la ingesta web first-party desde `talia.mx`.
- La funcion `panel_visitantes_geo_resumen_v3('pais', ...)` devuelve `sesiones_web_total` y `fuentes_top` con fallback desde `webchat_visitantes` cuando `web_sessions = 0`.

## Decisiones tecnicas

1. No se reemplazo la funcion anterior `panel_visitantes_geo_resumen_ext`.
- Motivo: evitar ruptura del frontend/backend actual mientras se migra a endpoints v2.

2. Se priorizo compatibilidad incremental.
- El nuevo agregado v2 ya esta listo para ser consumido por nuevas rutas API sin afectar las existentes.

## Siguientes pasos (orden recomendado)

1. Backend:
- Endpoints v2 ya implementados y conectados. Verificar despliegue activo tras reinicio de `talia-api.service`.

2. Ingesta web:
- Endpoint e instrumentación implementados. Verificar que `frontend/panel` desplegado incluya el nuevo route handler `/api/crm/web/visit`.
- Validar en producción:
  - abrir `https://talia.mx/`
  - confirmar `POST /api/crm/web/visit` con `204`
  - confirmar filas nuevas en `public.web_sessions`.

3. Frontend mapa:
- API migrada a `resumen-v2/mapa-v2` y UI base de atribución ya visible.
- Con v3 activo, `Tráfico web` y `Fuente principal` ya no dependen exclusivamente de `web_sessions` para mostrar señal útil inicial.

4. Exportacion XLSX:
- Implementar `GET /crm/demografia/mapa-v2/export/xlsx` respetando filtros activos.

## Evidencia de archivos

- `supabase/migrations/20260303_120000_web_sessions_base.sql`
- `supabase/migrations/20260303_123000_panel_visitantes_geo_resumen_v2.sql`
- `supabase/migrations/20260303_131500_panel_visitantes_geo_resumen_v3_webchat_fallback.sql`
- `frontend/panel/src/app/api/crm/web/visit/route.ts`
- `frontend/panel/src/lib/mapa-conversion/source-class.ts`
- `docs/Plan_mapa_conversion/plan_mapa_conversion_integral.md`
