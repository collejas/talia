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
    - `exclude_ids` grande: usa conteo exacto base + conteo por chunks de excluidos y paginación incremental filtrada, evitando scan total para calcular `total`.
- `con_envio` / `con_scraper` optimizado:
  - cache in-memory corta (TTL 30s) para sets de `prospecto_id` por usuario (y campaña en `con_envio`).
  - scans de IDs en tablas de envíos/jobs ya no fuerzan `order` (lectura más ligera).
  - Observabilidad integrada:
    - nuevas métricas in-memory de proceso para:
      - `prospeccion.prospectos.list`
      - `prospeccion.prospectos.queries`
    - expuestas en el mismo endpoint owner: `/crm/inbox/threads/metrics` bajo `process_metrics`.
    - visibles en la misma vista: `settings/inbox-metrics` (estado actual + histórico de snapshots).
    - mini-gráfica agregada para histórico de `prospeccion.prospectos.list` p95 (últimos 24 snapshots).

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

### Avance adicional (2026-08-06) - Demografía mapa de conversión

- Se confirmó en `logs/api.log` que `demografia.resumen_v2` estaba tardando entre `4.5 s` y `13.1 s` en cache miss.
- El principal costo estaba concentrado en `catalogs_ms` (`3.1 s` a `9.6 s`), porque campañas, plantillas, lotes, conversiones y reglas se consultaban en cadena.
- Se cambiaron esas consultas independientes a ejecución concurrente con `asyncio.gather`, conservando el mismo contrato de respuesta.
- El mapa conserva su cache y `skip_visitantes=true`; queda pendiente medir después del despliegue el costo de `geojson_ms` y `whatsapp_locations_ms` en cache miss.

### Diagnóstico Supabase confirmado y siguiente acción (2026-08-11)

La revisión directa de Supabase confirmó que la función geográfica no es el cuello principal:

- `panel_visitantes_geo_resumen_v2`: aproximadamente `146 ms` en ejecución directa.
- `prospeccion_campana_template_atribucion_rango`: media histórica aproximada de `3.1 s`, máximo de `7.9 s` y errores `57014` por timeout.
- Ejecución directa de atribución: `1.84 s`, con `421,727` buffers compartidos y uso de temporal.
- Volumen del tenant principal: `16,801` envíos y `52,769` logs de prospección.

La función de atribución procesa dos veces `prospeccion_contactos_log` y realiza agregaciones amplias antes de aplicar el resultado final. Esto explica los `6.4–6.7 s` de `resumen-v2` y los `502` observados en producción.

#### Decisión recomendada

Priorizar la separación de la atribución del camino crítico de `resumen-v2`:

1. Servir inicialmente mapa, KPIs y datos geográficos sin esperar rankings de campaña/plantilla.
2. Resolver rankings desde caché breve o mediante carga diferida.
3. Reescribir la RPC para filtrar primero envíos por tenant/rango y reutilizar una única relación de logs.
4. Validar un índice parcial `(organizacion_id, envio_id) WHERE envio_id IS NOT NULL` en `prospeccion_contactos_log` con `EXPLAIN (ANALYZE, BUFFERS)`.
5. Evaluar una vista materializada diaria si el volumen continúa creciendo.

Estado: **Diagnóstico confirmado; implementación pendiente.** No se aplicaron migraciones en esta revisión.

### Avance de la primera acción (2026-08-11)

Implementado localmente y listo para deploy:

- La atribución campaña/plantilla se excluye por defecto de `resumen-v2`.
- La pestaña `Campañas` la solicita de forma explícita.
- Se agregó `incluir_atribucion_campanas` al contrato de `resumen-v2`.
- Se aplicó en Supabase el índice `prospeccion_contactos_log_org_envio_idx`.

Validación:

- `python3 -m py_compile backend/app/api/routes/crm.py`: correcto.
- `npx tsc --noEmit`: correcto.
- React Doctor: **100/100**.
- La RPC aislada no mejoró de forma suficiente con el índice; la reescritura SQL continúa pendiente.

