# Auditoría técnica de comunicaciones y plan de separación

Fecha de auditoría inicial: 2026-09-18 UTC
Actualización de estado: 2026-09-19 UTC
Estado: separación inicial implementada; optimización de preparación de lotes y desacoplamiento durable de webhooks pendientes.

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

La auditoría inicial detectó que la API y los workers compartían el mismo proceso Python. Esa condición fue corregida parcialmente: actualmente los servicios de correo, WhatsApp y buzón tienen procesos systemd separados y los switches del API retiran los runners correspondientes.

El problema actual ya no es que la entrega Postmark ocurra en la solicitud HTTP. El problema restante es que la preparación de prospección todavía realiza trabajo por destinatario antes de que el worker pueda entregar un bloque completo a Postmark. Eso consume CPU, conexiones y operaciones de Supabase y puede afectar la latencia de la aplicación y la persistencia de webhooks.

Estado observado:

```text
POSTMARK_WORKER_ENABLED=true
POSTMARK_SYNC_ENABLED=false
```

En el corte inicial, la sincronización histórica estaba desactivada pero el
worker de Postmark residía dentro de la API. Reactivar directamente
`POSTMARK_SYNC_ENABLED` en aquel diseño habría mezclado sincronización
histórica, llamadas a Postmark, llamadas a Supabase y tráfico del panel en el
mismo proceso.

La afirmación anterior corresponde al corte inicial del 18 de septiembre. En el
estado actualizado, `POSTMARK_WORKER_IN_API=false`, `TALIA_CONTACT_SENDER_IN_API=false`
y `TALIA_MAILBOX_WORKER_IN_API=false`; la entrega Postmark se ejecuta desde
`talia-email-worker.service`, el buzón desde `talia-mailbox-worker.service` y
WhatsApp desde `talia-whatsapp-worker.service`. `POSTMARK_SYNC_ENABLED` continúa
en `false` y no debe reactivarse hasta que exista una ejecución histórica
dedicada con límites y medición propios.

La prueba del 19 de septiembre confirmó que el worker entregó el lote Postmark
de 25 mensajes mediante una sola operación `/email/batch`. Por tanto, el batch
del proveedor funciona; la siguiente mejora es separar el worker que prepara el
contenido del worker que entrega los bloques completos.

### Estado actualizado: optimización pendiente de preparación

La separación de procesos ya está operativa, pero no elimina por sí sola el
tiempo necesario para construir los mensajes. La prueba controlada de 10
mensajes confirmó un único `/email/batch` de 10, aunque la preparación tardó
aproximadamente un minuto porque todavía ejecuta trabajo por destinatario.

La siguiente fase no cambiará la entrega de Postmark ni los flujos de Brevo y
WhatsApp. Optimizará exclusivamente `talia-postmark-preparer.service` para
cargar el contexto una vez, renderizar en memoria, persistir mensajes en
bloques y dejar un payload `ready` de hasta 500 elementos para el worker de
entrega.

La prueba posterior del lote `3ccecddd-bd27-41cc-9f06-541891c8d921` confirmó
que el transporte ya entrega 10 mensajes en un solo batch, pero la preparación
continúa tardando aproximadamente 64 segundos. La cache de contexto reduce
consultas repetidas, aunque no resuelve las escrituras individuales. Por ello,
la prioridad siguiente es una RPC de persistencia masiva con cuota e
idempotencia atómicas, seguida de actualizaciones agrupadas de prospección y
bitácoras.

### Contrato de aceptación y webhooks

La aceptación de Postmark y la entrega final son eventos diferentes y no deben
mezclarse en un único contador o llamada de consulta.

```text
Talia prepara payload
        |
        v
Postmark /email/batch
        |
        +--> respuesta inmediata: aceptado/rechazado por destinatario
        |       Talia persiste MessageID e intento local
        |
        +--> webhook posterior: Delivery/Bounce/Open/Click/Complaint/Unsubscribe
                Talia actualiza estado, métricas y supresiones
```

La respuesta de `/email/batch` debe persistirse inmediatamente porque contiene
la aceptación inicial y el `MessageID` que permite correlacionar los eventos
posteriores. Esa persistencia no espera al webhook.

