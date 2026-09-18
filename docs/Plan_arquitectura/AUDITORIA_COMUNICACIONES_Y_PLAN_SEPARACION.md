# Auditoría técnica de comunicaciones y plan de separación

Fecha de auditoría: 2026-09-18 UTC  
Estado: diagnóstico completado; implementación pendiente de autorización.

## 1. Alcance

Se revisaron:

- Envíos de correo por Brevo.
- Envío, cola y sincronización histórica de Postmark.
- Webhooks de Postmark y flujos de correo.
- Envíos, callbacks, follow-ups y reconciliación de WhatsApp mediante Meta.
- Lectura de buzones IMAP.
- Procesos iniciados por `talia-api.service`.
- Uso compartido de CPU, memoria, HTTP y Supabase.
- Reintentos, leases, idempotencia, estados y aislamiento por tenant.

La auditoría fue de solo lectura. No se modificaron código, datos, migraciones, variables de entorno ni servicios.

## 2. Resumen ejecutivo

La API y los workers actualmente comparten el mismo proceso Python. `talia-api.service` atiende tráfico HTTP y también ejecuta procesos de comunicaciones y mantenimiento.

El problema principal es que la sincronización histórica de Postmark está implementada dentro de `PostmarkWorker`, pero ese worker se inicia desde el lifespan de FastAPI.

Estado observado:

```text
POSTMARK_WORKER_ENABLED=true
POSTMARK_SYNC_ENABLED=false
```

La sincronización histórica está desactivada, pero el worker de Postmark continúa residiendo dentro de la API. Reactivar directamente `POSTMARK_SYNC_ENABLED` volvería a mezclar sincronización histórica, llamadas a Postmark, llamadas a Supabase y tráfico del panel en el mismo proceso.

## 3. Procesos actuales dentro de `talia-api.service`

El lifespan de [`backend/app/main.py`](../../backend/app/main.py) inicia:

- `contact_sender`.
- `postmark_worker`, de forma condicional.
- `email_inbound_reader` para IMAP.
- `whatsapp_followup_runner`.
- `webchat_followup_runner`.
- `webchat_closure_rescue_runner`.
- `inbox_threads_metrics_snapshot_runner`.
- `high_demand_mode_runner`.
- `activity_reminder_jobs_runner`.
- `opportunity_followup_state_runner`.
- `deleted_busquedas_purge_runner`.
- `sales_notification_jobs_runner`.
- `meta_delivery_reconciliation_runner`.
- `message_billing_alert_runner`.

No se encontraron servicios systemd independientes para estos workers. La situación actual es:

```text
talia-api.service
  └── un proceso Python/Uvicorn
      ├── API y panel
      ├── webhooks
      ├── workers de correo
      ├── workers de WhatsApp
      ├── lector IMAP
      └── jobs de mantenimiento
```

## 4. Mediciones observadas

Corte realizado el 18 de septiembre de 2026, aproximadamente 18:52 UTC:

| Métrica | Resultado |
|---|---:|
| CPU del proceso API | 62–64% |
| RSS del proceso | aproximadamente 473 MB |
| Memoria cgroup | aproximadamente 419 MB |
| Tareas/hilos del servicio | 11 |
| Procesos hijos | 0 |
| Puerto del API | 8004 |
| `POSTMARK_WORKER_ENABLED` | `true` |
| `POSTMARK_SYNC_ENABLED` | `false` |

El proceso no tiene workers hijos. Las tareas de fondo comparten event loop, memoria, límites de archivos y conexiones HTTP con la API.

### 4.1 Latencia observada

Los logs retenidos mostraron:

| Fuente | p50 | p95 | p99 | Máximo |
|---|---:|---:|---:|---:|
| Requests generales | 456 ms | 2.47 s | 12.1 s | 32.5 s |
| Turnos WhatsApp | 15.2 s | 37.7 s | 69.5 s | 89.4 s |

Son cifras observacionales, no una prueba de carga controlada. Muestran que los turnos WhatsApp tienen suficiente duración para competir con tráfico normal si continúan en el proceso API.

### 4.2 Conteos observados en Supabase

| Tabla | Conteo observado |
|---|---:|
| `tenant_email_messages` | 3,382 |
| `tenant_email_sync_checkpoints` | 16 |
| `tenant_email_sync_runs` | 79 |
| `tenant_email_webhook_receipts` | 12,049 |
| `tenant_email_events` | 3,443 |
| `whatsapp_followup_jobs` | 1,212 |
| `sales_notification_jobs` | 47 |
| `prospeccion_contacto_envio` | 35,707 |
| `eventos_entrega` | 8,686 |

