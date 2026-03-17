# Diagnóstico actual de latencia

Fecha: 2026-03-17 (UTC)
Alcance revisado: backend `inbox`, `prospeccion/prospectos`, `demografia/mapa` y `demografia/mapa-v2`.

## Resumen ejecutivo

Se confirmó que el principal cuello de botella actual está en `inbox`, y es el detonador directo del `high_demand_mode` por `inbox_p95_high`.

`prospeccion/prospectos` es el segundo foco por rutas con escaneo/fallback costoso.

`mapa`/`mapa-v2` hoy tienen latencia moderada (no dominante), pero `mapa-v2` tiene complejidad SQL alta y riesgo de degradación al crecer volumen.

## Evidencia de latencia por endpoint (request logs)

Ventana analizada: `logs/request.log` + `logs/request.log.1`.

- `GET /api/crm/inbox/threads`
  - count: 720
  - avg: 2202.56 ms
  - p50: 1777.72 ms
  - p95: 4773.62 ms
  - p99: 6212.35 ms
  - max: 12629.28 ms

- `GET /api/crm/inbox/filter-options`
  - count: 96
  - avg: 1701.36 ms
  - p95: 3270.59 ms
  - max: 6967.29 ms

- `GET /api/crm/prospeccion/prospectos`
  - count: 344
  - avg: 3059.31 ms
  - p95: 8074.56 ms
  - max: 17765.37 ms

- `GET /api/crm/prospeccion/prospectos/queries`
  - count: 173
  - avg: 3167.70 ms
  - p95: 9166.11 ms
  - max: 19226.84 ms

- `GET /api/crm/prospeccion/prospectos/contact-indicadores`
  - count: 957
  - avg: 700.62 ms
  - p95: 1846.66 ms
  - max: 4549.52 ms

- `GET /api/crm/demografia/mapa`
  - count: 18
  - avg: 1136.32 ms
  - p95: 1617.39 ms
  - max: 1701.39 ms

- `GET /api/crm/demografia/mapa-v2`
  - count: 124
  - avg: 946.02 ms
  - p95: 1677.24 ms
  - max: 5273.56 ms

## Evidencia de activación de high demand

En `logs/api.log` y `logs/api.log.1` se observa activación recurrente de modo alto por `inbox_p95_high`.

- Umbral configurado para inbox p95: 2400 ms.
- Se observaron snapshots con inbox p95 de 8591.96 ms, 7173.49 ms, 5818.78 ms, 4489.03 ms, etc.
- Consecuencia operativa observada: eventos `deferred_due_to_blast` en jobs no críticos/followups.

## Hallazgos por módulo

### 1) Inbox (principal)

Código relevante:
- `backend/app/api/routes/crm.py` (`/inbox/threads`, `/inbox/filter-options`).
- `backend/app/repositories/crm.py` (`inbox_threads` -> RPC `panel_inbox_threads`).

Hallazgos:
- `inbox/threads` hace fan-out posterior al RPC base para enriquecimiento (batches, campañas, templates, fallback por teléfono, atribución, contactos faltantes).
- `inbox/filter-options` vuelve a disparar una consulta de threads para obtener catálogos.
- Cache de threads muy corta: `INBOX_THREADS_CACHE_TTL_SECONDS = 4.0`.
- Históricamente la tasa de hit de cache de inbox es baja (~3% a ~5% en snapshots), por lo que se recalcula con frecuencia.

### 2) Prospección/prospectos (secundario alto)

Código relevante:
- `backend/app/repositories/crm.py` (`list_prospectos` y helpers).

Hallazgos:
- Existen rutas fallback con escaneo paginado para inclusión/exclusión/geo y conteo cuando falta `content-range`.
- Límite de escaneo llega hasta 200k filas en algunos paths, y 50k en auxiliares (`con_envio`, `con_scraper`).
- Patrones de filtros correlacionados con mayor latencia:
  - `con_envio=false`: avg ~3521 ms.
  - filtros `geo_estado` / `geo_municipio`: avg ~4816 ms.

### 3) Mapa de conversión (riesgo potencial)

Código relevante:
- `backend/app/services/demografia_service.py`.
- RPC `panel_visitantes_geo_resumen_v2`.

Hallazgos:
- `mapa-v2` hoy no domina la latencia global.
- La función SQL tiene complejidad alta (muchos CTE/joins/agregados).
- Incluye evaluación de chat en webchat mediante `EXISTS` sobre `mensajes` por `datos->>'session_id'`, posible punto caliente con mayor volumen.

## Conclusión

1. El problema prioritario es `inbox` (causa directa de `high_demand_mode`).
2. El segundo frente es `prospeccion/prospectos` por fallback scans y costos de conteo/auxiliares.
3. `mapa-v2` requiere blindaje preventivo para crecimiento, aunque no es hoy el cuello principal.
