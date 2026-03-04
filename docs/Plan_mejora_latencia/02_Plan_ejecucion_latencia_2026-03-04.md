# Plan de ejecución para mejora de latencia

Fecha de elaboración: 2026-03-04 (UTC)  
Base: `docs/Plan_mejora_latencia/01_Diagnostico_latencia_app_2026-03-04.md`

## 1) Objetivo del plan

Reducir latencia percibida y p95 en endpoints críticos sin romper operación de Inbox/Prospección, priorizando mejoras de eficiencia (app + DB + patrón de consumo) antes de escalar infraestructura.

## 2) Metas cuantitativas (SLO inicial)

Ventana de control: 7 días posteriores a despliegue inicial.

1. `GET /api/crm/inbox/threads`
   - Baseline (diagnóstico): p95 `~4505 ms`
   - Meta fase 1: p95 `< 2800 ms`
   - Meta fase 2: p95 `< 2000 ms`
2. `GET /api/crm/prospeccion/prospectos/contact-indicadores`
   - Baseline: p95 `~2141 ms`
   - Meta fase 1: p95 `< 1600 ms`
   - Meta fase 2: p95 `< 1200 ms`
3. `GET /api/crm/prospeccion/prospectos/queries`
   - Baseline: p95 `~7401 ms`
   - Meta fase 1: p95 `< 3500 ms`
   - Meta fase 2: p95 `< 2000 ms`
4. `POST /api/crm/prospeccion/contacto/brevo/webhook`
   - Baseline: p95 `~12870 ms`
   - Meta fase 1: p95 `< 5000 ms`
   - Meta fase 2: p95 `< 1500 ms`

## 3) Alcance técnico

Incluye:

1. Backend API (FastAPI)
2. Repositorio DB access (Supabase/PostgREST)
3. SQL (migraciones de índices y estructuras de preagregación)
4. Frontend panel (ritmo de requests/paginación/carga diferida)
5. Observabilidad y guardrails operativos

No incluye en esta iteración:

1. Refactor completo de dominio Prospección
2. Rediseño de modelo de datos `resultados`
3. Cambios de infraestructura mayor (sharding, réplicas dedicadas)

---

## 4) Estrategia general

Implementación por fases para minimizar riesgo:

1. **Fase A (rápida, bajo riesgo):** bajar presión de requests y trabajo redundante.
2. **Fase B (impacto alto):** reducir trabajo en ruta crítica (Inbox, queries, indicadores).
3. **Fase C (estructural):** asíncrono de webhooks + preagregación incremental.
4. **Fase D (hardening):** tuning final, alertas y rollback-ready.

Regla de despliegue:

- Cada bloque detrás de flag/config cuando sea posible.
- Medición pre/post en ventana de 30-60 minutos de tráfico real.
- Rollback en <15 minutos por bloque si p95 empeora >20%.

---

## 5) Plan de 7 días (detallado)

## Día 1 (2026-03-05): Instrumentación fina + quick wins frontend

### Objetivo

Reducir carga innecesaria sin tocar lógica de negocio profunda.

### Entregables

1. **Control de frecuencia en Prospección (frontend):**
   - Evitar recargas redundantes de `/prospeccion/prospectos/queries` al montar.
   - Introducir debounce (300-500 ms) para cambios de filtros que disparen metadata.
2. **Cargar indicadores bajo demanda:**
   - En `prospectos/page.client.tsx`, no disparar `contact-indicadores` inmediatamente para 500 items al montar.
   - Activar por viewport/página visible o al expandir grupo.
3. **Reducir tamaños por defecto en vistas grandes:**
   - `LIST_PAGE_SIZE` en Google/DENUE de `5000` a `1000` (o `500` si UX lo permite).

### Archivos objetivo

1. `frontend/panel/src/app/prospeccion/prospectos/page.client.tsx`
2. `frontend/panel/src/lib/prospeccion/prospectos-client.ts`
3. `frontend/panel/src/app/prospeccion/denue-busqueda/denue-busqueda-view.tsx`
4. `frontend/panel/src/app/prospeccion/google-busqueda/google-busqueda-view.tsx`