El usuario realizará el deploy de backend y panel. Después del deploy se debe medir primero `resumen-v2` en las tres pestañas no relacionadas con campañas antes de continuar con la reescritura de la RPC.

### Acciones #2, #3 y #4 (2026-08-12)

- **#2 RPC:** aplicada la reescritura tenant-scoped de `prospeccion_campana_template_atribucion_rango`; la medición directa bajó a **2.21 s** y dejó de duplicar el escaneo de logs.
- **#3 GeoJSON:** añadido coalescing de cargas concurrentes y TTL de 1 hora para catálogos geográficos estáticos.
- **#4 tablas:** añadido cache in-flight y TTL de 2 minutos por alcance seguro; web sessions y conversaciones WhatsApp se solicitan concurrentemente.

Validación local del 2026-08-12:

- `py_compile`: correcto.
- `npx tsc --noEmit`: correcto.
- React Doctor: **100/100**.
- `git diff --check`: correcto.

Pendiente operativo: desplegar backend/panel y medir `crm.mapa_conversion.tables.request`, `crm.demografia.mapa_v2` y la pestaña `Campañas` con recarga fría y caliente. No se realizó deploy desde esta sesión.

### Verificación posterior al deploy (2026-08-12)

La medición real confirma que #2 redujo el costo aislado, pero no elimina la latencia bajo concurrencia:

- `mapa-v2` cache hit: generalmente menor a `10 ms`.
- `resumen-v2` cache miss: `6.7–18.1 s`; `catalogs_ms`: `4.2–8.6 s`.
- La RPC de campañas alcanza hasta `7.9 s` y continúa produciendo `57014` cuando varias solicitudes la ejecutan simultáneamente.
- Tablas: `8.9–16.1 s`; la causa son páginas seriales de `web-sessions` y cache aislado por worker de Next.

Decisión siguiente: retirar `incluir_atribucion_campanas=true` del camino de `resumen-v2` y servir la atribución mediante carga diferida/cacheada. Después, construir una lectura de tablas específica y compacta, evitando traer el enriquecimiento completo de sesiones en varias páginas.

### Implementación iniciada (2026-08-12)

- `resumen-v2` ya no incluye atribución de campañas en la carga inicial.
- Se agregó endpoint dedicado de atribución diferida para correo y WhatsApp.
- La UI de Campañas solicita los rankings después de montar el resumen base.
- Las páginas de `web-sessions` de las tablas se solicitan en ventanas concurrentes para reducir el tiempo serial.

Validación local: `py_compile`, `npx tsc --noEmit`, React Doctor **100/100** y `git diff --check` correctos. Falta deploy y medición real.

### Optimización adicional de tablas (2026-08-12)

Se paralelizó el enriquecimiento del endpoint `GET /crm/visitas/web-sessions`: envíos, contactos y plantillas ya no esperan uno a otro. Prospectos continúa después de obtener los envíos porque sus IDs pueden venir de esa relación.

Validación de esta iteración: `py_compile`, `npx tsc --noEmit` y `git diff --check` correctos. React Doctor de esta ejecución fue cancelado durante un escaneo completo; la última ejecución exitosa del panel había reportado 100/100.

### Ajuste de paginación del Tráfico web (2026-08-12)

La carga de `web-sessions` tenía una espera serial: primero pedía offset 0 y después abría una ventana de páginas concurrentes. Para tablas mayores de 1,000 filas, esa primera espera elevaba el tiempo de primera pintura.

El loader ahora pide offsets 0, 1,000, 2,000 y 3,000 en paralelo desde el inicio; si todas las páginas están llenas, continúa con la siguiente ventana para no perder filas. El cambio está limitado al panel y mantiene el contrato de datos.

Validación: `npx tsc --noEmit`, React Doctor con alcance de cambios **100/100** y `git diff --check` correctos. Pendiente deploy y medición real.

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
