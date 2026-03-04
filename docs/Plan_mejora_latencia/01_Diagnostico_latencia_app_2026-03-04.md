# Diagnóstico de latencia general de la app

Fecha de diagnóstico: 2026-03-04 (UTC)  
Autor: análisis técnico sobre logs + código + backup + Supabase MCP

## 1) Objetivo

Identificar por qué la app presenta latencia alta de forma general, separando causas por capa:

1. Frontend (patrones de consumo/polling/tamaños de página)
2. Backend (rutas, orquestación y trabajo post-query)
3. Base de datos (queries pesadas, vistas/funciones, índices)
4. Carga operativa (webhooks, workers y concurrencia entre flujos)

---

## 2) Fuentes analizadas

### 2.1 Logs de aplicación (local)

- `/var/www/talia/logs/api.log`
- `/var/www/talia/logs/api.log.1`
- `/var/www/talia/logs/api.log.2`
- `/var/www/talia/logs/api.log.3`
- `/var/www/talia/logs/api.log.4`
- `/var/www/talia/logs/api.log.5`
- `/var/www/talia/logs/inbox-threads-metrics.log`

Cobertura detectada en `request.completed`:  
- primer evento: `2026-03-04T10:14:31.912+00:00`  
- último evento: `2026-03-04T20:35:02.987+00:00`

### 2.2 Código backend/frontend

- Backend:
  - `backend/app/api/routes/crm.py`
  - `backend/app/repositories/crm.py`
  - `backend/app/services/brevo.py`
- Frontend:
  - `frontend/panel/src/components/inbox/split-view.tsx`
  - `frontend/panel/src/app/prospeccion/prospectos/page.client.tsx`
  - `frontend/panel/src/lib/prospeccion/prospectos-client.ts`
  - `frontend/panel/src/app/prospeccion/denue-busqueda/denue-busqueda-view.tsx`
  - `frontend/panel/src/app/prospeccion/google-busqueda/google-busqueda-view.tsx`

### 2.3 Base de datos (copia)

- Backup revisado:
  - `backups/postgres_20260304_201634/postgres_20260304_201634_schema.sql`

### 2.4 Supabase MCP

- `pg_stat_statements`
- `pg_indexes`
- tamaños estimados (`pg_stat_user_tables` + `pg_total_relation_size`)

### 2.5 Contexto documental existente

- `docs/Plan_mejora_latencia/Plan_mejora_procesamiento_mensajes/*`
- `docs/Prospeccion/*`

---

## 3) Resumen ejecutivo

La latencia alta es **multicausal**. Los 4 focos de mayor impacto son:

1. **Prospección / contact-indicadores**: endpoint caro + altísima frecuencia.  
2. **Inbox / threads**: la query SQL no es lo más costoso; el mayor tiempo está en enriquecimiento backend posterior.  
3. **Prospección / queries**: endpoint de metadata implementado con escaneo paginado amplio (costoso por diseño).  
4. **Brevo webhook**: procesamiento síncrono con múltiples pasos por evento, con p95 muy alto.

Adicionalmente, el frontend amplifica carga por:

- polling continuo en Inbox
- tamaño de página grande (5000) en vistas de resultados de prospección
- patrón de recargas de metadata y de indicadores en la vista de prospectos

---

## 4) Métricas globales de latencia (logs API)

### 4.1 Salud general (muestra analizada)

- `request.completed` totales: `~3,622` con `duration_ms` numérico
- Requests >= `1000 ms`: `1,687` (alto)
- Requests >= `3000 ms`: `177`
- 5xx: `14`
- 4xx: `14`

Nota: los 5xx observados en esta muestra se concentran en endpoints de analytics catalog (`/api/crm/analytics/catalog/ventas` y `/embudo`) y no explican por sí solos la latencia general de prospección/inbox.

### 4.2 Endpoints con mayor tiempo total acumulado

(agregado por path normalizado)

1. `/api/crm/prospeccion/prospectos/contact-indicadores`
   - count: `919`
   - total: `1,309,907 ms`
   - avg: `1,425 ms`
   - p95: `2,141 ms`
2. `/api/crm/prospeccion/contacto/brevo/webhook`
   - count: `249-250`
   - total: `~918,144 ms`
   - avg: `~3,678 ms`
   - p95: `~12,870 ms`
