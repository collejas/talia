# Plan integral de mejora de latencia (sin Redis)

Fecha: 2026-03-17 (UTC)
Estado: En curso

## Objetivo

Reducir latencia y picos de procesamiento en `inbox`, `prospeccion/prospectos` y vistas relacionadas, sin incorporar Redis por ahora, mediante una estrategia combinada de:

- `Realtime`
- `materialized views` + cache local
- `queries` optimizadas
- rediseño de flujo frontend/backend para bajar ráfagas y trabajo repetido

## Alcance

- Backend API de `inbox` y `prospeccion`.
- Consultas SQL/RPC y patrones de lectura intensivos.
- Frontend de `inbox`, `prospeccion/prospectos` y componentes que disparan múltiples requests.
- Flujo de notificación crítica a vendedor (resiliencia y auditoría).

## SLOs objetivo

- `GET /api/crm/inbox/threads`: p95 < 2000 ms, p99 < 3000 ms.
- `GET /api/crm/inbox/filter-options`: p95 < 1200 ms.
- `GET /api/crm/prospeccion/prospectos`: p95 < 3000 ms.
- `GET /api/crm/prospeccion/prospectos/queries`: p95 < 3000 ms.
- Activaciones de `high_demand_mode` por `inbox_p95_high`: tendencia a ~0 en carga normal.

## Estrategia base

1. `Realtime` para disminuir polling y recargas completas.
2. `materialized views` para lecturas de alto volumen y filtros frecuentes.
3. `queries`/RPC optimizadas para evitar scans y N+1.
4. Cache en memoria de backend (TTL corto) para catálogos/resultados repetitivos.

## Líneas de trabajo (sin Redis)

### 1) Backend BFF para Inbox/Prospección

- Crear endpoint agregador por pantalla (BFF) que entregue:
  - lista principal
  - contadores/KPIs
  - filtros
  - metadatos mínimos
- Reducir round-trips frontend->backend y fan-out backend->DB.

Criterio de éxito:
- Menos requests por carga de vista.
- Menor p95 en primer render de cada pantalla.

### 2) Paginación estricta + lazy loading real

- Limitar primera carga a bloque visible.
- Diferir enriquecimiento pesado hasta interacción (abrir hilo/ficha).
- Prevenir refetch completo en cambios menores.

Criterio de éxito:
- Menor tiempo de interacción inicial.
- Menor volumen de datos y CPU por request.

### 3) Precomputación por cron (1-5 min)

- Jobs para preparar:
  - KPIs y contadores de inbox/prospección
  - últimos estados por entidad
  - agregados de vistas de alta demanda
- Consumir tablas/resúmenes precalculados en panel.

Criterio de éxito:
- Reducción de consultas complejas en tiempo real.

### 4) Índices compuestos/parciales enfocados

- Revisar filtros y ordenamientos dominantes.
- Crear índices por patrón real:
  - `tenant_id`, `owner_id`, `status`, `updated_at`.
- Validar con `EXPLAIN ANALYZE` y métricas.

Criterio de éxito:
- Planes de ejecución estables y menor costo estimado/real.

### 5) Eliminar N+1 en backend

- Resolver enriquecimientos por lote (`IN (...)`) y joins controlados.
- Evitar consultas por registro en loops.

Criterio de éxito:
- Menor latencia proporcional al tamaño de página.

### 6) Cache en memoria del backend (TTL corto)

- Cachear catálogos y lecturas repetidas de alto tráfico.
- TTL diferenciado por recurso (20-120s) + límites por tamaño.
- Invalidez por eventos críticos cuando aplique.

Criterio de éxito:
- Mayor tasa de cache-hit y menor presión en DB.

### 7) Control de concurrencia y rate-limit interno

- Debounce/throttle en frontend para filtros/búsquedas.
- Limitar concurrencia y ráfagas por endpoint en backend.
- Evitar duplicación de requests simultáneas equivalentes.

Criterio de éxito:
- Menos burst de requests y caída de picos de CPU.

### 8) Cola de tareas para notificaciones críticas

- Desacoplar notificación al vendedor del request web.
- Worker con reintentos, idempotencia y auditoría de entregas.
- Regla funcional: notificación a vendedor SI o SI (con trazabilidad).

