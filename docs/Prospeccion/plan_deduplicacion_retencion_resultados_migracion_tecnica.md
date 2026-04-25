# Prospección · Plan técnico de migración para deduplicación y retención de resultados

Última actualización: 2026-04-25.

Este documento traduce el plan funcional de deduplicación y retención en una migración técnica por fases, tabla por tabla, con foco en:
- no perder prospectos actuales,
- evitar duplicados entre búsquedas,
- bajar el volumen de `public.resultados`,
- conservar trazabilidad suficiente para operación y auditoría.

Documento funcional de referencia:
- `plan_deduplicacion_retencion_resultados.md`

## 1) Objetivo técnico

Separar con claridad tres responsabilidades:

1. `public.busquedas`
   - historial de ejecuciones.
2. `public.resultados`
   - cache/histórico de resultados crudos con retención limitada.
3. `public.prospeccion_prospectos`
   - dato canónico comercial.

La migración debe garantizar que:
- un mismo negocio no se replique como prospecto por cada búsqueda,
- los prospectos ya existentes no se borren al depurar búsquedas,
- el dato crudo viejo pueda limpiarse sin afectar el pipeline comercial.

## 2) Estado actual que condiciona la migración

### Tablas y relaciones relevantes

- `public.busquedas`
  - fuente de cada corrida.
- `public.resultados`
  - se llena por búsqueda y conserva el raw.
- `public.prospeccion_prospectos`
  - tiene:
    - `busqueda_id` ya no debe tratarse como dependencia destructiva para la limpieza DENUE,
    - `resultado_id` con `ON DELETE SET NULL`,
    - unicidad por `resultado_id`,
    - y en la práctica una lógica de upsert por `organizacion_id + fuente + external_id` en el backend.

### Riesgo principal

La cascada destructiva ya fue corregida para la limpieza DENUE profunda. El riesgo restante es operativo: no volver a mezclar una purga de históricos con una ruta de escritura que reintroduzca duplicados.

## 3) Principios de migración

1. Primero se introduce compatibilidad.
2. Luego se migra el backfill.
3. Después se cambia el flujo de escritura.
4. Sólo al final se habilita la purga del histórico.

No se debe hacer un big-bang.

## 4) Diseño objetivo

### 4.1 `public.prospeccion_prospectos`

Rol:
- tabla canónica del negocio.

Cambios propuestos:
- volver `busqueda_id` opcional y sin cascada destructiva,
- conservar snapshot mínimo de origen en `metadata` o columnas planas,
- mantener unicidad global por:
  - `organizacion_id`,
  - `fuente`,
  - `external_id`,
- agregar un `dedupe_key` cuando `external_id` no sea confiable.

### 4.2 `public.resultados`

Rol:
- cache/histórico de resultados crudos.

Cambios propuestos:
- agregar:
  - `first_seen_at`,
  - `last_seen_at`,
  - `appearances_count`,
  - `prospecto_id` nullable,
  - `archived_at`,
  - `retention_until`,
- agregar índices de lectura y limpieza,
- dejar de tratarlo como almacenamiento permanente por defecto.

Estado actual:
- `first_seen_at`, `last_seen_at`, `appearances_count`, `archived_at` y `retention_until` ya están en uso para DENUE.
- `public.resultados` ya no se está tratando como almacenamiento permanente para DENUE.

### 4.3 Tabla puente de apariciones

Nuevo objeto sugerido:
- `public.prospeccion_resultado_apariciones`

Rol:
- registrar que un negocio apareció en una búsqueda sin duplicar el contenido completo.

Campos sugeridos:
- `id uuid`
- `organizacion_id uuid`
- `busqueda_id uuid`
- `resultado_id uuid nullable`
- `prospecto_id uuid nullable`
- `fuente public.fuente_resultado`
- `external_id text nullable`
- `dedupe_key text nullable`
- `first_seen_at timestamptz`
- `last_seen_at timestamptz`
- `appearances_count integer`
- `metadata jsonb`

Estado actual:
- la tabla puente ya existe y se está usando para DENUE.