3. `/api/whatsapp/status`
   - count: `~379`
   - total: `~385,090 ms`
   - avg: `~1,018 ms`
4. `/api/crm/prospeccion/prospectos/queries`
   - count: `51`
   - total: `~249,043 ms`
   - avg: `~4,883 ms`
5. `/api/crm/inbox/threads`
   - count: `90-101`
   - total: `~223,180+ ms`
   - avg: `~2,480-2,533 ms`

### 4.3 Endpoints con peor promedio (con volumen relevante)

1. `/api/crm/prospeccion/prospectos/queries`: avg `~4.9s`
2. `/api/crm/prospeccion/contacto/brevo/webhook`: avg `~3.7s` (cola larga severa)
3. `/api/crm/inbox/threads`: avg `~2.5s`
4. `/api/crm/prospeccion/prospectos/contact-indicadores`: avg `~1.4s` pero con muchísimo volumen

---

## 5) Hallazgos por dominio

## 5.1 Inbox (`/api/crm/inbox/threads`)

### Evidencia cuantitativa

- Request total `inbox/threads`:
  - count: `90`
  - avg: `2479.78 ms`
  - p50: `2721.54 ms`
  - p90: `3793.47 ms`
  - p95: `4505.63 ms`
- Log interno de query (`crm.inbox.threads.query`):
  - count: `65`
  - avg: `500.30 ms`
  - p50: `488.34 ms`
  - p90: `608.38 ms`
  - p95: `638.61 ms`

### Diagnóstico técnico

La diferencia (`~2.0s` promedio) no está en la SQL base, sino en el trabajo posterior en Python:

- enriquecimiento de batch/campaña/template
- carga de rules/eventos de atribución
- fallback de perfil/contacto
- fallback por teléfono (`worker_get_latest_envio_by_phone`) para threads WhatsApp sin metadata

Este comportamiento se ve directamente en `backend/app/api/routes/crm.py` dentro de `get_inbox_threads`.

### Estado del plan previo

Según `03_Avance_implementacion_2026-03-04.md`, ya existe cache de 4s y reducción de polling. Eso ayudó, pero la latencia base por request sigue alta cuando hay enriquecimiento amplio.

---

## 5.2 Prospección: `contact-indicadores`

Endpoint: `/api/crm/prospeccion/prospectos/contact-indicadores`

### Evidencia cuantitativa

- count: `919`
- avg: `1425 ms`
- p95: `2141 ms`
- total acumulado: `~1.31 millones ms` (mayor consumidor total)

Distribución de carga por request (querystring):

- promedio de `prospecto_id` por request: `38.27`
- p50/p90/p95: `40`
- max: `40`

Esto coincide con frontend: `listProspectoContactIndicators` parte en chunks de `40` IDs (`CHUNK_SIZE = 40`).

### Diagnóstico técnico

El repo llama la vista `prospeccion_prospecto_contacto_stats` para cada lote de IDs.  
La vista (`schema.sql`) agrega sobre:

- `prospeccion_contacto_envio` (counts/estado/última actividad)
- `prospeccion_contactos_log` (detección de respuesta)

Aunque venga filtrado por `prospecto_id in (...)`, el costo agregado es alto y se repite mucho.

---

## 5.3 Prospección: `queries` metadata

Endpoint: `/api/crm/prospeccion/prospectos/queries`

### Evidencia cuantitativa

- count: `51`
- avg: `4883 ms`
- p95: `7401 ms`
- max: `8747 ms`

### Diagnóstico técnico

`list_prospecto_query_metadata` en `backend/app/repositories/crm.py` usa scan paginado amplio:

- `page_size = 1000`
- `max_scan_rows = 200000`

y recorre registros para consolidar queries/activities/labels en Python.

Es funcionalmente correcto para exactitud, pero costoso para uso frecuente de UI.

---

## 5.4 Brevo webhook

Endpoint: `/api/crm/prospeccion/contacto/brevo/webhook`

### Evidencia cuantitativa

- count: `249-250`
- avg: `~3.68s`
- p50: `~1.37s`
- p90: `~12.5s`
- p95: `~12.87s`
- max: `13.5s`

La gran distancia entre p50 y p95 indica cola larga por variabilidad de trabajo por evento.

### Diagnóstico técnico