Los webhooks son la fuente operativa principal de los eventos posteriores. No
se debe llamar a la API de Postmark después de cada batch para consultar
entregas o rebotes. La API histórica sólo se ejecuta como respaldo controlado,
con checkpoints, límites y sin borrar datos locales; por eso
`POSTMARK_SYNC_ENABLED=false` permanece desactivado durante la operación normal.

Las escrituras locales posteriores a la aceptación —estado del envío,
`mensaje_id`, `mensaje_id_interno`, bitácoras y estado del lote— deben hacerse
en una operación agrupada. El worker puede llamar a Postmark una vez por batch,
guardar la respuesta y terminar la persistencia local con una RPC, sin crear un
`PATCH` por destinatario. Esto reduce latencia y conexiones sin cambiar el
flujo de Brevo, WhatsApp o IMAP.

## 3. Procesos actuales dentro de `talia-api.service`

En la auditoría inicial, el lifespan de [`backend/app/main.py`](../../backend/app/main.py) iniciaba:

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

Ese listado describe el estado previo a la separación. La situación actual
esperada después de los switches es:

```text
talia-api.service
  └── API y panel
      ├── autenticación y autorización
      ├── recepción/validación rápida de webhooks
      └── jobs ligeros estrictamente necesarios para la API

talia-email-worker.service
  ├── preparación/encolamiento actual de correo
  ├── entrega Brevo
  ├── entrega Postmark por /email/batch
  └── sincronización histórica Postmark sólo si se habilita de forma controlada

talia-whatsapp-worker.service
  ├── campañas y follow-ups WhatsApp
  ├── callbacks Meta encolados
  └── reconciliación de entregas

talia-mailbox-worker.service
  └── polling IMAP y correo entrante
```

La separación anterior no significa que la preparación Postmark ya esté
optimizada. El worker de correo todavía puede procesar destinatarios
individualmente para preparar la cola. Esa etapa debe convertirse en un worker
de preparación de lotes, separado lógicamente o mediante una unidad propia,
para que el worker de entrega sólo reclame bloques `ready` de hasta 500.

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

En ese corte inicial el proceso no tenía workers hijos; las tareas de fondo
compartían event loop, memoria, límites de archivos y conexiones HTTP con la
API. Esta medición no representa la topología separada actual.

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

Hallazgos de la auditoría inicial:

- No existe un worker dedicado para Brevo.
- El envío puede ejecutarse dentro del proceso API.
- No se identificó una cola durable específica de Brevo.
- No hay un límite central de concurrencia por proveedor.
- La política de reintentos no está centralizada.
- Los eventos externos necesitan una clave idempotente antes de producir cambios locales.

Riesgo identificado: una llamada síncrona a Brevo podía bloquear el event loop si se ejecutaba desde una ruta async o desde una tarea del API. Actualmente el sender de correo se ejecuta desde `talia-email-worker.service`; falta completar pruebas de carga y confirmar que todos los caminos de Brevo permanezcan fuera del API.

### 5.2 Postmark

Componentes principales:

- [`backend/app/services/postmark/worker.py`](../../backend/app/services/postmark/worker.py)
- [`backend/app/services/postmark/synchronization.py`](../../backend/app/services/postmark/synchronization.py)
- [`backend/app/services/postmark/repository.py`](../../backend/app/services/postmark/repository.py)
- [`backend/app/services/postmark/webhooks.py`](../../backend/app/services/postmark/webhooks.py)
- [`backend/app/integrations/postmark/client.py`](../../backend/app/integrations/postmark/client.py)

El worker de correo realiza, por tenant:

1. Provisión pendiente.
2. Verificación o creación de webhooks.
3. Claim de mensajes.
4. Preparación/encolamiento actual de envíos de prospección.
5. Entrega de lotes.
6. Actualización de envíos de prospección.
7. Sincronización histórica de mensajes cuando está habilitada.
8. Sincronización de hard bounces, complaints y unsubscribes cuando corresponde.

La sincronización histórica usa ventanas de fechas, streams y checkpoints. Hay checkpoints existentes y avance parcial; no se debe reiniciar ni borrar ese estado.