En Postmark se observaron 793 mensajes `submitted`, 14 `failed` y ningún mensaje `queued` o `processing` en la consulta realizada.

Los conteos son globales. Todo worker debe aplicar `organizacion_id` cuando el modelo lo permita.

## 5. Hallazgos por proveedor

### 5.1 Brevo

El envío está implementado en [`backend/app/services/email.py`](../../backend/app/services/email.py), mediante un cliente HTTP síncrono hacia `/smtp/email`.

Hallazgos:

- No existe un worker dedicado para Brevo.
- El envío puede ejecutarse dentro del proceso API.
- No se identificó una cola durable específica de Brevo.
- No hay un límite central de concurrencia por proveedor.
- La política de reintentos no está centralizada.
- Los eventos externos necesitan una clave idempotente antes de producir cambios locales.

Riesgo: una llamada síncrona a Brevo puede bloquear el event loop si se ejecuta desde una ruta async o desde una tarea del API.

### 5.2 Postmark

Componentes principales:

- [`backend/app/services/postmark/worker.py`](../../backend/app/services/postmark/worker.py)
- [`backend/app/services/postmark/synchronization.py`](../../backend/app/services/postmark/synchronization.py)
- [`backend/app/services/postmark/repository.py`](../../backend/app/services/postmark/repository.py)
- [`backend/app/services/postmark/webhooks.py`](../../backend/app/services/postmark/webhooks.py)
- [`backend/app/integrations/postmark/client.py`](../../backend/app/integrations/postmark/client.py)

El worker realiza, por tenant:

1. Provisión pendiente.
2. Verificación o creación de webhooks.
3. Claim de mensajes.
4. Entrega de lotes.
5. Actualización de envíos de prospección.
6. Sincronización histórica de mensajes.
7. Sincronización de hard bounces, complaints y unsubscribes.

La sincronización histórica usa ventanas de fechas, streams y checkpoints. Hay checkpoints existentes y avance parcial; no se debe reiniciar ni borrar ese estado.

El claim usa una RPC atómica y lease de 600 segundos. La estructura existente es reutilizable, pero la ejecución debe salir del proceso API.

### 5.3 Webhooks Postmark

[`postmark_webhook`](../../backend/app/api/routes/webhooks.py) valida Basic Auth, consulta el servidor y llama a `process_postmark_event` antes de responder.

El procesamiento síncrono incluye:

- Búsqueda del mensaje.
- Registro del receipt.
- Inserción del evento.
- Actualización del estado.
- Actualización de suppressions.
- Cierre del receipt.

Existe idempotencia parcial mediante `tenant_email_webhook_receipts`, pero el webhook no es rápido ni desacoplado. Si falla el procesamiento interno, responde 500. Se observaron errores `postmark.webhook_processing_failed`.

### 5.4 WhatsApp/Meta

El endpoint Meta está en [`backend/app/channels/whatsapp/router.py`](../../backend/app/channels/whatsapp/router.py).

Actualmente:

- Valida la firma.
- Convierte el payload en mensajes y callbacks.
- Programa `handle_incoming_message` y `handle_status_callback` con `BackgroundTasks`.
- Responde `accepted`.

Esto reduce el tiempo de respuesta HTTP, pero no aísla recursos: `BackgroundTasks` sigue ejecutándose en el mismo proceso y no es una cola durable.

El procesamiento puede incluir consultas de persona, conversación, oportunidad, catálogo, OpenAI, envío Meta, persistencia y follow-up. Los logs muestran turnos de varios segundos y errores de timeout de Supabase.

La resolución por `phone_number_id` debe conservarse como regla obligatoria de aislamiento por tenant. No debe confiarse únicamente en un UUID recibido en la URL.

### 5.5 Follow-ups WhatsApp

`whatsapp_followup_jobs` ya tiene estados, `attempt_count`, `lease_until`, `due_at` y `processed_at`, por lo que puede reutilizarse como cola durable.

El problema actual es que el runner que reclama y procesa esos jobs vive dentro de `talia-api.service`. También se observaron fallos repetidos en requeue y lectura de jobs listos.

### 5.6 IMAP

El lector [`backend/app/services/prospeccion_email_inbound_reader.py`](../../backend/app/services/prospeccion_email_inbound_reader.py) se inicia desde el lifespan de la API y usa `asyncio.to_thread` para llamadas IMAP bloqueantes.