`process_brevo_events` procesa de forma síncrona, y por cada evento/message_id puede hacer varias operaciones secuenciales:

1. lookup de envío
2. update de envío
3. suppression (unsubscribe)
4. insert de logs
5. auto-promote
6. sync de batch
7. publish de progreso

Esto no solo agrega latencia al webhook, también compite por recursos de DB/API con otras rutas.

---

## 5.5 `whatsapp/status`

Endpoint: `/api/whatsapp/status`

### Evidencia

- count: `~379`
- avg: `~1.02s`
- p95: `~2.12s`

No es el peor en promedio, pero sí muy frecuente y concurrente con Inbox/Prospección. Actúa como amplificador de contención.

---

## 5.6 Frontend: patrones que amplifican carga

### Inbox

`frontend/panel/src/components/inbox/split-view.tsx`

- `THREADS_REFRESH_INTERVAL_MS = 12000`
- `MESSAGES_REFRESH_INTERVAL_MS = 1500`
- `RUNTIME_PROFILE_REFRESH_INTERVAL_MS = 60000`

Esto ya es mejor que versiones previas, pero en uso intenso multiusuario sigue generando presión constante.

### Prospección (Google/DENUE)

- `denue-busqueda-view.tsx`: `LIST_PAGE_SIZE = 5000`
- `google-busqueda-view.tsx`: `LIST_PAGE_SIZE = 5000`, `MAP_RESULTS_LIMIT = 5000`

Paginación grande aumenta payload, render y costo de consultas asociadas.

### Prospección (tabla de prospectos)

`page.client.tsx` y `prospectos-client.ts`:

- lista principal usa `limit` inicial `500`
- al cambiar `items`, dispara `listProspectoContactIndicators(currentIds)`
- la función chunking hace múltiples requests de 40 IDs
- `loadQueryOptions` y `loadActivitiesForQueries` pueden relanzar `/queries` por cambios de filtros/fechas/query

Resultado: la UI puede activar ciclos de requests pesados en cascada.

---

## 5.7 Base de datos (backup + Supabase MCP)

### Funciones/vistas relevantes en schema backup

- `public.panel_inbox_threads(...)` (función SQL compleja con `LATERAL`, agregados y `puede_ver_conversacion`)
- `public.prospeccion_prospecto_contacto_stats` (vista agregada de envíos y respuestas)

### `pg_stat_statements` (MCP)

Top relevantes:

1. `queryid 6241616360747343613` (RPC de upsert resultados por lote)
   - calls: `1887`
   - mean: `1717.95 ms`
   - total: `3,241,777.90 ms`
2. `queryid -3120456602846565216` (`panel_inbox_threads`)
   - calls: `16311`
   - mean: `94.00 ms`
   - total: `1,533,215.14 ms`

Lectura clave:

- `panel_inbox_threads` sí consume mucho tiempo total por volumen, pero su media es muy inferior al tiempo total de endpoint observado en API.
- La diferencia se explica por orquestación backend + enriquecimiento, no solo por SQL base.

### Índices

En `prospeccion_contacto_envio` existen índices de batch/org/prospecto, pero no hay índice de expresión para búsquedas por `detalle->>'phone'` (usadas en fallback de inbox/prospección).

Índices actuales MCP en esa tabla:

- `prospeccion_contacto_envio_batch_idx (batch_id, canal, estado)`
- `prospeccion_contacto_envio_org_idx (organizacion_id, programado_en)`
- `prospeccion_contacto_envio_prospecto_idx (prospecto_id, canal)`
- PK/uniques

### Tamaños estimados (MCP)

- `resultados`: `1213 MB`
- `prospeccion_prospectos`: `12 MB`
- `prospeccion_contacto_envio`: `7880 kB`
- `prospeccion_contactos_log`: `6624 kB`
- `mensajes`: `928 kB`
- `conversaciones`: `152 kB`

Observación: en este entorno, tablas inbox no son enormes; por eso el costo app-layer destaca más.

---

## 6) Comportamiento de autoprotección

Se detectaron eventos:

- `high_demand.mode_activated`
- `high_demand.mode_deactivated`

Ejemplos en la muestra:

- activación: `2026-03-04T19:52:33Z`
- desactivación: `2026-03-04T20:04:36Z`
- nueva activación: `2026-03-04T20:09:38Z`

