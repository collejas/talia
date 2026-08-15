# Plan maestro · Mapa de Conversión Integral

Fecha original: 2026-03-03
Última actualización: 2026-08-15
Ruta: `docs/Plan_mapa_conversion/plan_mapa_conversion_integral.md`

Ruta operativa única:

- `docs/Plan_mapa_conversion/backlog_maestro_mapa_conversion.md`
- `docs/Plan_mapa_conversion/changelog_maestro_mapa_conversion.md`

Índice de la carpeta:

- `docs/Plan_mapa_conversion/README.md`
- `docs/Plan_mapa_conversion/changelog.md`
- `docs/Plan_mapa_conversion/plan_latencia_mapa_conversion.md`
- `docs/Plan_mapa_conversion/plan_mapa_conversion_multicanal.md`
- `docs/Plan_mapa_conversion/alineacion_tracking_web_tenants_20260815.md`
- `docs/Crear_webchat_tenants/plan_tracking_web_tenants.md`

Documentos relacionados:

- `docs/Plan_mapa_conversion/plan_latencia_mapa_conversion.md`
- `docs/Plan_mapa_conversion/plan_mapa_conversion_multicanal.md`

## 1) Objetivo de negocio

Construir una vista de `Mapa de Conversión` que permita responder de forma confiable:

- Desde dónde nos visitan (`google`, `direct`, `referidos`, `campañas`, etc.).
- Quiénes nos visitan (cuando sea posible vincular sesión -> contacto/conversación).
- Cuántos nos visitan por fuente/canal y cómo convierten.
- Cómo se relacionan las visitas con:
  - entradas a `talia.mx`,
  - uso de `webchat`,
  - conversaciones de `WhatsApp` y `Voz`,
  - clics desde enlaces de prospección.

## 2) Problema actual (resumen)

Hoy la vista mezcla dos mundos distintos:

- `Visitas webchat` (desde `webchat_visitantes`), y
- `Conversaciones WhatsApp/Voz` (desde `conversaciones`).

Esto impide medir correctamente tráfico web general y atribución completa de origen.

Además:

- `referrer` y `landing` se capturan mediante la ingesta first-party de `web_sessions`; el Webchat conserva su fuente especializada.
- La atribución de sesiones UTM en prospección está sesgada a `utm_medium=email`.
- `public.web_sessions` ya es la entidad unificada de sesión web por tenant.

## 3) Alcance del plan

### Incluye

- Modelo de datos unificado para visitas web (first-party) por tenant.
- Atribución de fuente/medio/campaña y clasificación de origen.
- Unión con webchat/whatsapp/voz/prospección para embudo multicanal.
- Nuevo backend de métricas para `mapa-de-conversion`.
- Actualización de frontend para mostrar métricas separadas y comparables.

### Nota de interpretación

La lectura operativa y de UX de la vista queda detallada en `plan_mapa_conversion_multicanal.md`.
Este documento mantiene la visión arquitectónica y de datos.

### No incluye (fase posterior)

- Integración nativa con GA4/Ads APIs.
- Modelos avanzados de atribución multi-touch (Markov, time-decay).
- Identidad cross-device probabilística.

## 4) Principios de diseño

- Separar claramente:
  - `sesión web` (tráfico),
  - `conversación` (interacción por canal),
  - `lead/oportunidad` (pipeline comercial).
- Evitar doble conteo (idempotencia por `session_id` y ventanas de tiempo).
- Mantener multi-tenant estricto (`organizacion_id` + RLS).
- Mantener retrocompatibilidad temporal con la vista actual durante migración.

## 5) Arquitectura objetivo

## 5.1 Nueva capa de datos web

Usar la entidad canónica de sesión web ya implementada para todo sitio:

- Tabla propuesta: `public.web_sessions`
  - `id uuid pk`
  - `organizacion_id uuid not null`
  - `session_id text not null` (cookie/app id)
  - `visitor_id text null` (opcional)
  - `first_seen_at timestamptz not null`
  - `last_seen_at timestamptz not null`
  - `visit_count int not null default 1`
  - `ip text null`
  - `user_agent text null`
  - `device_type text null`
  - `country_code text null`
  - `country_name text null`
  - `cve_ent text null`
  - `nom_ent text null`
  - `cve_mun text null`
  - `nom_mun text null`
  - `cvegeo text null`
  - `landing_url text null`
  - `referrer text null`
  - `referrer_host text null`
  - `utm_source text null`
  - `utm_medium text null`
  - `utm_campaign text null`
  - `utm_term text null`
  - `utm_content text null`
  - `eid uuid null` (envío prospección)
  - `cid uuid null` (campaña prospección)
  - `tid uuid null` (template prospección)
  - `source_class text null` (direct/google/organic_social/paid/referral/prospeccion/etc.)

Índices clave:

- `(organizacion_id, session_id)` unique.
- `(organizacion_id, last_seen_at desc)`.
- `(organizacion_id, source_class, last_seen_at desc)`.
- `(organizacion_id, utm_source, utm_medium, utm_campaign)`.
- `(organizacion_id, cve_ent, cvegeo)`.

## 5.2 Relación con entidades existentes

- `webchat_visitantes` se mantiene como fuente especializada de widget.
- `web_sessions` es la fuente principal para tráfico web general.
- Resolver vinculación:
  - `web_sessions.session_id` <-> `webchat_visitantes.session_id` (cuando exista).
  - `web_sessions` <-> `contactos/conversaciones` mediante identificadores y relaciones explícitas; no usar metadata para relaciones nuevas.

## 5.3 Capa agregada para mapa

Reutilizar la función v2 ya implementada:

- `panel_visitantes_geo_resumen_v2(...)`

Debe devolver, por ubicación:

- `sesiones_web_total`
- `sesiones_webchat_total`
- `sesiones_con_chat_webchat`
- `sesiones_sin_chat_webchat`
- `conversaciones_whatsapp`
- `conversaciones_voz`
- `fuentes_top` (agregado en la respuesta de la API; no es una columna JSON nueva)
- `utm_top` (agregado en la respuesta de la API; no es una columna JSON nueva)

Y separar explícitamente métricas web vs conversación.

## 6) Instrumentación (captura de datos)

## 6.1 Frontend sitio (`talia.mx`)

Agregar script ligero first-party (independiente del widget):

- Endpoint vigente: `POST /api/crm/web/visit`.
- Payload mínimo:
  - `session_id`
  - `location_href`
  - `referrer`
  - `user_agent/device/timezone`
  - `public_site_id` para instalaciones nuevas; el alias queda reservado para Webchat.
- Enviar en:
  - page load,
  - cambios de ruta (SPA),
  - heartbeat opcional (cada N segundos activo).

## 6.2 Webchat

- Seguir enviando `/api/webchat/visit`.
- Mantener la compatibilidad con `web_sessions` sin crear una segunda tabla de sesiones.
- Si existe sesión web previa, reutilizar `session_id` para unir funnels.

## 6.3 WhatsApp y Voz

- No tratarlos como "visitas web".
- Mantenerlos como `conversaciones` y `eventos de contacto`.
- En mapa, exponerlos en sección separada de interacción por canal.

## 6.4 Prospección

- Generalizar atribución UTM:
  - incluir `email`, `whatsapp_media`, `whatsapp_cta`, y otros `utm_medium` definidos.
- Actualizar funciones de atribución para no depender solo de `utm_medium=email`.

## 7) Backend / API

## 7.1 Nuevos endpoints

- `POST /crm/web/visit` (ingesta segura tenant-aware).
- `GET /crm/demografia/mapa-v2`
- `GET /crm/demografia/resumen-v2`
- `GET /crm/demografia/mapa-v2/export/xlsx`

## 7.3 Exportación XLSX (requerimiento explícito)

La vista `mapa-de-conversion v2` debe permitir descargar reportes en Excel (`.xlsx`) respetando filtros activos.

Endpoint propuesto:

- `GET /crm/demografia/mapa-v2/export/xlsx`

Filtros que debe soportar (mismos de la vista):

- `nivel`
- `estado` (cuando aplique)
- `rango` / `desde` / `hasta`
- `canales`
- `source_class`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `etapas`

Estructura mínima del archivo:

- Hoja `Resumen`
  - KPIs globales (sesiones web, conversaciones por canal, leads, tasas de conversión).
- Hoja `Ubicaciones`
  - Dataset completo por ubicación (nivel seleccionado).
- Hoja `Fuentes`
  - Distribución por `source_class` y participación porcentual.
- Hoja `UTM`
  - Desglose por `utm_source/utm_medium/utm_campaign`.
- Hoja `Canales`
  - Métricas de `webchat/whatsapp/voz` separadas.
- Hoja `Leads_Conversion`
  - Etapas y tasas `sesión -> conversación -> lead -> ganado`.

Consideraciones técnicas:

- Generación en backend para evitar límites del navegador.
- Formato numérico y fechas en `es-MX`.
- Nombre de archivo con timestamp y nivel, por ejemplo:
  - `mapa_conversion_estado_2026-03-03_1430.xlsx`.
- Para datasets grandes, aplicar límite configurable y/o streaming.
- Incluir metadatos de filtros aplicados en la hoja `Resumen`.

## 7.2 Contrato de respuesta v2

El contrato canónico del mapa v2 queda separado en estos bloques:

- `traffic_web`
- `conversation_channels`
- `whatsapp_atribucion`
- `totales_leads`
- `totales_visitantes`

Regla de semantica:

- `traffic_web` = trafico de sitio.
- `conversation_channels` = conversaciones por canal.
- `whatsapp_atribucion` = atribucion de WhatsApp de prospeccion, no campañas de envio.
- `totales_leads` = etapas y conversiones comerciales.

