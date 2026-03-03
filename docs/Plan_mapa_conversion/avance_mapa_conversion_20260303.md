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
- Endpoints v2 ya implementados. Falta conectarlos en frontend.

2. Ingesta web:
- Endpoint e instrumentación implementados. Falta despliegue/validación en producción con datos reales.

3. Frontend mapa:
- API de datos ya migrada a `resumen-v2/mapa-v2`. Falta iteración visual para exponer campos nuevos (`traffic_web`, `fuentes_top`, `utm_top`) en la UI.

4. Exportacion XLSX:
- Implementar `GET /crm/demografia/mapa-v2/export/xlsx` respetando filtros activos.

## Evidencia de archivos

- `supabase/migrations/20260303_120000_web_sessions_base.sql`
- `supabase/migrations/20260303_123000_panel_visitantes_geo_resumen_v2.sql`
- `docs/Plan_mapa_conversion/plan_mapa_conversion_integral.md`
