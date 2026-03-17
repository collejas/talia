# Plan de mejora de latencia

Fecha: 2026-03-17 (UTC)
Estado: Propuesto

## Avance registrado (2026-03-17)

Estado general: **Fase 1 implementada + Fase 2 iniciada (prospección)**.

### Cambios ya implementados

- `inbox/threads`
  - TTL de cache incrementado de `4s` a `20s`.
  - Evicción por tamaño en cache (`max entries`) para controlar memoria.
  - Instrumentación por etapas agregada en backend con log:
    - `crm.inbox.threads.stage_profile`
  - Se registran tiempos de:
    - cache lookup
    - RPC base de threads
    - scan de filas
    - fallback WhatsApp por teléfono
    - catálogos (batch/campaña/template)
    - atribución
    - fallback de contactos
    - enriquecimiento
    - validación de modelo
    - cache write
    - total

- `inbox/filter-options`
  - Cache nueva implementada con TTL `45s`.
  - Evicción por tamaño (`max entries`).
  - Log de cache hit agregado:
    - `crm.inbox.filter_options.cache_hit`

- Catálogos de inbox (backend)
  - Cache adicional para catálogos repetitivos (TTL `60s`):
    - campañas
    - templates de contacto
    - reglas de atribución WhatsApp
  - Objetivo: reducir round-trips repetidos a Supabase por polling.

- `inbox/threads` modo base rápido
  - Se agregó query param `enrich` (default `true`).
  - Con `enrich=false`, el endpoint omite enriquecimiento pesado y responde lista base más rápida.
  - Restricción actual: para `source=publicidad_whatsapp` se requiere `enrich=true`.
  - Log nuevo para este modo:
    - `crm.inbox.threads.base_only`
  - Frontend inbox actualizado para polling/load-more en modo base:
    - `GET /api/inbox/threads?...&enrich=false`
  - Frontend agrega hidratación bajo demanda para hilo seleccionado:
    - solicita página puntual con `enrich=true` y fusiona datos enriquecidos.

### Verificación técnica

- Validación sintáctica ejecutada:
  - `python3 -m py_compile backend/app/api/routes/crm.py` ✅
- Validación frontend ejecutada:
  - `npx eslint src/lib/prospeccion/prospectos-client.ts src/app/prospeccion/prospectos/page.client.tsx` ✅
- Métricas de inbox disponibles con percentiles por etapa:
  - `GET /api/crm/inbox/threads/metrics` ahora incluye `stage_latency_ms`.

### Avance adicional (2026-03-17) - Fase 2.3 Prospección

- `GET /api/crm/prospeccion/prospectos`
  - Nuevo flag `include_scraper_status` en query backend (default `false`).
  - El endpoint ya no ejecuta `list_scraper_status_by_prospectos` salvo que el cliente lo pida explícitamente.
  - Se conserva contrato de salida con campos:
    - `scraper_ejecutado`
    - `scraper_ultimo_en`
    - `scraper_ultimo_estado`
  - En modo default (`false`) esos campos salen en valores vacíos/falsos sin costo extra de consulta.

- Frontend prospección
  - Cliente `listProspectos` soporta `includeScraperStatus`.
  - Página de prospectos envía `includeScraperStatus: false` en carga inicial y paginación incremental.
  - Objetivo: recortar latencia de la lista principal y carga de CPU/DB en picos.

### Avance adicional (2026-03-17) - Fase 2.2 Prospección

- Repositorio `list_prospectos` (backend)
  - Se implementó pushdown de filtros geo (`geo_estado`, `geo_municipio`) a PostgREST:
    - condiciones por códigos (`estado_cve`, `cve_ent`, `municipio_cve`, `cve_mun`)
    - condiciones por nombre sobre metadata y `address` con `ilike`
  - El flujo evita entrar al `geo scan` Python en el caso normal.
  - En ramas de include/exclude por IDs, cuando geo ya fue empujado a SQL se desactiva doble filtrado en Python.
  - El fallback `geo scan` se conserva solo si no se logra construir filtros geo SQL.
  - Fallback de totalizador optimizado:
    - si falta `content-range`, primero intenta `count=exact` ligero (`HEAD`/`GET` con `limit=1`)
    - solo si falla, mantiene escaneo paginado como último recurso.
  - Include/exclude por IDs optimizado:
    - `include_ids > 400`: ahora consulta por chunks de IDs (`id in (...)`) y ordena en backend, evitando scan completo de tabla.
    - `exclude_ids` pequeño: usa `id=not.in(...)` directo con `count=exact`, evitando scan backend.

- Impacto esperado
  - Menos loops paginados backend sobre `prospeccion_prospectos`.
  - Menor CPU en app y menor presión general en picos de tráfico.

### Pendiente para cerrar Fase 1 al 100%

- Medir 24h de resultados post-cambio y comparar:
  - `inbox/threads` p95/p99 antes vs después.
  - `inbox/filter-options` p95 antes vs después.
  - frecuencia de `high_demand_mode` por `inbox_p95_high`.

## Objetivos

- Sacar `inbox` del estado de alerta recurrente de `high_demand_mode`.
- Reducir p95/p99 de `prospeccion/prospectos` y evitar scans costosos.
- Blindar `mapa-v2` para crecimiento sin afectar rendimiento general.