Durante el periodo observado hubo errores repetidos:

```text
[AUTHENTICATIONFAILED] Authentication failed.
```

El proceso continúa intentando leer buzones con credenciales inválidas. Debe aislarse para que un problema IMAP no consuma recursos del API ni del worker de correo saliente.

## 6. Reintentos, idempotencia y duplicados

### Controles existentes

- Postmark tiene `idempotency_key`.
- Postmark tiene claim atómico y lease.
- Postmark registra receipts de webhooks.
- Follow-ups WhatsApp tienen estados y leases.
- Notificaciones de vendedores tienen estados y leases.
- Los envíos de prospección conservan tenant, lote, plantilla y estado.
- Hay índices recientes por tenant y lote en varias tablas.

### Riesgos pendientes

- `BackgroundTasks` no es durable ante reinicios.
- Un webhook puede registrar el receipt y fallar después durante la persistencia.
- Polling, reconciliación y callbacks pueden consultar los mismos registros sin una frontera de eventos común.
- Las políticas de retry no están centralizadas.
- La entrega externa y la persistencia local necesitan una transición idempotente única.
- Las consultas de worker deben filtrar por `organizacion_id`.

## 7. Arquitectura objetivo

```text
talia-api.service
  - API y panel
  - autenticación/autorización
  - validación de firmas
  - recepción de webhooks
  - inserción de eventos/jobs
  - respuesta rápida

talia-email-worker.service
  - cola Brevo
  - entrega Postmark
  - sincronización histórica Postmark
  - webhooks Postmark ya encolados

talia-whatsapp-worker.service
  - jobs WhatsApp programados
  - follow-ups
  - callbacks Meta encolados
  - reconciliación de entregas

talia-mailbox-worker.service
  - polling IMAP
  - lectura de buzones
  - procesamiento de correo entrante
```

Los webhooks deben validar, resolver tenant, registrar un evento idempotente, crear/despertar un job y responder inmediatamente.

## 8. Cambios de base de datos propuestos

Primero se deben reutilizar las colas existentes. Las migraciones nuevas solo deben cubrir faltantes.

### Eventos de webhook

Tabla durable con columnas explícitas:

- `id`.
- `organizacion_id`.
- `provider`.
- `provider_event_id`.
- `event_type`.
- `payload_received_at`.
- `processing_status`.
- `attempt_count`.
- `available_at`.
- `lease_until`.
- `processed_at`.
- `last_error_code`.
- `last_error_message`.

Restricción recomendada:

```text
UNIQUE (organizacion_id, provider, provider_event_id)
```

El payload original puede conservarse como respaldo variable y sin secretos, pero no debe contener la estructura principal del negocio.

### Jobs de comunicación

Si las tablas actuales no cubren todos los proveedores, usar columnas explícitas para:

- Tenant.
- Proveedor y canal.
- Lote.
- Plantilla y versión.
- Envío relacionado.
- Idempotency key.
- Estado.
- Intentos.
- Disponibilidad.
- Lease.
- Último error.

Índice mínimo:

```text
(organizacion_id, status, available_at, id)
```

con índice parcial para estados procesables.

No se deben borrar ni recrear los envíos actuales.

## 9. Límites operativos iniciales

Para el servidor actual de 1 vCPU y 1 GB:

| Área | Límite inicial |
|---|---:|
| Brevo | 2 solicitudes concurrentes globales |
| Postmark entrega | 1–2 por tenant |
| Postmark histórico | 1 tenant y stream a la vez |
| WhatsApp/Meta | 2 globales; 1 por tenant |
| Lote normal | 25–50 |
| Lote histórico | 100–250 |
| Envíos por tenant | conservar inicialmente 40/minuto |
| Reintentos máximos | 5 |
| Lease de envío | 10 minutos |
| Lease de webhook | 2–5 minutos |
| Memoria por worker | 256–384 MB |
| CPU por worker | 50–70% |

Backoff propuesto:

```text
1 s, 5 s, 30 s, 120 s, 600 s + jitter
```

Los errores 4xx permanentes no se reintentan. Los 429 respetan `Retry-After`. Los timeouts y errores 5xx se reintentan hasta el máximo.

## 10. Plan de migración gradual

### Fase 0: observabilidad

- Métricas por worker, proveedor y tenant.
- Duración de consultas y llamadas HTTP.
- Tamaño de colas y jobs abandonados.
- `request_id`, `job_id`, `provider_event_id` e idempotency key sin secretos.
- Línea base de API bajo carga normal.

