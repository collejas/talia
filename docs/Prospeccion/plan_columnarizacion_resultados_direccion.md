# Prospección · Plan de columnarización y despiece de dirección

Última actualización: 2026-04-25.

## Objetivo

Bajar latencia de consulta en búsquedas, filtros y vistas de prospección moviendo al modelo columnar la mayor cantidad posible de datos que hoy siguen dependiendo de `jsonb` o de texto compacto.

El foco es doble:

- reducir lecturas sobre `raw` en `public.resultados`,
- desglosar la dirección DENUE para poder indexar y filtrar por partes.

## Contexto actual

Hoy el flujo ya guarda varias columnas calientes en `public.resultados`:

- `external_id`
- `name`
- `razon_social`
- `actividad`
- `estrato`
- `phone`
- `email`
- `website`
- `address`
- `lat`
- `lng`
- `rating`
- `reviews`
- `maps_url`
- `dedupe_key`
- `first_seen_at`
- `last_seen_at`
- `appearances_count`
- `archived_at`
- `retention_until`

Pero todavía quedan consultas que leen `raw`:

- DENUE usa `raw` como fallback de `Telefono`, `Correo_e`, `Sitio_internet`.
- Google Places usa `raw` para `primaryType`, `primaryTypeDisplayName`, `types`, `internationalPhoneNumber`, `nationalPhoneNumber`, `websiteUri` y `googleMapsUri`.
- `v_google_places_contactables` extrae `types` con `jsonb_array_elements_text(...)`.

## Decisión de diseño

La regla de oro será:

- columnas para todo lo consultado frecuentemente,
- `raw` sólo como respaldo histórico / forense,
- nada de `raw` en el camino caliente de listados o filtros si ya existe columna equivalente.

## Parte 1. Columnarización de Google

### Columnas sugeridas

- `google_primary_type text`
- `google_primary_type_display_name text`
- `google_types text[]`

### Columnas opcionales

Si se quiere máxima fidelidad de fuente:

- `google_international_phone_number text`
- `google_national_phone_number text`
- `google_website_uri text`
- `google_google_maps_uri text`

### Motivo

Google Places sigue siendo más heterogéneo que DENUE, pero los campos anteriores sí valen la pena porque hoy se recalculan desde `raw` en cada lectura.

## Parte 2. Despiece de dirección DENUE

### Columnas mínimas sugeridas

- `tipo_vialidad text`
- `nombre_vialidad text`
- `numero_exterior text`
- `numero_interior text`
- `colonia text`
- `codigo_postal text`
- `estado_cve text`
- `estado_nombre text`
- `municipio_cve text`
- `municipio_nombre text`
- `localidad_cve text`
- `localidad text`
- `cvegeo text`
- `address_full text`

### Columnas de precisión adicional

- `asentamiento text`
- `entre_calles text`
- `referencia text`

### Sobre lat/lng

`lat` y `lng` ya existen en `public.resultados` y en `prospeccion_prospectos`, así que no hace falta duplicarlos.

### Sobre `geo_code` y `direccion_formateada`

Para evitar redundancia, la propuesta es:

- usar `cvegeo` como código geográfico principal,
- usar `address_full` como texto completo de dirección.

Si más adelante se quiere un alias semántico, se puede agregar vista o columna derivada, pero no conviene duplicar el mismo dato físico sin necesidad.

## Parte 3. Ajustes en el cliente de escritura

### DENUE

`normalize_denue_place()` ya construye:

- `address`,
- `phone`,
- `email`,
- `website`,
- `actividad`,
- `estrato`,
- `lat`,
- `lng`,
- `maps_url`.

La migración debe aprovechar ese payload para poblar las nuevas columnas sin depender de `raw`.

### Google

`normalize_place_for_result()` ya entrega:

- `activity` / `primaryType`,
- `primaryTypeDisplayName`,
- `phone`,
- `website`,
- `address`,
- `lat`,
- `lng`,
- `rating`,
- `reviews`,
- `maps_url`.

La escritura debe agregar las nuevas columnas y dejar `raw` sólo como respaldo.

## Parte 4. Vistas y capas de lectura

### Objetivo de la reescritura

Eliminar el acceso a `raw` en:

- `v_denue_contactables`
- `v_google_places_contactables`
- `v_resultados_unificados`

### Regla

Las vistas deben leer primero de columnas físicas y usar `raw` únicamente durante la transición o como fallback excepcional.

### Impacto esperado

- menos CPU por fila,
- menos parseo JSON,
- menos costos al listar grandes páginas de resultados,
- mejor uso de índices B-tree.

## Parte 5. Índices recomendados

Índices candidatos una vez exista el esquema nuevo:

- `organizacion_id, fuente, external_id`
- `organizacion_id, fuente, dedupe_key`
- `organizacion_id, last_seen_at DESC`
- `organizacion_id, retention_until`
- `organizacion_id, actividad`
- `organizacion_id, estado_cve, municipio_cve`
- `organizacion_id, codigo_postal`
- `organizacion_id, google_primary_type`

## Parte 6. Fases de implementación

### Fase 1

- agregar columnas nuevas a `public.resultados`,
- poblarlas desde el cliente de escritura,
- mantener `raw` intacto.

### Fase 2

- backfill de resultados existentes,
- validar que los listados viejos siguen saliendo igual,
- medir tiempos antes/después.

### Fase 3

- reescribir vistas para no depender de `raw`,
- eliminar fallbacks innecesarios,
- dejar `raw` sólo como contingencia.

### Fase 4

- evaluar si algunas columnas se deben copiar también a `prospeccion_prospectos` para evitar recalcularlas en la capa comercial.

## Riesgos

- duplicar demasiadas columnas sin uso real puede inflar la fila sin ganar mucho;
- si se quita `raw` demasiado pronto, se corre el riesgo de romper compatibilidad;
- Google requiere más cuidado que DENUE porque su payload es menos uniforme;
- cualquier backfill grande debe hacerse por lotes.

## Criterio de aceptación

El refactor se considera cerrado cuando:

- los listados principales ya no necesitan abrir `raw` para leer teléfonos, web, tipos o dirección,
- la dirección DENUE queda consultable por columnas,
- las búsquedas y mapas mantienen el mismo comportamiento funcional,
- la latencia de lectura baja de forma medible.

## Estado actual

Pendiente de implementación.

Este plan complementa a:

- `plan_deduplicacion_retencion_resultados.md`
- `plan_deduplicacion_retencion_resultados_migracion_tecnica.md`