## 5) Plan de migración tabla por tabla

### Fase 0. Preparación

Objetivo:
- medir,
- proteger,
- preparar índices.

Acciones:
- tomar snapshot de conteos reales en:
  - `busquedas`,
  - `resultados`,
  - `prospeccion_prospectos`,
  - `prospeccion_prospectos_audit`.
- identificar duplicados por:
  - `organizacion_id + fuente + external_id`,
  - claves derivadas sin `external_id`.
- revisar todos los flujos que borran búsquedas o resultados.

Archivos probables:
- `docs/Prospeccion/base_datos.md`
- `docs/TABLAS_SIN_ORGANIZACION.md`
- `backend/app/repositories/crm.py`
- `backend/app/api/routes/crm.py`

### Fase 1. Compatibilidad del modelo

#### 1. `public.prospeccion_prospectos`

Acciones:
- cambiar `busqueda_id` a nullable si se decide conservar prospectos sin origen vivo,
- reemplazar cascada destructiva por `ON DELETE SET NULL` o por FK no destructiva,
- introducir `dedupe_key` o una columna equivalente si hace falta dedupe fuerte.

#### 2. `public.resultados`

Acciones:
- agregar columnas de tracking:
  - `first_seen_at`,
  - `last_seen_at`,
  - `appearances_count`,
  - `prospecto_id`,
  - `archived_at`,
  - `retention_until`.
- agregar índice compuesto para limpieza por antigüedad.
- agregar índice por `organizacion_id + fuente + external_id`.

#### 3. Nueva tabla puente

Acciones:
- crear `public.prospeccion_resultado_apariciones`.
- agregar índices por:
  - `organizacion_id + busqueda_id`,
  - `organizacion_id + prospecto_id`,
  - `organizacion_id + fuente + external_id`.

### Fase 2. Backfill histórico

Objetivo:
- poblar el nuevo modelo sin cambiar el comportamiento visible.

Acciones:
- insertar apariciones históricas desde `public.resultados`,
- enlazar apariciones con prospectos ya existentes cuando haya match,
- rellenar `first_seen_at`, `last_seen_at` y `appearances_count`,
- marcar `prospecto_id` en resultados que ya tengan match canónico.

Estado actual:
- el backfill DENUE ya se ejecutó y el histórico sobrante fue depurado.
- no queda una gran tarea de backfill pendiente para DENUE; sólo podrían aparecer backfills adicionales si se decide reintroducir otra fuente o una nueva regla de identidad.

Reglas de backfill:
- si existe `external_id`, usarlo como match principal,
- si no existe, usar `dedupe_key`,
- si hay varios candidatos, preferir el que ya esté convertido a prospecto.

### Fase 3. Cambio de escritura

Objetivo:
- dejar de producir duplicados estructurales.

Acciones backend:
- modificar `upsert_resultados_lote` para:
  - detectar si el negocio ya existe en forma canónica,
  - reutilizar `prospeccion_prospectos` cuando corresponda,
  - actualizar la tabla puente de apariciones,
  - no generar una copia pesada innecesaria.
- modificar la conversión de resultados a prospectos para:
  - reutilizar prospecto existente si coincide identidad,
  - marcar relación de origen sin volver a insertar.

Estado actual:
- el backend ya escribe con identidad global para prospectos cuando existe `external_id`.
- si una búsqueda nueva vuelve a traer el mismo negocio, se actualiza el existente en vez de multiplicarlo.

Archivos probables:
- `backend/app/repositories/crm.py`
- `backend/app/api/routes/crm.py`
- `backend/app/services/denue_search_jobs.py`

### Fase 4. Retención y limpieza

Objetivo:
- bajar tamaño de `public.resultados` sin pérdida comercial.

Acciones:
- crear job de purga/archivo por antigüedad o por `retention_until`,
- limpiar primero sólo filas no referenciadas por el flujo comercial,
- mover `raw` a tabla fría o archive si se quiere retener completo.