El claim usa una RPC atómica y lease de 600 segundos. La estructura existente es reutilizable y la ejecución ya salió del proceso API. La mejora pendiente consiste en evitar que la preparación por destinatario compita con la entrega y con las operaciones de otros proveedores. La entrega debe recibir un bloque `ready` de hasta 500 objetos y llamar una sola vez a `/email/batch`; una separación temporal, si se necesita, debe aplicarse entre llamadas batch y no entre correos individuales.

### 5.3 Webhooks Postmark

[`postmark_webhook`](../../backend/app/api/routes/webhooks.py) valida Basic Auth, consulta el servidor y actualmente todavía ejecuta parte de `process_postmark_event` antes de responder.

El procesamiento síncrono incluye:

- Búsqueda del mensaje.
- Registro del receipt.
- Inserción del evento.
- Actualización del estado.
- Actualización de suppressions.
- Cierre del receipt.

Existe idempotencia parcial mediante `tenant_email_webhook_receipts`, pero el webhook todavía no está completamente desacoplado. Si falla una escritura o una consulta interna, responde 500; se observaron errores `postmark.webhook_processing_failed`. La corrección pendiente es persistir una recepción mínima idempotente, encolar su procesamiento y responder rápidamente.

### 5.4 WhatsApp/Meta

El endpoint Meta está en [`backend/app/channels/whatsapp/router.py`](../../backend/app/channels/whatsapp/router.py).

En la auditoría inicial:

- Valida la firma.
- Convierte el payload en mensajes y callbacks.
- Programa `handle_incoming_message` y `handle_status_callback` con `BackgroundTasks`.
- Responde `accepted`.

En aquel corte esto reducía el tiempo de respuesta HTTP, pero no aislaba
recursos: `BackgroundTasks` seguía ejecutándose en el mismo proceso y no era
una cola durable. Actualmente el procesamiento durable usa la cola de WhatsApp
y `talia-whatsapp-worker.service`.

El procesamiento puede incluir consultas de persona, conversación, oportunidad, catálogo, OpenAI, envío Meta, persistencia y follow-up. Los logs muestran turnos de varios segundos y errores de timeout de Supabase.

La resolución por `phone_number_id` debe conservarse como regla obligatoria de aislamiento por tenant. No debe confiarse únicamente en un UUID recibido en la URL.

Actualmente los callbacks y trabajos WhatsApp tienen una cola durable y un worker separado mediante `talia-whatsapp-worker.service`. La validación de firma y tenant permanece en el API; el procesamiento pesado no debe volver a `BackgroundTasks`.

### 5.5 Follow-ups WhatsApp

`whatsapp_followup_jobs` ya tiene estados, `attempt_count`, `lease_until`, `due_at` y `processed_at`, por lo que puede reutilizarse como cola durable.

El runner ya fue separado del API. Permanecen pendientes las pruebas de carga, requeue, callbacks fuera de orden y aislamiento entre tenants.

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

- Cualquier ruta que aún use `BackgroundTasks` para trabajo durable debe migrarse a una cola; los callbacks Meta ya cuentan con la cola durable de WhatsApp.
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

talia-postmark-preparer.service
  - prepara contenido de campañas Postmark
  - carga una vez contexto de tenant, plantilla, dominio y stream
  - crea bloques `ready` de máximo 500
  - no llama a Postmark

talia-email-worker.service
  - entrega Brevo desde su cola y límites propios
  - entrega Postmark de bloques `ready` mediante `/email/batch`
  - sincronización histórica Postmark sólo en una fase controlada
  - procesamiento de webhooks Postmark ya encolados

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

Los webhooks deben validar, resolver tenant, registrar una recepción idempotente, crear/despertar un job y responder inmediatamente. El procesamiento pesado no debe vivir en el API.