### Fase 1: IMAP

- Crear `talia-mailbox-worker.service`.
- Mover el lector IMAP fuera de `main.py`.
- Conservar estado y deduplicación.
- Agregar circuit breaker para credenciales inválidas.

### Fase 2: Brevo y Postmark

- Crear `talia-email-worker.service`.
- Mover entrega Postmark.
- Mover sincronización histórica.
- Reutilizar checkpoints actuales.
- Mover envíos Brevo a la cola.
- Reactivar sincronización solo en el worker nuevo.

### Fase 3: webhooks de correo

- Mantener validación en el API.
- Registrar receipt/evento idempotente.
- Responder rápido.
- Procesar el evento en `talia-email-worker.service`.

### Fase 4: WhatsApp/Meta

- Crear `talia-whatsapp-worker.service`.
- Mover follow-ups.
- Mover reconciliación Meta.
- Registrar callbacks en una cola durable.
- Sustituir `BackgroundTasks` para trabajos durables.

### Fase 5: limpieza del API

- Eliminar runners de comunicaciones del lifespan.
- Mantener API, panel, autenticación y recepción de webhooks.
- Mantener en el API únicamente la verificación Meta y validación de firmas.

## 11. Pruebas de carga y aceptación

Se deben probar:

- Brevo con 2xx, 429, 4xx, 5xx y timeout.
- Postmark con reinicio durante un lote.
- Sincronización desde checkpoint parcial.
- Webhooks Postmark duplicados y fuera de orden.
- Webhooks Meta duplicados y concurrentes.
- Follow-up vencido, requeue y lease expirado.
- Credencial IMAP inválida.
- Panel y workers simultáneos.
- Timeout de Supabase.
- Acceso cruzado entre tenants.

Criterios de éxito:

- `talia-api.service` sin runners de comunicaciones.
- Webhook p95 menor a 250 ms.
- Cero 500 durante la prueba normal.
- p95 de API con envíos activos no mayor a 110% de la línea base.
- CPU de API menor a 50–60% bajo carga nominal.
- Sin jobs `processing` abandonados.
- Cero duplicados por tenant, proveedor e idempotency key.
- Cero cruces de tenant.
- Checkpoints Postmark avanzando sin reiniciarse.
- Tenant, lote, plantilla, estado e idempotencia conservados.
- Conexiones y consultas Supabase dentro de los límites.

## 12. Rollback

- Desplegar los workers nuevos inicialmente deshabilitados.
- No borrar ni recrear envíos.
- Detener workers nuevos si aparecen duplicados.
- Mantener `POSTMARK_SYNC_ENABLED=false` hasta validar el worker nuevo.
- Reactivar sincronización solo con checkpoints existentes.
- Comparar conteos de mensajes, estados, intentos y checkpoints por fase.
- No convertir un reinicio en una nueva tentativa si ya existe `provider_message_id` o idempotency key aceptada.

## 13. Archivos y servicios involucrados

### Código

- `backend/app/main.py`
- `backend/app/core/config.py`
- `backend/app/services/email.py`
- `backend/app/services/postmark/worker.py`
- `backend/app/services/postmark/synchronization.py`
- `backend/app/services/postmark/webhooks.py`
- `backend/app/services/postmark/repository.py`
- `backend/app/services/prospeccion_email_inbound_reader.py`
- `backend/app/channels/whatsapp/router.py`
- `backend/app/services/whatsapp_followups.py`
- `backend/app/services/meta_delivery_reconciliation_jobs.py`
- `backend/app/services/prospeccion_contact_sender.py`
- `backend/app/services/sales_notification_jobs.py`

### Base de datos

Migraciones bajo `supabase/migrations/` relacionadas con:

- `tenant_email_*`
- `whatsapp_followup_jobs`
- `sales_notification_jobs`
- `prospeccion_contacto_envio`
- `eventos_entrega`

### Infraestructura

- `/etc/systemd/system/talia-api.service`
- `/etc/systemd/system/talia-email-worker.service`
- `/etc/systemd/system/talia-whatsapp-worker.service`
- `/etc/systemd/system/talia-mailbox-worker.service`
- Variables en `backend/.env` o en el mecanismo operativo de secretos.

## 14. Estado de implementación

Este documento contiene el diagnóstico y el plan. No se ha aplicado ninguna modificación. La primera implementación autorizada debería ser la instrumentación y extracción de IMAP, seguida por la separación de Postmark/Brevo y finalmente WhatsApp/Meta.