Estado actual:
- la retención DENUE quedó en `5 días`.
- la purga automática DENUE ya está operativa.
- la limpieza profunda de búsquedas DENUE viejas ya se ejecutó y dejó la base sin residuos operativos de esas búsquedas.

Reglas:
- nunca purgar antes de confirmar que el prospecto fue promovido o preservado,
- no borrar por `busqueda_id` sin revisar dependencias,
- no confiar en `DELETE` simple mientras `busqueda_id` siga siendo una FK sensible.

### Fase 5. Optimización final

Objetivo:
- preparar el sistema para crecer sin degradación lineal.

Acciones:
- evaluar particionado de `public.resultados` por fecha,
- revisar si la tabla puente requiere materialización parcial,
- agregar vistas/resúmenes para listados frecuentes,
- revisar si `v_resultados_unificados` sigue siendo útil o conviene reemplazarla por una vista más ligera.

Estado actual:
- esta es la única fase que sigue realmente abierta como optimización futura.
- no es un bloqueante funcional; es una mejora de escalado si el volumen vuelve a crecer.

## 6) Migraciones SQL sugeridas

Orden sugerido:

1. `..._prospeccion_resultados_identity.sql`
   - columnas nuevas en `resultados`,
   - índices de dedupe,
   - tabla puente de apariciones.

2. `..._prospeccion_prospectos_dedupe_safe_fk.sql`
   - ajuste de `busqueda_id`,
   - cambio de FK destructiva,
   - índice o columna de identidad canónica.

3. `..._prospeccion_resultados_backfill.sql`
   - backfill de apariciones,
   - backfill de relaciones a prospectos.

4. `..._prospeccion_resultados_retention.sql`
   - función/job de purga,
   - marca de archivo,
   - índice de limpieza.

5. `..._prospeccion_resultados_cleanup.sql`
   - recorte histórico controlado cuando el modelo ya sea estable.

## 7) Reglas de deduplicación técnica

### Caso A: hay `external_id`

- dedupe por `organizacion_id + fuente + external_id`
- si ya existe el prospecto:
  - actualizar trazabilidad,
  - no crear otro prospecto.

### Caso B: no hay `external_id`

- construir `dedupe_key` con normalización.
- candidatos fuertes:
  - teléfono,
  - nombre + dirección,
  - nombre + municipio + actividad.

### Caso C: conflicto ambiguo

- no fusionar automáticamente.
- registrar candidato para revisión o dejarlo como nuevo hasta tener señal fuerte.

## 8) Validaciones obligatorias

1. Un prospecto convertido sigue existiendo después de borrar resultados viejos.
2. La misma empresa no se duplica entre búsquedas.
3. `public.resultados` baja de tamaño sin romper filtros, mapa ni listado.
4. La conversión a prospecto sigue siendo idempotente.
5. Las búsquedas históricas siguen visibles mientras su retención lo permita.
6. La limpieza profunda de búsquedas DENUE no deja residuos operativos en `prospeccion_*`.

## 9) Archivos impactados

### Backend
- `backend/app/repositories/crm.py`
- `backend/app/api/routes/crm.py`
- `backend/app/services/denue_search_jobs.py`
- `backend/app/services/denue.py` si se agrega dedupe/normalización auxiliar.

### Base de datos
- nuevas migraciones en `supabase/migrations/`
- opcionalmente funciones RPC de soporte para backfill y purga.

### Documentación
- `docs/Prospeccion/plan_deduplicacion_retencion_resultados.md`
- `docs/Prospeccion/base_datos.md`
- `docs/Prospeccion/CHANGELOG.md` cuando se empiece a implementar.

## 10) Criterio para pasar a ejecución

Se puede implementar cuando estén cerradas estas tres decisiones:

1. ¿`busqueda_id` en `prospeccion_prospectos` queda como histórico nullable o se elimina del modelo canónico?
2. ¿la llave de dedupe fuerte será sólo `external_id` o habrá fallback derivado obligatorio?
3. ¿`resultados` se purga por antigüedad fija o por transición a prospecto?

Cuando esas respuestas estén definidas, la migración puede partirse en PRs/migraciones pequeñas y seguras.