Criterio de éxito:
- Cero pérdida silenciosa de notificaciones críticas.

### 9) Circuit breaker de enriquecimientos

- En alta demanda, degradar pasos no críticos:
  - respuesta base rápida
  - enriquecimiento diferido
- Priorizar continuidad operativa sobre payload completo.

Criterio de éxito:
- Menos activación de modos de emergencia y mejor estabilidad.

### 10) SLOs y alertas por etapa

- Medir por etapa en endpoints críticos:
  - SQL base
  - enriquecimiento
  - serialización
- Alertas por p95/p99 por endpoint y por etapa.

Criterio de éxito:
- Identificación temprana del cuello exacto y MTTR menor.

## Diseño de materialized views (principio)

- Usar `materialized views` para datasets de lectura intensiva y baja criticidad de tiempo real.
- Refresco por cron (1-5 min) o por eventos clave.
- El frontend consume lectura rápida desde la MV.
- Filtros dinámicos siguen aplicándose, pero sobre una base ya preagregada/optimizada.

Regla práctica:
- Si una consulta pesa por joins/agregados repetitivos, mover ese costo al refresh de la MV.

## Realtime: cómo entra en la arquitectura

- Sustituir polling frecuente por suscripción de cambios.
- Disparar actualización incremental en frontend (no recarga total).
- Mantener fallback de refetch puntual para consistencia.

Resultado esperado:
- Menos requests repetitivas de lectura completa y menor presión constante sobre DB.

## Plan de ejecución por fases

### Fase 0 - Baseline (24h)

- Congelar métricas actuales:
  - p95/p99 por endpoint
  - activaciones de `high_demand_mode`
  - CPU app/DB
  - tasa de errores
- Definir dashboard comparativo antes/después.

### Fase 1 - Quick wins (2-4 días)

- Ajustes de queries optimizadas pendientes.
- Más control de concurrencia y debounce.
- Cache local adicional en backend donde falte.
- Instrumentación de etapas faltantes.

### Fase 2 - Estructural (4-8 días)

- Endpoint BFF por vista crítica.
- Implementar MVs prioritarias + refresh cron.
- Eliminar N+1 remanente.
- Paginación/lazy loading estrictos en frontend.

### Fase 3 - Realtime y resiliencia (3-6 días)

- Integrar Realtime en inbox/prospección para updates incrementales.
- Cola robusta de notificaciones a vendedor.
- Circuit breaker en enriquecimientos bajo carga.

### Fase 4 - Hardening (3-5 días)

- Afinar índices con evidencia `EXPLAIN ANALYZE`.
- Ajustar umbrales operativos sin maquillar problemas.
- Cierre con validación 7 días continuos.

## Priorización operativa

Prioridad Alta:
- BFF inbox/prospección
- notificación crítica con cola/reintentos
- N+1 + queries más costosas
- control de concurrencia frontend/backend

Prioridad Media:
- materialized views principales
- integración Realtime incremental
- circuit breaker de enriquecimientos

Prioridad Baja:
- optimizaciones finas adicionales por endpoint no crítico

## Riesgos y mitigaciones

- Riesgo: datos levemente desfasados por MV/cache.
  - Mitigación: refresh corto + invalidación por evento crítico.

- Riesgo: complejidad de operación con más componentes (cron/worker/realtime).
  - Mitigación: feature flags, rollout gradual, observabilidad por componente.

- Riesgo: regressión funcional en inbox/prospección.
  - Mitigación: pruebas de contrato, smoke tests por flujo de negocio y comparación de snapshots.

## Criterio de cierre del plan

Se considera completado cuando por 7 días consecutivos:

- Se cumplen SLOs definidos.
- No hay degradación percibida al abrir inbox/prospección en horario normal.
- No hay pérdidas de notificación crítica a vendedor.
- `high_demand_mode` deja de activarse recurrentemente por inbox.

## Avance registrado