### Validación

1. Revisar en logs caída de llamadas/min a:
   - `/api/crm/prospeccion/prospectos/queries`
   - `/api/crm/prospeccion/prospectos/contact-indicadores`
2. Confirmar UX sin regresión (paginación y filtros correctos).

### Riesgo

- Riesgo: usuarios perciban menor “inmediatez” en algunos contadores.
- Mitigación: indicador visual de “actualizando” + refresh manual.

---

## Día 2 (2026-03-06): Inbox threads - optimización ruta crítica

### Objetivo

Reducir tiempo post-query en backend de `inbox/threads`.

### Entregables

1. **Separación de enriquecimiento:**
   - Respuesta inicial “core” (thread + últimos mensajes + estado).
   - Enriquecimiento pesado opcional/lazy (metadata de prospección, templates, attribution extras).
2. **Batch lookups en vez de secuencial por thread:**
   - Evitar `worker_get_latest_envio_by_phone` N veces en loop.
   - Resolver por lote o cacheado por teléfono al inicio.
3. **Cache multinivel de hints:**
   - cache corta por `telefono -> ultimo_envio_hint` (TTL 30-60s) para requests concurrentes.

### Archivos objetivo

1. `backend/app/api/routes/crm.py`
2. `backend/app/repositories/crm.py`

### Validación

1. Comparar métricas:
   - `crm.inbox.threads.query` (debe mantenerse similar)
   - `request.completed /api/crm/inbox/threads` (debe bajar significativamente)
2. Meta día 2:
   - p95 Inbox `< 3200 ms`

### Riesgo

- Riesgo: perder metadata secundaria en primer render.
- Mitigación: endpoint complementario o carga diferida de detalles.

---

## Día 3 (2026-03-07): Índices DB + lookup JSON

### Objetivo

Eliminar scans evitables en lookups frecuentes por JSON.

### Entregables SQL (migración)

1. Índice expresión para teléfono en `prospeccion_contacto_envio`:

```sql
create index concurrently if not exists idx_pce_detalle_phone_canal_created
on public.prospeccion_contacto_envio ((detalle->>'phone'), canal, creado_en desc);
```

2. Índice expresión para email (si se confirma uso alto):

```sql
create index concurrently if not exists idx_pce_detalle_email_canal_created
on public.prospeccion_contacto_envio ((lower(detalle->>'email')), canal, creado_en desc);
```

3. (Opcional según EXPLAIN) índice parcial WhatsApp:

```sql
create index concurrently if not exists idx_pce_phone_whatsapp_recent
on public.prospeccion_contacto_envio ((detalle->>'phone'), creado_en desc)
where canal = 'whatsapp';
```

### Archivos objetivo

1. Nueva migración en carpeta de migraciones del backend/supabase.
2. Ajustes de query builder en `backend/app/repositories/crm.py` para usar forma index-friendly (normalización de phone/email).

### Validación

1. `EXPLAIN (ANALYZE, BUFFERS)` en query lookup phone/email.
2. `pg_stat_statements` mean_exec_time del patrón lookup debe bajar.

### Riesgo

- Riesgo: lock durante creación de índices.
- Mitigación: `CONCURRENTLY`, ventana de baja carga y seguimiento.

---

## Día 4 (2026-03-08): `contact-indicadores` - reducción estructural

### Objetivo

Quitar costo repetido de vista agregada en caliente.

### Enfoque recomendado

Implementar **tabla/materialized view incremental** de stats por `prospecto_id` y actualizarla por eventos de envío/log, en lugar de recomputar agregados pesados en cada request.

### Entregables

1. Nueva estructura de stats (ejemplo):
   - `public.prospeccion_prospecto_contacto_stats_cache`
2. Mecanismo de refresco incremental:
   - trigger o job periódico corto (cada 1-2 min)
3. Endpoint `contact-indicadores` leyendo de cache preagregada.

### SQL base sugerido (modelo)