Estructura base esperada:

```json
{
  "ok": true,
  "nivel": "estado",
  "dataset": [
    {
      "key": "09",
      "name": "Ciudad de México",
      "traffic_web": {
        "sesiones_web_total": 1200,
        "fuentes_top": [{"source":"google","total":420}]
      },
      "conversation_channels": {
        "sesiones_webchat_total": 300,
        "conversaciones_whatsapp": 110,
        "conversaciones_voz": 20,
        "conversaciones_correo": 14
      },
      "whatsapp_atribucion": {
        "top": [{"canal_publicitario":"meta","campana_publicitaria":"prospeccion","total":42}]
      },
      "totales_leads": {
        "total": 180,
        "abiertas": 125,
        "ganadas": 15,
        "perdidas": 8
      }
    }
  ]
}
```

Compatibilidad temporal:

- el backend puede seguir exponiendo alias legacy mientras el frontend migra;
- el contrato canónico debe leerse desde `whatsapp_atribucion` y `whatsapp_atribucion_total`.

## 8) Frontend `mapa-de-conversion` (v2)

## 8.1 Cambios funcionales

- Nuevo selector de dimensión:
  - `Tráfico web`
  - `Conversaciones`
  - `Leads`
- Nuevos filtros:
  - `source_class`
  - `utm_source`
  - `utm_medium`
  - `utm_campaign`
- Evitar mezclar en una sola cifra:
  - sesiones web vs conversaciones whatsapp/voz.

## 8.2 Tabla y detalle

Agregar columnas:

- `Sesiones web`
- `Top fuente`
- `Top campaña`
- `Webchat con chat`
- `WhatsApp conversaciones`
- `Voz conversaciones`
- `Leads totales`
- `Tasa sesión->lead`

## 9) SQL y migraciones

## 9.1 Migración 1 (base)

- Crear `web_sessions` + índices + triggers de normalización.
- RLS y políticas por `organizacion_id`.

## 9.2 Migración 2 (funciones)

- `panel_visitantes_geo_resumen_v2`.
- `prospeccion_envio_sesiones_utm_v2` (aceptar múltiples `utm_medium`).
- `prospeccion_campana_template_atribucion_v2`.

## 9.3 Migración 3 (compat)

- Mantener funciones actuales.
- Exponer banderas para activar v2 por tenant/feature flag.

## 10) Plan de ejecución por fases

### Fase 0 · Alineación (1-2 días)

- Confirmar definiciones de KPI con negocio.
- Congelar taxonomía de fuentes (`source_class`).

### Fase 1 · Datos web base (3-5 días)

- Crear tabla `web_sessions` y endpoint de ingesta.
- Instrumentar sitio para registrar sesiones first-party.

### Fase 2 · Atribución y unificación (3-5 días)

- Parseo UTM y clasificación de fuentes.
- Unión con webchat/prospección.

### Fase 3 · API demografía v2 (3-4 días)

- Implementar `resumen-v2` y `mapa-v2`.
- Pruebas de consistencia vs v1.

### Fase 4 · Frontend v2 (4-6 días)

- Controles/filtros nuevos.
- KPIs y tabla separando tráfico vs conversación.

### Fase 5 · QA y rollout (2-3 días)

- Validación con datos reales.
- Activación gradual por tenant.

## 11) Criterios de aceptación

- Se puede responder por período y ubicación:
  - visitas web por fuente,
  - conversaciones por canal,
  - leads y conversión.
- `google/referral/direct/utm` aparecen aunque no exista webchat.
- Prospección WhatsApp/Email suma sesiones atribuibles sin sesgo de medio.
- No hay doble conteo entre web y conversación en KPI principal.
- El usuario puede descargar `.xlsx` con el mismo corte filtrado que ve en pantalla.
- El `.xlsx` incluye al menos las hojas `Resumen`, `Ubicaciones`, `Fuentes`, `UTM`, `Canales` y `Leads_Conversion`.

## 12) Riesgos y mitigaciones

- Riesgo: bloqueadores de scripts/cookies.
  - Mitigación: fallback server-side con headers y sesión efímera.
- Riesgo: ruido de bots.
  - Mitigación: filtros por user-agent/IP reputation y umbrales de actividad.
- Riesgo: ruptura de reportes actuales.
  - Mitigación: mantener v1 en paralelo + feature flag v2.

## 13) Entregables

- Migraciones SQL v2 de mapa y atribución.
- Endpoints backend `demografia v2` + ingesta web.
- Frontend `mapa-de-conversion v2`.
- Documento de operación y glosario de KPIs.

## 14) Próximo paso recomendado

Implementar inmediatamente `Fase 0` + `Fase 1` (modelo `web_sessions` e ingesta first-party), porque es el prerequisito para medir todo el tráfico de `talia.mx` y no solo interacciones de chat.