- 2026-03-17:
  - Fase 0 iniciada y baseline inicial documentado en `04_ejecucion_fase0_baseline.md`.
  - Confirmada persistencia de picos en `prospeccion/prospectos` y `prospeccion/prospectos/queries`.
  - Confirmada recurrencia de activaciones `high_demand_mode` por `inbox_p95_high`.
  - Fase 1 iniciada (control de concurrencia inbox frontend):
    - `mergeThreadLists` ahora preserva campos enriquecidos (`sourceDetail`, labels de campaña/template/lote) para evitar que el polling base sobrescriba datos y re-dispare hidratación innecesaria.
    - Se agregó cooldown por hilo (`THREAD_ENRICHMENT_COOLDOWN_MS=30000`) para limitar llamadas repetitivas `enrich=true` en el hilo seleccionado.
    - Validación: `npx eslint src/components/inbox/split-view.tsx` ✅
  - Fase 1 extendida (control de concurrencia en `prospeccion/prospectos/queries`):
    - Backend: single-flight por `cache_key` en `/crm/prospeccion/prospectos/queries` para que requests concurrentes idénticas esperen el mismo cálculo en lugar de ejecutar múltiples `cache_miss`.
    - Frontend: deduplicación in-flight en `listProspectosQueryMetadata` para evitar doble fetch simultáneo con el mismo scope desde la misma sesión.
    - Frontend (prospección): cuando `queryFilters` está vacío, se evita el refetch redundante de actividades y se reutiliza baseline cargado en `loadQueryOptions`.
    - Validaciones:
      - `python3 -m py_compile backend/app/api/routes/crm.py` ✅
      - `npx eslint src/lib/prospeccion/prospectos-client.ts src/app/prospeccion/prospectos/page.client.tsx src/components/inbox/split-view.tsx` ✅
  - Fase 2 iniciada (materialized views para prospección):
    - Migración nueva: `20280426_120000_prospeccion_query_daily_mv.sql`
      - crea `public.prospeccion_query_daily_mv` (agregado diario por tenant/query/fuente/actividad/segmento),
      - reemplaza RPCs `prospeccion_queries_resumen` y `prospeccion_activities_resumen` para leer desde MV,
      - agrega RPC `prospeccion_segmentos_resumen`,
      - agrega función `prospeccion_query_daily_mv_refresh()`.
    - Backend repo (`list_prospecto_query_metadata`) actualizado para usar RPC rápida también sin `query_filters` (antes caía a scan pesado), con fallback legacy si falla.
    - Validaciones:
      - `python3 -m py_compile backend/app/repositories/crm.py backend/app/api/routes/crm.py` ✅
      - `npx eslint src/lib/prospeccion/prospectos-client.ts src/app/prospeccion/prospectos/page.client.tsx src/components/inbox/split-view.tsx` ✅
  - Ajuste adicional en cuello principal `prospeccion/prospectos`:
    - Optimizada rama `con_envio=false` en backend para evitar conteo exacto por chunks cuando el set excluido es grande (`>500` IDs).
    - En sets grandes se usa total aproximado y se prioriza entrega rápida de página (menos round-trips de conteo).
    - Se incrementó tamaño de página de escaneo interno para reducir llamadas en esa rama.
    - Validación: `python3 -m py_compile backend/app/repositories/crm.py` ✅
  - Inbox MV implementada:
    - Migración nueva: `20280426_130000_inbox_threads_snapshot_mv.sql`
      - crea `public.inbox_conversation_snapshot_mv` (snapshot por conversación con canal/source/batch/campana/preview/sort_key),
      - actualiza `panel_inbox_threads(...)` para leer metadata y preview desde MV,
      - crea `inbox_conversation_snapshot_mv_refresh()`.
    - Migración aplicada en DB y verificada:
      - MV con datos (`mv_rows=69`).
      - funciones `panel_inbox_threads(...)` e `inbox_conversation_snapshot_mv_refresh()` presentes.
    - Refresh automático sin `pg_cron`:
      - Se integró `InboxSnapshotRefreshRunner` en backend (intervalo 3 min).
      - Runner conectado en `app_lifespan` (startup/shutdown) para ejecutar `inbox_conversation_snapshot_mv_refresh()` periódicamente.
      - Validación: `python3 -m py_compile backend/app/repositories/crm.py backend/app/api/routes/crm.py backend/app/main.py` ✅