```sql
create table if not exists public.prospeccion_prospecto_contacto_stats_cache (
  prospecto_id uuid primary key,
  organizacion_id uuid not null,
  canales jsonb not null default '{}'::jsonb,
  total_envios bigint not null default 0,
  ultimo_contacto_en timestamptz,
  total_respuestas bigint not null default 0,
  respondio boolean not null default false,
  ultima_respuesta_en timestamptz,
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_ppcs_cache_org_updated
  on public.prospeccion_prospecto_contacto_stats_cache (organizacion_id, actualizado_en desc);
```

### Archivos objetivo

1. Migración SQL de nueva tabla/función refresh.
2. `backend/app/repositories/crm.py` (leer cache en lugar de vista pesada).

### Validación

1. p95 de `contact-indicadores` debe bajar al menos 25-40%.
2. Verificar consistencia funcional (conteos iguales frente a vista anterior en muestra).

### Riesgo

- Riesgo: desfase temporal de 1-2 minutos.
- Mitigación: TTL corto + refresh on-demand para IDs visibles.

---

## Día 5 (2026-03-09): `queries` metadata - reemplazo de scan masivo

### Objetivo

Eliminar full-scan de `prospeccion_prospectos` por cada consulta de metadata.

### Entregables

1. Crear agregado persistente para catálogo de query/activity por tenant y rango temporal.
2. Endpoint `/prospectos/queries` responde desde agregado + filtro liviano.
3. Cache de respuesta por clave (`fuente`,`date_from`,`date_to`,`queries`) con TTL 30-120s.

### Archivos objetivo

1. `backend/app/repositories/crm.py` (`list_prospecto_query_metadata`)
2. `backend/app/api/routes/crm.py`
3. Migración SQL para tabla auxiliar de agregados (si aplica)

### Validación

1. p95 endpoint `queries` < `3500 ms` en primera entrega.
2. reducción de ejecución de loops con `max_scan_rows`.

### Riesgo

- Riesgo: diferencias de conteo frente a scan exacto.
- Mitigación: job de reconciliación nocturna + comparación por muestra.

---

## Día 6 (2026-03-10): webhook Brevo asíncrono

### Objetivo

Reducir drásticamente cola larga en webhook (`p95` alto).

### Entregables

1. Endpoint webhook hace:
   - validación mínima
   - persistencia de evento crudo
   - ACK rápido `200`
2. Worker dedicado procesa evento async:
   - lookup/update/suppression/log/promote/sync batch
3. Reintento idempotente por `message_id + event + date`.

### Archivos objetivo

1. `backend/app/api/routes/crm.py`
2. `backend/app/services/brevo.py`
3. nueva tabla de cola/eventos (`prospeccion_brevo_events_queue`) + worker runner

### SQL sugerido (cola simple)

```sql
create table if not exists public.prospeccion_brevo_events_queue (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid,
  payload jsonb not null,
  status text not null default 'pending',
  attempts int not null default 0,
  next_run_at timestamptz not null default now(),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_brevo_queue_status_next
  on public.prospeccion_brevo_events_queue (status, next_run_at);
```

### Validación

1. p95 webhook `< 5000 ms` (objetivo intermedio) inmediatamente.
2. luego `< 1500 ms` al estabilizar worker.
3. sin pérdida de eventos (contabilidad de entrada vs procesados).

### Riesgo

- Riesgo: duplicados/reordenamiento.
- Mitigación: llave idempotente + estados transaccionales.

---

## Día 7 (2026-03-11): tuning final, hardening y cierre

### Objetivo

Cerrar brechas, documentar operación y dejar rollback probado.

### Entregables

1. Ajustar thresholds de `high_demand_mode` con datos nuevos.
2. Alertas definitivas por endpoint crítico y error rates.
3. Runbook de operación y fallback:
   - qué apagar por flag si sube p95
   - cómo revertir migraciones lógicas sin downtime
4. Reporte before/after en documento de avance.

### Archivos objetivo

1. `docs/Plan_mejora_latencia/03_Avance_plan_latencia_2026-03-11.md` (nuevo)
2. configuración de settings backend
3. panel de métricas operativas (si aplica)

