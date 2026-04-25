# Prospección · Plan de deduplicación y retención de resultados

Última actualización: 2026-04-25.

## Objetivo

Reducir la carga de base de datos del módulo de prospección sin perder prospectos útiles.

Prioridades:
- conservar los prospectos actuales como dato canónico,
- evitar repetidos entre búsquedas,
- limitar el crecimiento de `public.resultados`,
- mantener trazabilidad suficiente para auditoría y operación,
- no romper los filtros, mapas ni el flujo de conversión a prospectos.

## Problema actual

El flujo vigente sigue este patrón:

1. Se ejecuta una búsqueda en DENUE o Google.
2. La app persiste el resultado crudo en `public.resultados`.
3. El usuario filtra lo encontrado.
4. Los seleccionados se convierten en `public.prospeccion_prospectos`.

Esto genera dos efectos:
- la misma empresa puede volver a guardarse en múltiples búsquedas,
- `resultados` crece mucho más rápido que `prospeccion_prospectos`.

Además, `public.v_resultados_unificados` sólo hace `JOIN` entre `resultados` y `busquedas`, así que el costo real está en el volumen de `resultados`, no en la vista.

## Estado real de avance

A fecha `2026-04-25` ya quedó aplicado lo esencial del plan:

- `public.resultados` ya deduplica por identidad de negocio cuando existe `external_id` estable.
- `public.prospeccion_resultado_apariciones` existe y registra apariciones por búsqueda.
- `public.resultados` quedó con retención DENUE de `5 días` y purga automática limitada a DENUE.
- Las búsquedas DENUE viejas más allá de `5 días` ya se purgaron con sus jobs y apariciones asociadas.
- Los prospectos DENUE desacoplados y su auditoría residual ya fueron eliminados.
- Lo único que sigue como trabajo pendiente del plan es la optimización final de rendimiento si el volumen vuelve a crecer.

## Estado actual del modelo

### Tablas principales
- `public.busquedas`
  - historial de búsquedas ejecutadas.
- `public.resultados`
  - resultados crudos por búsqueda/fuente.
- `public.prospeccion_prospectos`
  - prospectos seleccionados y usados en operación comercial.

### Riesgo importante

`public.prospeccion_prospectos.busqueda_id` ya no debe tratarse como una dependencia destructiva para limpieza. La limpieza profunda de DENUE ya se ejecutó con FKs ajustadas para no perder prospectos útiles.

## Principios de diseño

1. Un prospecto debe existir una sola vez por organización y fuente.
2. Una búsqueda debe registrar apariciones, no duplicar el negocio.
3. El dato crudo debe tener retención limitada.
4. La capa comercial debe depender de tablas canónicas, no del histórico bruto.
5. Cualquier limpieza debe ser reversible o al menos auditada.

## Propuesta de arquitectura

### 1) Tabla canónica de prospectos

Usar `public.prospeccion_prospectos` como la fuente de verdad comercial.

Regla base de unicidad:
- `organizacion_id + fuente + external_id`

Si no hay `external_id` estable, usar una clave derivada de normalización:
- nombre,
- teléfono,
- dirección,
- municipio,
- actividad.

### 2) Relación de apariciones por búsqueda

Agregar una tabla puente para representar que un prospecto apareció en una búsqueda sin volver a copiar el mismo registro completo.

Ejemplo de idea:
- `busqueda_id`
- `prospecto_id`
- `resultado_id` original si existe
- `fuente`
- `external_id`
- `first_seen_at`
- `last_seen_at`
- `appearances_count`

Esto permite:
- saber en qué búsquedas salió un negocio,
- contar recurrencia,
- evitar duplicar filas pesadas.

### 3) Resultados crudos como cache con retención

Convertir `public.resultados` en una tabla de cache/histórico con vida útil limitada.

Política sugerida:
- conservar crudo por 30, 60 o 90 días,
- o conservarlo sólo mientras no haya sido promovido a prospecto,
- o archivar el JSON pesado en una tabla fría/archivo.

### 4) Snapshot ligero por resultado

Mantener sólo columnas consultables frecuente en la tabla caliente:
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
- `creado_en`

Y mover el `raw` completo a:
- una tabla fría,
- una tabla de archivo,
- o almacenamiento externo si se quiere preservar trazabilidad completa.

Nota:
- para DENUE ya se dejó de usar el histórico bruto como almacenamiento permanente;
- el crudo viejo se purga por retención y la capa comercial queda en `prospeccion_prospectos`.

## Estrategia de deduplicación

### Dedupe fuerte

