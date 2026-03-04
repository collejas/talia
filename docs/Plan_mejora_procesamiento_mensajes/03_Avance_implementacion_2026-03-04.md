# Avance de implementación (2026-03-04)

Estado del plan documentado en `02_Plan_soluciones_priorizado.md`.

## Resumen ejecutivo

- Fase 0.1: **Completada**
- Fase 0.2: **Completada**
- Fase 1.1: **Completada (primera iteración)**
- Fase 1.2: **Completada (primera iteración)**
- Fase 2.1: **Completada (primera iteración)**
- Fase 2.2: **Completada (primera iteración)**
- Fase 3: **Completada (primera iteración)**

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

### Fase 1.2 Prioridad de jobs no críticos durante blast (primera iteración)

1. Señal de presión operativa para decidir diferimiento.
- Se agregó conteo de backlog de prospección en backend:
  - `pendiente` listo para ejecutar (`programado_en <= now`)
  - `procesando`
- Este conteo se usa como condición para proteger jobs no críticos.

2. Gate centralizado para jobs no críticos.
- Se implementó módulo dedicado para evaluar si conviene diferir:
  - cachea resultado por TTL corto para no sobreconsultar DB.
  - expone detalles de decisión (`reason`, `backlog`, `threshold`, `cached`).
- Objetivo: aplicar una única regla consistente a múltiples runners.

3. Integración en runners no críticos.
- `whatsapp_followups`: difiere el ciclo cuando hay blast activo.
- `webchat_followups`: difiere el ciclo cuando hay blast activo.
- `webchat_closure_rescue`: difiere el ciclo cuando hay blast activo.
- En todos los casos se registra log explícito de diferimiento.

4. Parámetros externalizados de Fase 1.2.
- `NON_CRITICAL_JOBS_BLAST_PROTECTION_ENABLED` (default: `true`)
- `NON_CRITICAL_JOBS_DEFER_PENDING_THRESHOLD` (default: `300`)
- `NON_CRITICAL_JOBS_GATE_CACHE_SECONDS` (default: `20`)

5. Resultado esperado de primera iteración.
- Menor contención entre envíos masivos de prospección y jobs de seguimiento/rescate.
- Protección simple y reversible vía configuración (feature toggle).

### Fase 2.1 Guardrails de calidad de respuesta (primera iteración)

1. Evaluador compartido de calidad de respuesta.
- Se agregó módulo reusable para detectar respuestas incompletas/no publicables.
- Heurísticas iniciales:
  - respuesta vacía
  - frase conocida de fallo ("no pude procesar...")
  - cierre sospechoso (`...`, `…`, `,`, `:`, `;`, `-`)
  - conector suelto al final (`y`, `de`, `que`, `para`, etc.)
  - desbalance de fences/citas/paréntesis

2. Aplicación en canal WhatsApp.
- Validación del mensaje final antes de devolverlo.
- Si falla validación:
  - reintento corto de redacción final (sin tools)
  - si vuelve a fallar, se fuerza fallback único (sin persistir parcial)
- Se agregaron logs:
  - `whatsapp.reply_quality_low`
  - `whatsapp.reply_quality_recovered`
  - `whatsapp.reply_quality_retry_failed`
  - `whatsapp.reply_quality_retry_exception`

3. Aplicación en canal Webchat.
- Validación al finalizar `run_tool_loop`.
- Si falla validación:
  - reintento corto de redacción final (sin tools)
  - si vuelve a fallar, `assistant_reply = None` para disparar fallback único
- En handler de entrada:
  - si no hay respuesta usable, se aplica `DEFAULT_FALLBACK` y se persiste solo esa salida.
- Logs agregados:
  - `webchat.reply_quality_low`
  - `webchat.reply_quality_recovered`
  - `webchat.reply_quality_retry_failed`
  - `webchat.reply_quality_retry_exception`
  - `webchat.reply_fallback_applied`

4. Resultado esperado de primera iteración.
- Evitar respuestas parciales/truncadas visibles al usuario final.
- Mantener una sola salida consistente cuando falle calidad (sin mezclar parcial + fallback).

### Fase 2.2 Trazabilidad por `inbound_message_id` (primera iteración)

1. Correlación añadida en WhatsApp (entrada -> AI -> dispatch -> persistencia).
- Se normaliza y propaga `inbound_message_id` desde el registro del mensaje entrante.
- Se añade a metadata de OpenAI y a metadata del mensaje saliente persistido.
- Se registra traza estructurada por etapas:
  - `whatsapp.message_trace` con `stage`:
    - `inbound_persisted`
    - `assistant_generation_started`
    - `assistant_generated`
    - `dispatch_attempted`
    - `assistant_persisted`

