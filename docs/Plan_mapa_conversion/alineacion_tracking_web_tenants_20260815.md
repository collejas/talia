# Alineación documental · Tracking web multi-tenant y Mapa de Conversión

Fecha: 2026-08-15  
Ruta: `docs/Plan_mapa_conversion/alineacion_tracking_web_tenants_20260815.md`

Documentos relacionados:

- `docs/Crear_webchat_tenants/plan_tracking_web_tenants.md`
- `docs/Crear_webchat_tenants/crear_webchat.md`

## Propósito

Alinear la documentación histórica y operativa de `mapa-de-conversion` con el plan nuevo de tracking de sitios web por tenant.

La fuente canónica de sesiones web continúa siendo `public.web_sessions`. El plan nuevo define la instalación multi-tenant, los dominios autorizados y los eventos adicionales; no crea un mapa, una taxonomía de UTM ni una fuente de métricas paralela.

## Diez correcciones aplicadas

### 1. `web_sessions` deja de documentarse como tabla futura

`public.web_sessions` ya existe y es la fuente canónica de sesiones web, UTM, referrer, geografía y atribución de `cid`, `tid` y `eid`.

La migración vigente es:

`supabase/migrations/20260303_120000_web_sessions_base.sql`

### 2. Se corrige la ruta real de ingesta

La ruta completa es:

`POST /api/crm/web/visit`

La documentación anterior decía `POST /api/web/visit`.

### 3. Se integra el nuevo plan de tracking

El plan detallado de instalación queda en:

`docs/Crear_webchat_tenants/plan_tracking_web_tenants.md`

Ese documento define `public_site_id`, dominios autorizados, snippet universal, CORS, consentimiento, rate limiting, tablas nuevas y eventos detallados opcionales.

### 4. El alias de Webchat deja de ser identidad de tracking

El alias de Webchat seguirá resolviendo Webchat, pero no será el identificador principal del tracking externo.

La instalación web utilizará `public_site_id` y el dominio verificado del tenant.

### 5. Se elimina `metadata/json/jsonb` del diseño nuevo

Ninguna tabla nueva de tracking o mapa podrá utilizar `metadata`, `json`, `jsonb`, `payload`, `config`, `settings` o equivalentes para esconder datos estructurales.

La columna histórica `web_sessions.metadata` se conserva solamente por compatibilidad. No se utilizará para agregar nuevos campos.

### 6. Se corrige la relación con contactos y conversaciones

La vinculación no se documentará como dependencia de `metadata`.

Las relaciones nuevas deben usar foreign keys, `persona_id`, `contacto_id` cuando corresponda, `conversacion_id`, `oportunidad_id` y tablas de relación explícitas.

### 7. Se marca `referrer_host` como implementado

`web_sessions.referrer_host` ya existe y el endpoint de detalle ya lo expone.

El changelog confirma que se excluyen referencias internas y se muestran hosts externos reales. Deja de ser un hueco pendiente del plan de adquisición.

### 8. Se separan las fuentes por semántica

La documentación queda alineada así:

- tráfico web y UTM: `web_sessions`;
- correo: `prospeccion_contacto_envio`, `cid`, `tid`, `eid`;
- WhatsApp de prospección: lotes, `mensajes`, `eventos_entrega`, conversaciones y oportunidades;
- CTA de WhatsApp: `prospeccion_whatsapp_atribucion_eventos`;
- conversiones: personas, conversaciones y oportunidades.

`prospeccion/metricas` mide ejecución de campañas. `mapa-de-conversion` mide adquisición, atribución y conversión.

### 9. Se conserva la separación de lecturas del mapa

Las lecturas vigentes son `Resumen`, `Tráfico web`, `Conversaciones` y `Campañas`.

No se debe volver a presentar `Mapa y embudo` como una lectura mezclada. Cada lectura mantiene filtros, métricas y fuentes de verdad propios.

### 10. Se evita duplicar instrumentación y agregados

El nuevo script debe alimentar el flujo existente:

```text
talia-tracking.js
  -> /api/crm/web/visit o endpoint de tracking compatible
  -> web_sessions
  -> resumen-v2 / mapa-v2 / web-sessions
  -> mapa-de-conversion
```

Solo se creará `web_tracking_events` si se necesita conservar historial página por página. No se creará otra tabla de sesiones ni otro agregado paralelo de UTM.

## Fuente de verdad documental

- Arquitectura y métricas: `plan_mapa_conversion_integral.md`.
- UX y separación de lecturas: `plan_reorganizacion_lectura_mapa.md` y `plan_mapa_conversion_multicanal.md`.
- Campañas: `plan_metrica_campanas_whatsapp_y_mapa_conversion.md` e `informe_metricas_whatsapp_prospeccion.md`.
- Tracking por tenant: `docs/Crear_webchat_tenants/plan_tracking_web_tenants.md`.
- Ejecución: `backlog_maestro_mapa_conversion.md`.
- Historial: `changelog_maestro_mapa_conversion.md`.

## Criterio obligatorio para nuevas migraciones

Antes de crear cualquier migración relacionada con esta funcionalidad se debe verificar:

- cada dato consultable tiene columna explícita;
- cada relación tiene foreign key real;
- cada filtro frecuente tiene índice justificado;
- existe RLS por `organizacion_id`;
- no se agregó ninguna columna JSON ni equivalente;
- se validó el plan de consulta con datos representativos;
- se actualizó este plan o el changelog maestro.