La preparación y entrega Postmark deben mantenerse separadas de Brevo y
WhatsApp. El límite de 500 se aplica a cada llamada completa al proveedor; no se
debe simular con 500 llamadas unitarias ni con una espera de cinco segundos por
destinatario.

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
| Brevo | 2 tareas concurrentes en el worker de correo |
| Postmark entrega | Hasta 500 mensajes reclamados por tenant/ciclo; `/email/batch` en grupos de máximo 500 y corte conservador de 45 MiB |
| Postmark histórico | 1 tenant y stream a la vez |
| WhatsApp/Meta | 2 tareas concurrentes en el worker; máximo 30/minuto por tenant |
| Lote de lectura del sender | 10 por ciclo de correo/WhatsApp; una campaña puede contener hasta 10,000 prospectos |
| Lote histórico | 100 por página Postmark |
| Brevo | 300 reservas diarias por tenant, aplicadas atómicamente por fecha UTC |
| Envíos por tenant | 30/minuto por proveedor/canal |
| Proveedor agregado | 60/minuto |
| Destinatario | 2/minuto |
| Reintentos máximos | 3 intentos totales |
| Lease de envío | 10 minutos |
| Lease de webhook | 2–5 minutos |
| Memoria por worker | email 256 MB; IMAP 192 MB; WhatsApp 256 MB |
| CPU por worker | email 40%; IMAP 25%; WhatsApp 40% |

Backoff propuesto:

```text
30 s, 120 s, 300 s, 600 s; errores específicos pueden añadir 180–300 s.
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
- Separar la preparación Postmark en `talia-postmark-preparer.service` o en un worker equivalente aislado.
- Mover sincronización histórica.
- Reutilizar checkpoints actuales.
- Mantener los envíos Brevo en su cola y worker, sin adoptar el batch ni los límites de Postmark.
- Reactivar sincronización solo en el worker nuevo.

#### Fase 2A: preparación masiva Postmark

- La API sólo crea el trabajo y responde; no espera renderizado, inserciones ni
  aceptación del proveedor.
- El preparador carga contactos, plantilla, imágenes, dominio y configuración
  del tenant mediante consultas acotadas y reutiliza ese contexto para todo el
  lote.
- La persistencia usa inserciones/RPCs agrupadas en transacciones cortas de
  100–250 mensajes.
- Los bloques se limitan a 500 objetos y se separan por tenant, tipo y stream.
- Las actualizaciones de prospección y bitácoras se agrupan y se ejecutan fuera
  de la ruta HTTP.
- Se mantienen límites iniciales de 2–4 tareas de preparación y un batch activo
  por tenant; no se modifica la concurrencia de Brevo o WhatsApp.
- Se registran duración de consulta, renderizado, persistencia, payload,
  llamada a Postmark, CPU, memoria, conexiones y jobs pendientes.

#### Fase 2B: persistencia masiva e idempotente

- Reclamar el lote o bloque completo con `SKIP LOCKED` y lease.
- Cargar contactos y configuración en consultas acotadas.
- Renderizar en memoria y validar antes de persistir.
- Insertar mensajes y reservar cuota por bloque mediante RPC/transacción corta.
- Mantener columnas explícitas, constraints, índices y foreign keys; el JSON
  sólo podrá transportar temporalmente el conjunto de entrada variable.
- Actualizar estados operativos y bitácoras en operaciones agrupadas.
- Crear `ready` únicamente después de completar la persistencia.
- Medir contra la implementación individual antes de cambiar concurrencia.

### Fase 3: webhooks de correo

- Mantener validación en el API.
- Registrar receipt/evento idempotente.
- Responder rápido.
- Procesar el evento en `talia-email-worker.service` después de persistir la recepción.

### Fase 4: WhatsApp/Meta

- Crear `talia-whatsapp-worker.service`.
- Mover follow-ups.
- Mover reconciliación Meta.
- Registrar callbacks en una cola durable.
- Mantener los trabajos durables fuera de `BackgroundTasks` y verificar que no se reintroduzca ese patrón.

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

Este documento contiene el diagnóstico y el plan actualizado. Se aplicaron de forma gradual la extracción de IMAP, la separación de correo/WhatsApp, los lotes Postmark de 500, la reserva Brevo de 300 diarios y las campañas virtuales de hasta 10,000 prospectos. La sincronización histórica Postmark continúa deliberadamente desactivada.