Si existe `external_id` estable:
- deduplicar por `organizacion_id + fuente + external_id`
- no crear un nuevo prospecto si ya existe uno igual
- actualizar `last_seen_at` o metadatos de la aparición

### Dedupe medio

Si no hay `external_id` confiable:
- comparar una llave derivada normalizada
- preferir coincidencias por teléfono y nombre
- usar dirección + municipio como desempate

### Regla de selección

Cuando dos filas compiten, la prioridad sugerida es:
1. la que ya fue convertida a prospecto,
2. la más completa,
3. la más reciente,
4. la que tenga teléfono/email válido,
5. la que tenga mejor score o rating si aplica.

## Retención propuesta

### `public.resultados`

Retención sugerida:
- 30 a 90 días, configurable por tenant o por sistema.

Estado actual:
- DENUE quedó fijado a `5 días`.
- Google Places no entra en la purga automática.

### `public.busquedas`

Retener más tiempo porque es liviana y sirve para auditoría.

### `public.prospeccion_prospectos`

Conservar permanentemente mientras el prospecto siga activo.

### `public.prospeccion_prospectos_audit`

Conservar según política de auditoría.
- si crece demasiado, mover a retención más larga o archive.

Estado actual:
- la auditoría de DENUE desacoplada ya fue depurada;
- el historial útil de prospectos activos permanece en la tabla de auditoría.

## Fases de implementación

### Fase 0. Diagnóstico

- medir tamaño real de:
  - `busquedas`,
  - `resultados`,
  - `prospeccion_prospectos`,
  - `prospeccion_prospectos_audit`,
  - tablas de contacto de prospección.
- identificar cuánto de `resultados` se repite entre búsquedas.
- cuantificar cuántos prospectos ya existen con el mismo `external_id`.

### Fase 1. Modelo canónico

- asegurar unicidad global por `organizacion_id + fuente + external_id`.
- ajustar el flujo de guardado para que el prospecto sea el destino final, no una copia secundaria.
- introducir tabla puente de apariciones si hace falta trazabilidad.

### Fase 2. Retención del crudo

- definir ventana de retención.
- crear job de limpieza/archivo.
- evitar borrar filas que todavía sean necesarias para conversión o auditoría.

### Fase 3. Limpieza histórica

- backfill de deduplicación en datos existentes.
- consolidar repetidos entre búsquedas.
- recortar `resultados` antiguos.

### Fase 4. Optimización estructural

- evaluar particionado de `resultados` por fecha si el volumen vuelve a crecer.
- mover consultas de lectura repetitivas a vistas materializadas o resúmenes sólo si la presión real reaparece.

### Fase 5. Cierre operativo

- documentar la política final de retención para auditoría de prospectos.
- revisar si hace falta dejar una vista/resumen ligero para métricas de históricos, sin reintroducir el raw como tabla caliente.

## Cambios técnicos sugeridos

### Base de datos

- crear llave única global para prospectos por fuente/external_id.
- crear tabla puente de apariciones.
- agregar campos tipo:
  - `first_seen_at`,
  - `last_seen_at`,
  - `appearances_count`,
  - `archived_at`,
  - `retention_until`.

### Backend

- hacer que el upsert de resultados identifique duplicados globales.
- al convertir resultados a prospectos, reutilizar el prospecto ya existente si la identidad coincide.
- agregar limpieza programada con logs claros.

### Frontend

- si un resultado ya existe como prospecto, mostrarlo como “ya guardado”.
- evitar que el usuario vuelva a convertir el mismo negocio varias veces sin aviso.

## Riesgos

- borrar búsquedas sin rediseñar FKs puede borrar prospectos válidos.
- deduplicar mal puede fusionar dos negocios distintos con datos parecidos.
- retención demasiado corta puede dificultar auditoría o re-procesamiento.
- retención demasiado larga no resuelve la presión de BD.
- purgar auditoría sin criterio puede eliminar trazabilidad útil de prospectos ya convertidos.

## Criterios de aceptación

1. El mismo negocio no crea más de un prospecto por organización y fuente.
2. Una búsqueda nueva no vuelve a duplicar prospectos ya existentes.
3. `public.resultados` deja de crecer sin límite.
4. Los prospectos actuales se conservan intactos.
5. El sistema sigue mostrando resultados, mapa y filtros correctamente.
6. La limpieza queda auditada y es operativamente segura.
7. La limpieza profunda de búsquedas DENUE viejas no deja residuos operativos.

## Orden recomendado

1. Documentar el contrato final del dato canónico.
2. Ajustar unicidad/dedupe global.
3. Introducir retención del dato crudo.
4. Recortar histórico antiguo.
5. Evaluar particionado o materialización si todavía hace falta.
