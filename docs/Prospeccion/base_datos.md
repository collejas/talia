# Prospección · Base de datos

Referencia principal de esquema: `backups/postgres_20260227_012134/postgres_20260227_012134_schema.sql`
Validación complementaria: MCP Supabase (instancia actual).

## 1) Entidades principales

- `public.busquedas`
  - Define cada búsqueda ejecutada (fuente, query, geo, meta, total).
- `public.resultados`
  - Resultados crudos por búsqueda/fuente.
- `public.prospeccion_prospectos`
  - Prospectos seleccionados/guardados para proceso comercial.
- `public.prospeccion_prospectos_audit`
  - Auditoría de cambios en prospectos.
- `public.prospeccion_denue_jobs`
  - Seguimiento de jobs DENUE asíncronos.
- `public.prospeccion_contacto_batch`
  - Lotes de contacto/campaña.
- `public.prospeccion_contacto_envio`
  - Envíos individuales por canal y prospecto.
- `public.prospeccion_contactos_log`
  - Bitácora de eventos de contacto.
- `public.prospeccion_contacto_templates`
  - Plantillas por canal.
- `public.prospeccion_contacto_listas`
  - Listas/filtros guardados.
- `public.prospeccion_user_preferences`
  - Preferencias de UI por usuario para módulos de prospección.
- `public.prospeccion_contacto_suppressions`
  - Reglas de opt-out/suppressions por canal (correo/whatsapp/llamada/all).
- `public.prospeccion_whatsapp_atribucion_reglas`
  - Reglas por tenant para atribución de publicidad WhatsApp por frase (`exacta`/`contiene`/`regex`).
- `public.prospeccion_whatsapp_atribucion_eventos`
  - Evento inmutable de atribución por conversación (anti-duplicado por `organizacion_id + conversacion_id`).

## 2) Vistas y funciones clave

### Vistas
- `public.v_google_places_contactables`
- `public.v_denue_contactables`

### Funciones Google
- `google_resultados_map(...)`
- `google_resultados_bounds(...)`

### Funciones DENUE
- `denue_resultados_list(...)`
- `denue_resultados_map(...)`
- `denue_resultados_bounds(...)`
- `denue_resultados_actividades(...)`

### Funciones Prospección (métricas)
- `prospeccion_conversion_fuente()`
  - Agrega prospectos/contactados/convertidos por fuente (`google_places`, `denue`, `usuario`).
- `prospeccion_brevo_eventos_resumen()`
  - Agrega eventos Brevo (`delivered`, `opened`, `click`, `bounce`, etc.) a partir de `prospeccion_contactos_log`.
- `prospeccion_campana_template_atribucion(p_campana_id, p_limit)`
  - Agrega desempeño persistente por campaña/canal/plantilla (totales, entrega, respuesta, aperturas, clics, sesiones UTM, click/sesión).

Nota: en el backup ya existen variantes con `p_contact_match text default 'all'` para filtros de contacto tipo AND/OR en DENUE.

## 3) Índices importantes

- `busquedas_organizacion_idx`
- `idx_resultados_fuente_busqueda`
- `idx_resultados_fuente_org_busqueda`
- `prospeccion_prospectos_organizacion_idx`
- `prospeccion_prospectos_busqueda_idx`
- `prospeccion_contacto_batch_*`
- `prospeccion_contacto_envio_*`
- `prospeccion_contactos_log_*`

## 4) Seguridad (RLS)

RLS habilitado en tablas críticas de prospección, incluyendo:
- `busquedas`
- `resultados`
- `prospeccion_prospectos`
- `prospeccion_prospectos_audit`
- `prospeccion_contacto_batch`
- `prospeccion_contacto_envio`
- `prospeccion_contacto_templates`
- `prospeccion_contacto_listas`
- `prospeccion_contactos_log`
- `prospeccion_denue_jobs`
- `prospeccion_whatsapp_atribucion_reglas`
- `prospeccion_whatsapp_atribucion_eventos`

El patrón es multi-tenant por `organizacion_id` con políticas para `authenticated`.

## 5) Snapshot actual (MCP)

- `busquedas`: 167 totales (Google 158, DENUE 9).
- `resultados`: Google 61,533; DENUE 4,195.
- `prospeccion_prospectos`: Google 72; DENUE 13.

## 6) Hallazgos prácticos

- En DENUE, `estrato` viene poblado y debe usarse como “Tamaño”.
- Hay registros DENUE con `busqueda_query` técnico (p. ej. `Avanzada:area_act ...`), por lo que la UI debe resolver etiqueta amigable cuando sea posible.
- Emails DENUE pueden venir en mayúsculas (conviene normalizar en capa de presentación).
- Emails de prospectos deben normalizarse en persistencia (insert/update) para evitar inconsistencias en filtros y deduplicación.
