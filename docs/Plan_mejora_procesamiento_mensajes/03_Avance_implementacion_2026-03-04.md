# Avance de implementación (2026-03-04)

Estado del plan documentado en `02_Plan_soluciones_priorizado.md`.

## Resumen ejecutivo

- Fase 0.1: **Completada**
- Fase 0.2: **Completada**
- Fase 1.1: **Completada (primera iteración)**
- Fase 1.2+: **Pendiente**

## Entregables completados

### Fase 0.1 Inbox (reducción de carga)

1. Cache corta en backend para `GET /crm/inbox/threads`.
- TTL: 4 segundos.
- Scope de cache: usuario + organización + filtros + paginación.

2. Polling de lista de conversaciones menos agresivo en frontend.
- Intervalo de refresh de threads: `12s` (antes `1.6s`).
- Se evita polling cuando la pestaña está oculta (`document.hidden`).

3. Instrumentación de rendimiento de Inbox.
- Métricas in-memory de latencia (`p50/p90/p95/avg/max`).
- Métricas de cache (`hits/misses/hit_rate`).
- Conteo de queries lentas (`>3000ms`).

4. Endpoints de observabilidad para Inbox.
- `GET /crm/inbox/threads/metrics?window_seconds=...`
- `POST /crm/inbox/threads/metrics/snapshots?window_seconds=...`
- `GET /crm/inbox/threads/metrics/snapshots?limit=...`

5. Persistencia de snapshots en log.
- Archivo: `/var/www/talia/logs/inbox-threads-metrics.log`

6. Snapshot automático cada 5 minutos.
- Runner backend activo en lifecycle de la app.
- Actor técnico guardado: `system:auto_runner`.

7. Vista owner-only en panel.
- Ruta: `/settings/inbox-metrics`
- Incluye:
  - KPIs de latencia/cache/slow queries.
  - Botón de actualización manual.
  - Botón para guardar snapshot manual.
  - Tabla de histórico de snapshots.
  - Mini gráfica (últimos 24 snapshots) de `p95` y `hit-rate`.

### Fase 0.2 Asignaciones (`canal` no nulo)

1. Corrección en auditoría de asignaciones.
- Se garantiza `canal` siempre poblado en inserciones de `asignaciones_vendedores`.
- Fallback defensivo: `"assistant"` cuando no llega canal.

2. Corrección específica en ruta de restart/reenganche.
- La auditoría de restart ahora envía canal explícito.

3. Resultado esperado cubierto.
- Se elimina la causa conocida de error por `canal = null` en inserciones de asignación.

### Fase 1.1 Control de ráfagas en prospección (primera iteración)

1. Concurrencia configurable en worker de envíos.
- El procesamiento de envíos pendientes dejó de ser estrictamente secuencial.
- Se implementó procesamiento paralelo con `Semaphore`, respetando un tope de concurrencia por ciclo.

2. Rate limiting por scope (`organizacion + canal`).
- Se agregó límite de envíos por minuto en memoria por scope.
- Si se excede el límite, el envío no falla: se reprograma a `pendiente` con `programado_en` diferido.
- Se registra evento de throttling para trazabilidad (`prospeccion.sender_rate_limited`).

3. Backpressure automático por ráfagas de error.
- Se monitorean errores de proveedor/plantilla en ventana corta.
- Señales contempladas:
  - Códigos Twilio `63024`, `63049`, `63032`.
  - Error `whatsapp_template_variables_incompletas`.
- Al superar umbral, se activa cooldown temporal por scope y se difieren nuevos envíos.
- Se registra evento de activación (`prospeccion.sender_backpressure_activated`).

4. Backoff adicional para reintentos de errores sensibles.
- Para `whatsapp_template_variables_incompletas` se fuerza backoff mínimo mayor.
- Para errores Twilio sensibles también se fuerza backoff mínimo mayor.

5. Parámetros externalizados en configuración.
- Se agregaron settings para ajustar:
  - `batch_size`
  - `max_concurrency`
  - `per_minute_limit`
  - `rate_limit_defer_seconds`
  - `error_window_seconds`
  - `error_threshold`
  - `backpressure_cooldown_seconds`
- El worker registra sus parámetros efectivos al arrancar (`prospeccion.sender_started`), para auditoría operativa.

## Seguridad y acceso

1. Métricas/snapshots de Inbox restringidos a owner.
- En backend se aplicó control `owner-only`.
- El panel de métricas también valida `es_owner` y redirige a `/unauthorized` si no cumple.

## Estado de pendientes

### Fase 1.2 (pendiente)

- Priorización de jobs para reducir contención durante blasts.

### Fase 2.1 (pendiente)

- Guardrails de calidad para evitar persistir respuestas truncadas/parciales.

### Fase 2.2 (pendiente)

- Trazabilidad end-to-end por `inbound_message_id`.

### Fase 3 (pendiente)

- Alertas automáticas y modo alta demanda.

## Checklist de verificación operativa

1. Backend reiniciado con cambios de runner.
2. Confirmar logs:
- `crm.inbox.threads.metrics.runner_started`
- `crm.inbox.threads.metrics.auto_snapshot_saved`
- `prospeccion.sender_started` (con parámetros efectivos)
- `prospeccion.sender_rate_limited`
- `prospeccion.sender_backpressure_activated`
3. Confirmar escritura de histórico:
- `tail -n 20 /var/www/talia/logs/inbox-threads-metrics.log`
4. Confirmar acceso owner-only:
- `/settings/inbox-metrics` carga para owner.
- Usuarios no-owner reciben `/unauthorized`.