2. Correlación añadida en Webchat (entrada -> AI -> persistencia -> respuesta al cliente).
- Se toma `inbound_message_id` desde el registro del mensaje entrante.
- Se añade a metadata de OpenAI y al metadata del mensaje saliente persistido.
- Se registra traza estructurada por etapas:
  - `webchat.message_trace` con `stage`:
    - `inbound_persisted`
    - `assistant_generation_started`
    - `assistant_generated`
    - `assistant_persisted`
    - `response_returned`

3. Enriquecimiento de eventos existentes.
- En WhatsApp se añadió `inbound_message_id` a:
  - `whatsapp.reply_generated`
  - `whatsapp.reply_dispatched`
  - `whatsapp.reply_registered`
  - `whatsapp.reply_register_failed`
- Esto permite reconstruir el flujo sin depender de correlación manual por timestamp.

4. Resultado esperado de primera iteración.
- Diagnóstico más rápido de incidentes por mensaje puntual.
- Capacidad de seguir un inbound específico de extremo a extremo en ambos canales.

### Fase 3 Observabilidad + modo alta demanda (primera iteración)

1. Controlador central de KPIs operativos.
- Se agregó `high_demand_mode.py` con métricas en memoria de:
  - `inbound_count` / `inbound_per_minute`
  - `assistant_reply_latency_p95_ms`
  - `inbox_threads_latency_p95_ms`
  - `twilio_error_rate` y desglose por código
  - `queue_depth` (pendiente listo + procesando)
- El cálculo se hace por ventana configurable (default 300s).

2. Runner automático de evaluación.
- Se añadió runner periódico (`high_demand_mode_runner`) al lifecycle de la API.
- Registra snapshot por corrida:
  - `high_demand.kpi_snapshot`
- Registra cambios de estado:
  - `high_demand.mode_activated`
  - `high_demand.mode_deactivated`

3. Modo alta demanda aplicado al backend.
- Sender de prospección adapta carga automáticamente cuando el modo está activo:
  - reduce `batch_size` efectivo
  - reduce `max_concurrency` efectivo
  - log: `prospeccion.sender_high_demand_profile`
- Jobs no críticos se diferen automáticamente cuando aplica:
  - `non_critical_job_gate` ahora considera `high_demand_mode` además de backlog.

4. Instrumentación de entradas/canales para KPIs.
- Webchat y WhatsApp registran inbound y latencia de respuesta del asistente.
- WhatsApp registra intentos/error de dispatch para tasa de error Twilio.
- Inbox threads alimenta el KPI de `inbox_threads_latency`.

5. Consulta owner-only del estado.
- Nuevo endpoint:
  - `GET /crm/ops/high-demand-mode?window_seconds=300`
- Devuelve snapshot + estado actual del modo (activo/reasons/recomendación de polling).

6. Resultado esperado de primera iteración.
- Alertas y activación automáticas sin intervención manual.
- Autoprotección básica en campañas intensas reduciendo contención entre flujos.

## Seguridad y acceso

1. Métricas/snapshots de Inbox restringidos a owner.
- En backend se aplicó control `owner-only`.
- El panel de métricas también valida `es_owner` y redirige a `/unauthorized` si no cumple.

## Estado de pendientes

### Fase 3.2 (parcial completada)

- Completado: polling de Inbox ajustable en tiempo real por perfil de runtime.
  - Backend: `GET /crm/inbox/runtime-profile` (permission `conv.read`).
  - Frontend: `split-view` consume `/api/inbox/runtime-profile` y adapta el intervalo de refresh de threads.
- Pendiente: alertas externas (Slack/Email) además del logging estructurado.

## Checklist de verificación operativa

1. Backend reiniciado con cambios de runner.
2. Confirmar logs:
- `crm.inbox.threads.metrics.runner_started`
- `crm.inbox.threads.metrics.auto_snapshot_saved`
- `prospeccion.sender_started` (con parámetros efectivos)
- `prospeccion.sender_rate_limited`
- `prospeccion.sender_backpressure_activated`
- `whatsapp.followup.deferred_due_to_blast`
- `webchat.followup.deferred_due_to_blast`
- `webchat.session_closed.rescue_deferred_due_to_blast`
- `whatsapp.reply_quality_low`
- `webchat.reply_quality_low`
- `webchat.reply_fallback_applied`
- `whatsapp.message_trace`
- `webchat.message_trace`
- `high_demand.runner_started`
- `high_demand.kpi_snapshot`
- `high_demand.mode_activated`
- `high_demand.mode_deactivated`
- `prospeccion.sender_high_demand_profile`
3. Confirmar escritura de histórico:
- `tail -n 20 /var/www/talia/logs/inbox-threads-metrics.log`
4. Confirmar acceso owner-only:
- `/settings/inbox-metrics` carga para owner.
- Usuarios no-owner reciben `/unauthorized`.
5. Confirmar endpoint owner-only de modo alta demanda:
- `GET /crm/ops/high-demand-mode`
