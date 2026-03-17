# Ejecución Fase 0: Baseline inicial

Fecha: 2026-03-17 (UTC)
Estado: Completado (baseline inicial)

## Fuente de datos

- Logs locales:
  - `logs/api.log`
  - `logs/request.log`
- Ventana usada:
  - muestra reciente disponible al momento de corte (no ventana fija de 24h completa).

## Señales operativas observadas

- Activaciones recientes de `high_demand.mode_activated` por `inbox_p95_high`:
  - 2026-03-17T18:07:35Z
  - 2026-03-17T18:19:44Z
  - 2026-03-17T18:27:52Z
  - 2026-03-17T18:31:58Z
  - 2026-03-17T18:38:37Z
  - 2026-03-17T18:48:35Z
  - 2026-03-17T18:57:17Z
  - 2026-03-17T19:38:30Z

## Baseline de latencia (muestra reciente)

### `/api/crm/inbox/threads` (n=115)

- min: 134.59 ms
- p50: 670.99 ms
- p95: 4377.33 ms
- max: 5629.69 ms
- promedio: 1121.33 ms

### `/api/crm/inbox/threads?enrich=true` (n=44)

- min: 134.59 ms
- p50: 243.72 ms
- p95: 2535.53 ms
- max: 3180.03 ms
- promedio: 638.43 ms

### `/api/crm/inbox/threads?enrich=false` (n=51)

- min: 146.34 ms
- p50: 772.94 ms
- p95: 1881.12 ms
- max: 2487.19 ms
- promedio: 773.96 ms

### `/api/crm/prospeccion/prospectos` (n=10)

- min: 767.35 ms
- p50: 2811.24 ms
- p95: 22677.24 ms
- max: 22677.24 ms
- promedio: 7082.42 ms

### `/api/crm/prospeccion/prospectos/queries` (n=4)

- min: 896.47 ms
- p50: 9688.60 ms
- p95: 9940.38 ms
- max: 9940.38 ms
- promedio: 7563.93 ms

## Diagnóstico corto del corte

- `inbox/threads` muestra mejora parcial, pero sigue con cola alta (p95 > 4s).
- `prospeccion/prospectos` y especialmente `prospeccion/prospectos/queries` siguen siendo cuello severo.
- Persisten activaciones de `high_demand_mode` vinculadas a inbox.

## Decisión de arranque (siguiente paso inmediato)

Iniciar Fase 1 con prioridad alta en:

1. Control de concurrencia y reducción de ráfagas frontend/backend en inbox.
2. Eliminación de consultas repetitivas y fan-out en prospección (`queries` y enriquecimientos por lote).
3. Preparación del BFF para inbox/prospección como siguiente hito estructural.

## Avance posterior (2026-03-17)

- Se implementó y aplicó en DB la migración:
  - `supabase/migrations/20280426_120000_prospeccion_query_daily_mv.sql`
- Resultado:
  - `public.prospeccion_query_daily_mv` creada y poblada.
  - RPCs de resumen (`prospeccion_queries_resumen`, `prospeccion_activities_resumen`) reemplazadas para leer desde MV.
  - RPC adicional `prospeccion_segmentos_resumen` creada.
- Verificación post-migración:
  - MV con datos: `mv_rows=256`, rango `2026-02-27` a `2026-03-17`.
  - Funciones presentes en catálogo de DB.