---

## 6) Backlog técnico por componente

## 6.1 Backend (prioridad alta)

1. Reducir enriquecimiento en `get_inbox_threads`.
2. Reescribir `list_prospecto_query_metadata` para evitar scans de 200k.
3. Implementar lectura de `contact-indicadores` desde cache preagregada.
4. Refactor webhook Brevo a ACK rápido + worker.

## 6.2 Frontend (prioridad alta)

1. Bajar page-size default en Google/DENUE.
2. Diferir carga de indicadores por visibilidad/contexto.
3. Debounce de recargas de metadata en vista de prospectos.

## 6.3 DB (prioridad alta)

1. Índices de expresión para lookup por JSON (`detalle->>'phone'`, `detalle->>'email'`).
2. Tabla de agregados para indicadores por prospecto.
3. Tabla de cola para Brevo webhook async.

## 6.4 Observabilidad (prioridad media-alta)

1. Dashboard con p50/p90/p95 por endpoint crítico.
2. Correlación request_id entre webhook, worker y updates de envío.
3. Alertas de degradación sostenida (>5 min).

---

## 7) Matriz de riesgo y mitigación

1. **Riesgo funcional en Inbox**
   - Mitigación: respuesta core + enriquecimiento progresivo; pruebas snapshot de respuesta.
2. **Riesgo de consistencia en agregados**
   - Mitigación: reconciliación periódica contra fuente raw.
3. **Riesgo de duplicados en webhook async**
   - Mitigación: idempotencia por llave natural y estado transaccional.
4. **Riesgo de degradación por índices mal elegidos**
   - Mitigación: EXPLAIN + validación en ventana controlada.

---

## 8) Plan de pruebas

## 8.1 Pruebas funcionales mínimas

1. Inbox threads carga, filtra y muestra metadata esperada.
2. Prospectos muestra queries/activities correctas por rango y fuente.
3. Contact-indicadores coincide con resultados esperados en muestra.
4. Brevo events se reflejan en envíos/logs igual que antes.

## 8.2 Pruebas de rendimiento

1. Prueba sintética de `inbox/threads` con 10-20 usuarios concurrentes.
2. Prueba de ráfaga a `contact-indicadores` con lotes de 40 IDs.
3. Prueba de webhook burst (Brevo) + tráfico normal de Inbox.

## 8.3 Criterios de aceptación de performance

1. Cumplir metas de p95 de sección 2.
2. No aumentar 5xx respecto baseline.
3. Mantener exactitud funcional en indicadores y estados.

---

## 9) Rollback por bloque

1. Frontend quick wins:
   - rollback por deploy frontend anterior.
2. Inbox optimization:
   - flag para volver a enriquecimiento actual.
3. Índices:
   - no rollback urgente (índices pueden mantenerse si no perjudican).
4. `contact-indicadores` cache:
   - flag para volver a vista original.
5. Brevo async:
   - mantener pathway sync como fallback temporal por flag.

---

## 10) Responsables sugeridos (por rol)

1. Backend principal: Inbox + Queries + Brevo async
2. DBA/Backend: índices + agregados cache
3. Frontend: reducción de frecuencia/tamaños + lazy loading
4. QA/Operación: validación funcional y monitoreo p95 post-deploy

---

## 11) Checklist de cierre del plan

1. p95 de 4 endpoints críticos en objetivo o tendencia estable a objetivo.
2. No regresiones funcionales reportadas en Inbox/Prospección.
3. Dashboard operativo con visibilidad diaria.
4. Runbook actualizado en `docs/Plan_mejora_latencia`.
5. Lista de pendientes remanentes priorizada para iteración 2.

---

## 12) Siguiente documento recomendado

Crear al cierre de la semana:

- `docs/Plan_mejora_latencia/03_Avance_plan_latencia_2026-03-11.md`

Contenido:

1. Baseline vs post-cambio (tabla por endpoint)
2. Cambios aplicados por archivo/migración
3. Incidentes/regresiones y correcciones
4. Decisión de continuidad (iteración 2)
