# Plan de soluciones priorizado

Objetivo: evitar degradación de rendimiento y respuestas anómalas en escenarios de alta concurrencia (campañas de prospección + replies entrantes + uso intensivo de Inbox), sin romper operación actual.

## Principios de implementación

1. Reducir carga antes de escalar infraestructura.
2. Aislar trabajos críticos vs no críticos.
3. Introducir controles de backpressure automáticos.
4. Medir antes y después con KPIs claros.

## Fase 0 (rápida, 1-2 días)

### 0.1 Inbox: reducir carga inmediata

- Implementar cache corta (3-5 segundos) para `GET /api/crm/inbox/threads` por combinación de usuario+filtros+fecha.
- Frontend: debounce y polling menos agresivo (10-15 segundos) en lista de threads.
- Mover contador/resumen a endpoint liviano separado para no recalcular listado completo.

Resultado esperado:

- Bajar p50/p90 de `inbox/threads` y eliminar picos >5s en carga normal.

### 0.2 Corregir bug de asignación

- Corregir creación en `asignaciones_vendedores` para garantizar `canal` no nulo.
- Agregar validación defensiva y logging estructurado con contexto.

Resultado esperado:

- Cero eventos `whatsapp.ensure_opportunity_failed` por `canal=null`.

## Fase 1 (estabilización, 3-5 días)

### 1.1 Control de ráfagas en prospección

- Envío por lotes con límite configurable (ej. 20-50 mensajes/min por tenant).
- Límite de concurrencia en worker de envío.
- Backoff automático ante aumento de:
  - códigos Twilio de no entrega (`63024`, `63049`, `63032`)
  - errores de plantilla (`whatsapp_template_variables_incompletas`)

Resultado esperado:

- Menor explosión de callbacks simultáneos.
- Curva de carga más plana y predecible.

### 1.2 Aislar trabajos de fondo

- Ejecutar followups/escalaciones con prioridad más baja durante campañas activas.
- Regla de convivencia: si hay blast activo, limitar ciclos no críticos.

Resultado esperado:

- Menor contención entre jobs internos y flujo de atención entrante.

## Fase 2 (robustez del asistente, 3-5 días)

### 2.1 Guardrails de calidad de respuesta

- No persistir como respuesta final texto truncado/incompleto.
- Si respuesta AI falla validación de calidad, reintento corto controlado.
- Si persiste fallo, fallback consistente y único (sin mezclar salida parcial+fallback).

Resultado esperado:

- Cero respuestas parciales visibles al cliente final.

### 2.2 Trazabilidad por mensaje

- Correlación por `inbound_message_id` para rastrear:
  - entrada
  - generación AI
  - dispatch Twilio
  - persistencia final

Resultado esperado:

- Diagnóstico rápido en incidentes (sin reconstrucción manual extensa).

## Fase 3 (observabilidad y autoprotección, 2-4 días)

### 3.1 KPIs y alertas

KPIs mínimos por minuto:

- `inbound_count`
- `assistant_reply_latency_p95`
- `inbox_threads_latency_p95`
- `twilio_error_rate` por código
- `queue_depth` de workers

Alertas sugeridas:

- `inbox_threads_p95 > 3000 ms` por 5 min.
- `assistant_reply_p95 > 60 s` por 5 min.
- `twilio_error_rate > umbral` por 10 min.

### 3.2 Modo alta demanda (automático)

Cuando se active umbral:

- Aumentar intervalo de polling frontend temporalmente.
- Reducir temporalmente concurrencia de campañas.
- Suspender/reducir jobs no críticos.

Resultado esperado:

- El sistema se protege solo y evita degradación en cascada.

## Orden recomendado de ejecución

1. Fase 0.1 (cache/debounce Inbox)
2. Fase 0.2 (fix `canal` nulo en asignaciones)
3. Fase 1.1 (rate limit y batch control de prospección)
4. Fase 1.2 (prioridad de jobs)
5. Fase 2.1 (guardrails de salida AI)
6. Fase 3 (alertas + modo alta demanda)

## Criterios de éxito (aceptación)

Durante campañas intensas:

- `p90 /api/crm/inbox/threads < 2000 ms`
- `p95 latencia primer reply AI < 45 s`
- `respuestas truncadas visibles = 0`
- `errores por canal nulo en asignaciones = 0`
- `reducción sostenida de picos >5s en Inbox`

## Riesgos y mitigación

- Riesgo: cache de Inbox muestre datos levemente desfasados.
  - Mitigación: TTL corto (3-5s) + invalidación por eventos clave.

- Riesgo: bajar ritmo de campañas reduzca velocidad de alcance.
  - Mitigación: límites dinámicos por ventana/tenant, no límites fijos globales.

- Riesgo: cambios simultáneos difíciles de aislar.
  - Mitigación: despliegue por fases con feature flags y monitoreo por paso.
