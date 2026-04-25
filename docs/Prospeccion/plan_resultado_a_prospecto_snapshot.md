# Prospección · Plan de snapshot comercial al convertir resultados en prospectos

Última actualización: 2026-04-25.

## Objetivo

Definir qué información debe quedar en `public.prospeccion_prospectos` cuando un resultado de búsqueda se convierte en prospecto, de forma que la tabla comercial sea rápida, usable y no dependa del `jsonb` crudo de `public.resultados`.

La idea es que la conversión no copie todo el payload, sino un **snapshot comercial optimizado**.

## Principio de diseño

- `public.resultados` conserva el detalle técnico, la trazabilidad y el `raw`.
- `public.prospeccion_prospectos` conserva el dato comercial útil para operar, filtrar y contactar.
- `public.prospeccion_resultado_apariciones` conserva el historial de apariciones por búsqueda.
- `public.prospeccion_prospectos_audit` conserva el historial de cambios del prospecto.

## Qué debe pasar cuando un resultado se vuelve prospecto

Cuando el usuario guarda un resultado como prospecto:

1. Se toma el resultado ya normalizado.
2. Se crea o actualiza el prospecto por identidad.
3. Se copian los campos calientes a `prospeccion_prospectos`.
4. Se mantiene el vínculo con el resultado original vía `resultado_id`.
5. La búsqueda original no debe ser una dependencia destructiva del prospecto.

## Campos que sí deben vivir en `prospeccion_prospectos`

### Identidad y presentación

- `organizacion_id`
- `fuente`
- `resultado_id`
- `busqueda_id` como referencia, no como dependencia destructiva
- `external_id`
- `dedupe_key`
- `display_name`
- `nombre_comercial`
- `razon_social`
- `name` si se usa como alias técnico

### Contacto

- `phone`
- `phone_e164`
- `phone_national`
- `carrier_name`
- `carrier_type`
- `email`
- `website`

### Ubicación y dirección

Para DENUE y, cuando aplique, para Google:

- `address`
- `address_full`
- `tipo_vialidad`
- `nombre_vialidad`
- `numero_exterior`
- `numero_interior`
- `colonia`
- `codigo_postal`
- `estado_cve`
- `estado_nombre`
- `municipio_cve`
- `municipio_nombre`
- `localidad_cve`
- `localidad`
- `cvegeo`
- `asentamiento`
- `entre_calles`
- `referencia`

### Geometría y métricas

- `lat`
- `lng`
- `distancia_m`
- `rating`

### Clasificación comercial

- `actividad`
- `estrato`
- `segmento`
- `lookup_status`
- `lookup_error`
- `whatsapp_permitido`
- `llamada_permitida`

### Trazabilidad mínima

- `first_seen_at`
- `last_seen_at`
- `appearances_count`
- `creado_en`
- `actualizado_en`

### Metadata útil

- `metadata` sólo para datos de bajo uso o extensibles
- no para lo que ya se consulta constantemente

## Qué debe quedarse en `public.resultados`

### Sí debe quedarse aquí

- `raw` completo
- campos técnicos de dedupe
- retención y archivo
- payload de origen
- metadatos de la búsqueda

### Sí debe quedar como respaldo, no como campo principal

- datos raros o variables del proveedor
- atributos que no se consultan frecuentemente
- campos de compatibilidad temporal durante la migración

## Separación de responsabilidades

### `public.resultados`

Debe funcionar como:

- cache/histórico de búsqueda,
- snapshot técnico,
- fuente de sincronización para prospectos,
- tabla con retención y purga controlada.

### `public.prospeccion_prospectos`

Debe funcionar como:

- tabla canónica comercial,
- lista operativa para UI y campañas,
- base de filtros y segmentación,
- tabla rápida, poco dependiente de `raw`.

## Reglas de actualización al re-guardar el mismo negocio

Si el mismo negocio vuelve a aparecer en otra búsqueda:

- no se crea un prospecto nuevo si ya existe uno por identidad,
- se actualiza el prospecto existente,
- `last_seen_at` y `appearances_count` deben incrementarse,
- la nueva aparición debe quedar en `prospeccion_resultado_apariciones`,
- el snapshot comercial puede refrescarse si vienen campos nuevos o más completos.

## Campo de nombre

### Recomendación

Usar tres conceptos:

- `nombre_comercial`: nombre visible del negocio,
- `razon_social`: nombre legal/fiscal,
- `display_name`: campo de presentación por defecto en UI.

### Regla

- `display_name` puede derivarse de `nombre_comercial` o `name`,
- `razon_social` debe conservarse cuando exista,
- `nombre_comercial` debe quedar explícito para no perder el nombre visible.

## Dirección desglosada

La dirección debe guardarse descompuesta en prospectos porque ahí es donde más se filtra y contacta.

### Beneficios

- buscar por colonia, CP, municipio o estado sin leer `raw`,
- segmentar campañas por zonas,
- indexar mejor,
- reducir latencia de listados.

### Canon sugerido

- `address_full` como dirección completa visible,
- columnas desglosadas para filtros y segmentación,
- `address` como compatibilidad si ya existe en UI o APIs.

## Diferencias por fuente

### DENUE

DENUE sí merece el despiece más completo porque el payload viene estructurado y homogéneo.

### Google Places

Google debe materializar al menos:

- `google_primary_type`
- `google_primary_type_display_name`
- `google_types`

Y conservar `raw` para fallback de atributos menos estables.

## Flujo propuesto de escritura

1. El job de búsqueda recibe resultados normalizados.
2. `upsert_resultados_lote` guarda o actualiza `public.resultados`.
3. Al convertir a prospecto, el backend toma el resultado ya normalizado.
4. `public.prospeccion_prospectos` recibe el snapshot comercial.
5. La relación con el resultado y la aparición queda registrada.

## Fases de implementación

### Fase 1

- agregar columnas calientes a `public.prospeccion_prospectos`,
- asegurar que el write path las rellene,
- mantener compatibilidad con lo que ya existe.

### Fase 2

- backfill de prospectos existentes,
- verificar que las vistas siguen iguales,
- medir latencia antes y después.

### Fase 3

- reescribir vistas y listados para que lean columnas y no `raw`,
- retirar fallbacks que ya no sean necesarios.

### Fase 4

- decidir si algunas columnas de dirección y nombre deben sincronizarse también a auditoría o resúmenes.

## Riesgos

- duplicar campos innecesariamente puede inflar filas,
- mover demasiado rápido puede romper compatibilidad,
- Google puede requerir más fallback temporal que DENUE,
- el backfill debe hacerse por lotes.

## Criterio de aceptación

El plan se considera cerrado cuando:

- guardar un resultado como prospecto no duplica registros,
- el prospecto queda listo para operar sin leer `raw`,
- la dirección se puede filtrar por partes,
- el nombre comercial y la razón social quedan separados,
- la UI de prospectos sigue funcionando con menos latencia.

## Estado actual

Pendiente de implementación.

Este plan complementa a:

- `plan_deduplicacion_retencion_resultados.md`
- `plan_deduplicacion_retencion_resultados_migracion_tecnica.md`
- `plan_columnarizacion_resultados_direccion.md`