## Metas (SLO interno propuesto)

- `GET /api/crm/inbox/threads`: p95 < 2000 ms, p99 < 3000 ms.
- `GET /api/crm/inbox/filter-options`: p95 < 1200 ms.
- `GET /api/crm/prospeccion/prospectos`: p95 < 3500 ms.
- `GET /api/crm/prospeccion/prospectos/queries`: p95 < 3500 ms.
- Reducir activaciones `high_demand_mode` por `inbox_p95_high` al mínimo operativo.

## Fase 1 (impacto inmediato: 1-3 días)

### 1. Inbox cache y carga

- Subir `INBOX_THREADS_CACHE_TTL_SECONDS` de 4s a 15-30s.
- Implementar cache dedicada para `inbox/filter-options` (TTL inicial 30-60s).
- Reducir payload por defecto cuando sea posible (`message_limit` conservador en lista).

Estado: **En progreso (2/3)**  
Completado: TTL inbox + cache filter-options.  
Pendiente: ajuste de payload por defecto según validación UI.

Resultado esperado:
- Menos recalculo repetido por polling.
- Caída rápida de p95 en `inbox/threads` y `filter-options`.

### 2. Instrumentación mínima obligatoria

- Medir por etapa en `inbox/threads`:
  - tiempo RPC base.
  - tiempo de fallback teléfono/envío.
  - tiempo de resolución batch/campaña/template.
  - tiempo de atribución.
  - tiempo de fetch de contactos faltantes.
- Registrar percentiles por etapa en ventana de 5 minutos.

Estado: **En progreso (1/2)**  
Completado: timings por etapa en `get_inbox_threads` + consolidación de percentiles en métricas.  
Pendiente: validar operación 24h y revisar calidad de señales por etapa.

Resultado esperado:
- Aislar el subcomponente más caro para fase 2.

### 3. Contención operativa de high demand

- Mantener el umbral actual (`HIGH_DEMAND_INBOX_P95_ALERT_MS`) sin subirlo al inicio.
- Ajustar solo después de ver mejora real de inbox.

Estado: **Pendiente de evaluación**  
No se cambió umbral en esta iteración (correcto para no enmascarar problema).

Resultado esperado:
- Evitar enmascarar el problema subiendo el threshold sin arreglar causa.

## Fase 2 (optimización estructural: 3-7 días)

### 1. Inbox: dividir enriquecimiento

- Separar enriquecimiento pesado de `inbox/threads` en un endpoint lazy por conversación o lote visible.
- Dejar `threads` como lista rápida base y cargar metadatos extras bajo demanda.

Resultado esperado:
- Reducir latencia de lista principal y estabilizar p95.

### 2. Prospección: eliminar fallback scans en backend

- Migrar filtros complejos a RPC SQL dedicadas:
  - `con_envio` / `campana_id`.
  - `con_scraper`.
  - geo (`estado/municipio`).
  - conteo total consistente sin scan en Python.
- Evitar `count=exact` en consultas exploratorias si no es indispensable.

Resultado esperado:
- Reducción fuerte de colas de requests de 8-19s.

### 3. Prospección: optimizar status scraper

- Hacer `scraper_status` opcional (`include_scraper_status=false` por default) o resolverlo en batch más eficiente.

Resultado esperado:
- Menor sobrecosto por request de listado.

## Fase 3 (hardening y escalamiento: 1-2 semanas)

### 1. `mapa-v2` preventivo

- Cachear respuesta de mapa por combinación de filtros/rango (TTL 30-60s).
- Revisar optimización SQL de tramo `webchat_visits`/`EXISTS` sobre `mensajes` por `session_id` en JSON.
- Evaluar preagregado/materialización para métricas de mapa.

### 2. Optimización SQL guiada por `EXPLAIN ANALYZE`

- Correr `EXPLAIN (ANALYZE, BUFFERS)` sobre RPC críticas:
  - `panel_inbox_threads`
  - `panel_visitantes_geo_resumen_v2`
  - futuras RPC de prospección
- Ajustar índices/plan de ejecución en base a evidencia.

## Riesgos y mitigaciones

- Riesgo: cache más larga muestra datos con retraso.
  - Mitigación: invalidación por eventos críticos (nuevo mensaje, cambio de estado/asignación).

- Riesgo: refactor de enriquecimiento rompe campos esperados por UI.
  - Mitigación: contrato de respuesta versionado y rollout por feature flag.

- Riesgo: cambios SQL alteran resultados funcionales.
  - Mitigación: pruebas de regresión con snapshots funcionales por endpoint.

## Plan de implementación sugerido (orden)

1. Fase 1.1 + 1.2 (cache + métricas de etapa inbox).
2. Validar 24h de métricas y comparar p95/p99.
3. Fase 2.1 (split de enriquecimiento inbox).
4. Fase 2.2 + 2.3 (RPC prospección y reducción scans).
5. Fase 3 (mapa-v2 hardening y tuning SQL fino).

## Criterio de cierre

Se considera mejora exitosa cuando, durante 7 días consecutivos:

- `inbox/threads` p95 se mantiene bajo 2000 ms.
- `prospeccion/prospectos` p95 se mantiene bajo 3500 ms.
- No hay activación recurrente de `high_demand_mode` por `inbox_p95_high` en periodos sin carga extraordinaria.