Conclusión: ya existe protección dinámica, pero hoy mitiga síntomas; no elimina los cuellos base.

---

## 7) Causa raíz consolidada

No hay una sola causa. La latencia alta es efecto de la combinación de:

1. Endpoints pesados en Prospección (`contact-indicadores`, `queries`) con alta frecuencia.
2. Endpoint de Inbox con tiempo significativo en enriquecimiento backend (post-query).
3. Webhooks y callbacks en paralelo (`brevo/webhook`, `whatsapp/status`) compitiendo recursos.
4. Patrones frontend que elevan volumen de llamadas y tamaño de payload.
5. Algunos lookups frecuentes sobre JSON sin índice de expresión específico.

---

## 8) Priorización técnica (impacto vs esfuerzo)

## P0 (inmediato)

1. `inbox/threads`: reducir enriquecimiento en request crítico
   - mover fallbacks costosos a batch/cache
   - evitar lookups secuenciales repetidos por teléfono
   - separar datos "must-have" vs "nice-to-have" en respuesta inicial

2. `contact-indicadores`: cortar frecuencia y costo
   - cache corto por lote de IDs/filtros
   - actualización diferida al paginar o bajo interacción explícita
   - evaluar materialización/tabla incremental de stats por prospecto

3. `queries` metadata: evitar full-scan recurrente
   - cache por `fuente + rango de fechas + query filters`
   - preagregado incremental de catálogos de query/activity

4. webhook Brevo: ACK rápido + proceso asíncrono
   - persistir evento y responder 200 temprano
   - procesar enriquecimiento/side-effects en worker

## P1 (siguiente iteración)

1. Índices de expresión en `prospeccion_contacto_envio` para `detalle->>'phone'` (y potencialmente `detalle->>'email'` según uso real).
2. Reducir tamaños por defecto de página de resultados (`5000` -> objetivo más conservador).
3. Revisar llamadas iniciales de la vista de prospectos para evitar doble/triple carga de metadata al montar.

## P2 (robustez)

1. SLIs/SLOs por endpoint crítico con alertas por p95.
2. Presupuesto de latencia por ruta (DB + app + serialización).
3. Pruebas de carga por escenario mixto (Inbox + Prospección + Webhooks).

---

## 9) KPIs recomendados para seguimiento

Medir por endpoint crítico:

1. `p50/p90/p95 duration_ms`
2. `RPS` (o req/min)
3. tiempo SQL vs tiempo app (cuando aplique)
4. tamaño de payload (request/response)
5. cache hit-rate

Umbrales iniciales sugeridos:

- `GET /api/crm/inbox/threads`: p95 < `2000 ms`
- `GET /api/crm/prospeccion/prospectos/contact-indicadores`: p95 < `1200 ms`
- `GET /api/crm/prospeccion/prospectos/queries`: p95 < `2000 ms`
- `POST /api/crm/prospeccion/contacto/brevo/webhook`: p95 < `1500 ms`

---

## 10) Riesgos de no actuar

1. Degradación intermitente pero recurrente en horas de carga real.
2. Efecto dominó: webhooks lentos -> backlog -> más contención.
3. UX inconsistente en Inbox/Prospección (tiempos largos y percepción de inestabilidad).
4. Dificultad para escalar solo con infraestructura si la eficiencia por request no mejora.

---

## 11) Limitaciones de este diagnóstico

1. Se analizó la ventana disponible en logs rotados locales y estado actual de `pg_stat_statements`.
2. No se ejecutaron `EXPLAIN (ANALYZE, BUFFERS)` en ambiente aislado de la copia restaurada para cada query crítica.
3. Métricas reflejan mezcla de tráfico real + tareas operativas de la instancia durante la ventana.

Aun con esas limitaciones, la evidencia es consistente en todos los niveles (frontend, backend, DB, operación).

---

## 12) Conclusión final

La latencia general de la app es un problema de arquitectura de flujo en caliente: endpoints de alto costo invocados con alta frecuencia, más enriquecimiento backend no trivial, más carga concurrente de webhooks/workers.  

Priorizar primero `inbox/threads`, `contact-indicadores`, `queries` y `brevo/webhook` dará la mayor reducción de p95 de forma rápida, antes de pensar en escalar infraestructura.
