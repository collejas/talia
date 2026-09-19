# Changelog — Arquitectura de comunicaciones

Este archivo controla los avances del plan documentado en [AUDITORIA_COMUNICACIONES_Y_PLAN_SEPARACION.md](./AUDITORIA_COMUNICACIONES_Y_PLAN_SEPARACION.md).

## 2026-09-19 — Corrección del cierre de batches Postmark

- Se agregó una migración correctiva para calificar las columnas de `tenant_email_messages` al cerrar `tenant_email_delivery_batches`.
- La corrección evita que un bloque ya enviado permanezca en `sending` por una ambigüedad SQL; no reenvía ni modifica mensajes ya aceptados.

## 2026-09-19 — Primera optimización de preparación Postmark

- El preparador reutiliza por ciclo el contexto estable del tenant y evita
  consultas duplicadas de URL pública, imágenes, dominio y activación Postmark.
- La optimización está limitada a Postmark; Brevo y WhatsApp conservan sus
  workers, límites y backpressure.
- Queda pendiente la persistencia agrupada de mensajes y bitácoras; se requiere
  medirla antes de aumentar la concurrencia.

## 2026-09-19 — Implementación de preparación Postmark y webhooks durables

### Cambios aplicados en código

- Se agregó un preparador Postmark independiente y su unidad systemd.
- Se agregaron bloques persistentes de entrega de máximo 500 mensajes y RPCs de reclamación idempotente.
- El worker de entrega conserva la separación de Brevo y Postmark y sólo envía bloques preparados mediante `/email/batch`.
- El endpoint Postmark ahora encola la recepción autenticada y responde sin ejecutar todas las escrituras de eventos.
- El worker procesa los webhooks con lease, reintentos y deduplicación.

### Estado de despliegue

- El código y la migración están preparados, pero la migración aún debe aplicarse en Supabase.
- La unidad `talia-postmark-preparer.service` aún debe instalarse y arrancarse en producción.
- No se modificaron datos ni se reiniciaron servicios durante esta implementación.

## Estado general

- [x] Auditoría técnica inicial.
- [x] Medición puntual del estado actual.
- [x] Identificación de procesos dentro de `talia-api.service`.
- [x] Diseño de arquitectura objetivo.
- [x] Definición inicial de límites operativos.
- [x] Implementación de lotes Postmark de hasta 500 con corte conservador por payload.
- [x] Reserva atómica del límite Brevo de 300 envíos diarios por tenant.
- [x] Campañas virtuales de hasta 10,000 prospectos con procesamiento paso a paso.
- [x] Definición de pruebas, criterios de aceptación y rollback.
- [ ] Implementación completa de la separación.
- [x] Worker independiente de WhatsApp/Meta preparado (campañas, follow-ups, webhooks y reconciliación).
- [x] Entry points independientes preparados para Postmark e IMAP.
- [x] Extracción del sender de Brevo al worker de correo.
- [x] Switches de migración para retirar Postmark e IMAP del API.
- [ ] Pruebas de carga.
- [ ] Migración gradual en producción.
- [x] Retiro controlado de workers de comunicaciones del proceso API.
- [ ] Reactivación controlada de la sincronización histórica Postmark.

## 2026-09-19 — Alineación con el plan Postmark

### Estado actual

- La separación inicial de API, correo, buzón y WhatsApp queda documentada como implementada mediante servicios systemd independientes y switches del API.
- `POSTMARK_SYNC_ENABLED=false` permanece vigente; la sincronización histórica no se reactiva dentro de la API ni junto con la entrega normal.
- La prueba controlada de 25 mensajes confirmó una sola llamada Postmark `/email/batch` con `batch_size=25`.
- El problema de rendimiento pendiente está antes de Postmark: la preparación todavía procesa destinatarios individualmente y puede generar presión sobre Supabase, CPU y webhooks.

### Decisión alineada

- La API sólo crea y encola el lote; no debe esperar la preparación ni la aceptación del proveedor.
- Un preparador Postmark debe cargar una vez el contexto del tenant y construir bloques `ready` de máximo 500 mensajes.
- `talia-email-worker.service` debe entregar cada bloque `ready` con una sola llamada `/email/batch`.
- Brevo conserva su cola, concurrencia y límites propios; WhatsApp conserva su worker y sus límites propios.
- Los webhooks deben persistir una recepción mínima idempotente y delegar el procesamiento pesado al worker de correo.
- La concurrencia y el backpressure se aplican por batch completo, tenant y proveedor; nunca se debe convertir un batch en envíos individuales.

### Pendientes

- [ ] Implementar o separar `talia-postmark-preparer.service`.
- [ ] Persistir explícitamente los bloques preparados y sus estados.
- [ ] Desacoplar completamente el procesamiento de webhooks Postmark.
- [ ] Ejecutar pruebas de 25, 500 y más de 500 mensajes con métricas de API, CPU, memoria, Supabase y llamadas reales a Postmark.

## 2026-09-18 — Auditoría inicial

### Completado

- Confirmado que la API y varios workers comparten el proceso de `talia-api.service`.
- Confirmado que `POSTMARK_WORKER_ENABLED=true`.
- Confirmado que `POSTMARK_SYNC_ENABLED=false`.
- Identificado que el lector IMAP se inicia dentro del lifespan de FastAPI.
- Identificado que los follow-ups y la reconciliación Meta se ejecutan dentro del API.
- Identificado que los webhooks Postmark realizan procesamiento y escrituras antes de responder.
- Identificado que Brevo no tiene un worker independiente.
- Medidos CPU, memoria, tareas, conexiones HTTP, conteos de colas y latencias observadas.
- Revisados estados, leases, checkpoints e idempotencia existentes.
- Documentado el plan de separación en el documento principal.

### Hallazgos pendientes de resolver

- El API continúa compartiendo CPU, memoria, event loop y acceso a Supabase con los workers.
- IMAP presenta errores repetidos de autenticación.
- Postmark histórico permanece desactivado hasta completar la separación.
- Los webhooks Meta usan `BackgroundTasks`, que no es una cola durable.
- Los webhooks Postmark pueden responder 500 si falla el procesamiento local.
- Persisten errores de timeout y consultas fallidas hacia Supabase en procesos WhatsApp.
- No existen todavía servicios systemd independientes para email, WhatsApp/Meta e IMAP.

## Plan de implementación

### Fase 0 — Observabilidad

Estado: preparación completada; habilitación pendiente.

- [ ] Crear métricas por servicio, proveedor, tenant y tipo de job.
- [ ] Medir duración de consultas y llamadas HTTP.
- [ ] Medir tamaño, antigüedad y tasa de error de cada cola.
- [ ] Registrar `request_id`, `job_id`, `provider_event_id` e idempotency key sin secretos.
- [ ] Establecer línea base de latencia de la API sin carga de workers.
- [ ] Establecer línea base de latencia con carga controlada.

### Fase 1 — Separación de IMAP

Estado: separación de proceso activa; endurecimiento y habilitación permanente pendientes.

- [x] Crear entrypoint independiente `app.workers.mailbox_worker`.
- [x] Preparar `talia-mailbox-worker.service`.
- [x] Agregar switch `MAILBOX_WORKER_IN_API` para retirar el lector del API.
- [x] Instalar y arrancar el servicio en systemd de forma controlada.
- [x] Retirar `email_inbound_reader` del proceso activo del API mediante el switch.
- [ ] Conservar estado, deduplicación y tenant.
- [x] Agregar backoff/circuit breaker en memoria para credenciales inválidas.
- [x] Verificar inicialmente que un error IMAP no afecte la salud de la API.
- [ ] Validar consumo de CPU, memoria y conexiones.

### Fase 2 — Worker de Brevo y Postmark

Estado: Postmark separado y activo de forma controlada; Brevo y sincronización histórica pendientes.

- [x] Crear entrypoint independiente `app.workers.email_worker`.
- [x] Preparar `talia-email-worker.service`.
- [x] Agregar switch `POSTMARK_WORKER_IN_API` para retirar Postmark del API.
- [x] Instalar y arrancar el servicio en systemd de forma controlada.
- [x] Retirar el worker Postmark del proceso activo del API mediante el switch.
- [ ] Mover sincronización histórica Postmark.
- [ ] Reutilizar checkpoints existentes.
- [ ] Mover envíos Brevo a una cola durable.
- [ ] Mantener tenant, lote, plantilla, versión, estado e idempotencia.
- [x] Definir límites de concurrencia por proveedor y tenant.
- [x] Definir backoff, rate limits y máximo global de 3 intentos.
- [x] Reclamar hasta 500 mensajes Postmark por ciclo y dividir por stream/tamaño antes de llamar `/email/batch`.
- [x] Reservar el cupo Brevo con RPC atómica por tenant y día UTC.
- [ ] Ejecutar pruebas de reinicio durante un lote.
- [ ] Reactivar `POSTMARK_SYNC_ENABLED` únicamente en el worker nuevo.

### Fase 3 — Webhooks de correo

Estado: pendiente.

- [ ] Validar firma o autenticación en el API.
- [ ] Registrar evento idempotente.
- [ ] Encolar procesamiento durable.
- [ ] Responder rápidamente.
- [ ] Procesar eventos en `talia-email-worker.service`.
- [ ] Probar duplicados, reordenamiento y reintentos.
- [ ] Confirmar cero respuestas 500 bajo carga normal.

### Fase 4 — Worker de WhatsApp y Meta

Estado: implementación preparada; migración y activación controlada pendientes.

- [x] Crear `talia-whatsapp-worker.service`.
- [x] Mover follow-ups WhatsApp mediante switches del API y el worker nuevo.
- [x] Permitir campañas virtuales de hasta 10,000 prospectos; cada envío conserva lote, plantilla, tenant e idempotencia.
- [x] Evitar devolver miles de filas en la respuesta inicial; el avance se consulta por lote y SSE.
- [x] Mover reconciliación Meta mediante switches del API y el worker nuevo.
- [x] Crear cola durable `whatsapp_webhook_jobs` para webhooks Meta.
- [x] Hacer que el webhook Meta responda después de persistir el job, sin ejecutar el procesamiento en `BackgroundTasks`.
- [x] Procesar mensajes y callbacks Meta en el worker con reintentos, leases e idempotencia.
- [x] Mantener resolución por `phone_number_id` durante la validación del webhook.
- [x] Aplicar la migración en Supabase y activar el servicio en producción.
- [ ] Probar duplicados y callbacks fuera de orden en producción controlada.
- [ ] Probar aislamiento entre tenants.
- [x] Implementar límites por tenant y proveedor; falta observarlos bajo carga.

### 2026-09-18 — Implementación del worker WhatsApp/Meta

- Se agregó `backend/app/workers/whatsapp_worker.py` para campañas `canal=whatsapp`, follow-ups, reconciliación Meta y webhooks encolados.
- Se agregó `infra/systemd/talia-whatsapp-worker.service` con `CPUQuota=50%`, `MemoryMax=384M`, usuario sin privilegios y reinicio automático.
- Se agregó `backend/scripts/run_whatsapp_worker.sh`.
- Se agregaron switches para retirar follow-ups y reconciliación del API sin cambiar sus defaults durante la migración.
- Se agregó `supabase/migrations/20260918_030000_whatsapp_worker_queue.sql` con tenant explícito, estado, leases, intentos, índices y clave única `(provider, organizacion_id, event_key)`.
- El webhook Meta conserva la verificación de firma y tenant en el API, y delega el procesamiento a la cola cuando `TALIA_WHATSAPP_WEBHOOK_QUEUE_ENABLED=true`.
- Los duplicados exactos de webhook no reinician jobs ya procesados: la inserción usa `resolution=ignore-duplicates`.
- No se reactivó la sincronización histórica de Postmark.
- Verificación local: importación/compilación correcta y `31 passed` en las pruebas enfocadas de WhatsApp, follow-ups, schemas Meta y sender de prospección.
- No se activó el servicio ni la cola remota todavía: primero debe aplicarse la migración y después ejecutarse el smoke test controlado.

### Fase 5 — Limpieza de la API

Estado: pendiente.

- [ ] Retirar runners de comunicaciones del lifespan.
- [ ] Mantener en el API únicamente API, panel, autenticación y recepción de webhooks.
- [ ] Mantener la verificación Meta en el API.
- [ ] Mantener la validación de firmas en el API.
- [ ] Confirmar que el API no inicia conexiones a Brevo, Postmark o IMAP por jobs.
- [ ] Confirmar que no quedan procesos de sincronización histórica en el API.

### 2026-09-18 — Límites operativos iniciales

- Se agregaron límites configurables por tenant y proveedor para el sender de prospección.
- Se fijó concurrencia inicial de 2 para correo y 2 para WhatsApp/Meta.
- Se fijaron lotes iniciales de 10 para el sender de correo/WhatsApp, 500 para entrega Postmark y 50 para lectura IMAP.
- Se agregó un máximo global de 3 intentos por envío; se conservan los backoff existentes de 30, 120, 300 y 600 segundos.
- Postmark histórico conserva `POSTMARK_SYNC_ENABLED=false`; cuando se reactive, usará páginas de 100 registros.
- Se actualizaron límites systemd: API 85% CPU/512M; email 40%/256M; IMAP 25%/192M; WhatsApp 40%/256M.
- Verificación local: compilación correcta y 34 pruebas enfocadas aprobadas.
- Pendiente: instalar las unidades systemd actualizadas, reiniciar los workers y ejecutar prueba de carga.

## 2026-09-18 — Primera implementación reversible

### Cambios aplicados

- Se agregaron los entrypoints `backend/app/workers/email_worker.py` y `backend/app/workers/mailbox_worker.py`.
- Se agregaron `backend/scripts/run_email_worker.sh` y `backend/scripts/run_mailbox_worker.sh`.
- Se prepararon `infra/systemd/talia-email-worker.service` y `infra/systemd/talia-mailbox-worker.service`.
- Se agregaron los switches `POSTMARK_WORKER_IN_API` y `MAILBOX_WORKER_IN_API`.
- El lifespan de FastAPI respeta ambos switches.
- Los defaults mantienen el comportamiento actual hasta habilitar los workers externos.
- Los servicios preparados incluyen límites iniciales de CPU/memoria.
- El entrypoint de correo procesa Brevo mediante la cola durable de prospección y Postmark mediante su cola/worker aislado.
- Se agregó backoff exponencial por buzón IMAP ante fallos de conexión/autenticación: inicia en 60 segundos, duplica hasta 15 minutos y se limpia tras un ciclo exitoso.
- El backoff se mantiene en memoria del worker, no guarda credenciales ni cambia estados de mensajes o cursores.
- `ProspeccionContactSender` acepta un filtro de canales y el worker de correo queda preparado para procesar únicamente `canal=correo`.
- La cola durable existente `prospeccion_contacto_envio` se reutiliza para Brevo; conserva tenant, lote, plantilla, estado e idempotencia.
- El claim del worker admite filtro de canal y mantiene la transición atómica `pendiente` → `procesando`.

### Verificación

- Compilación de módulos Python: exitosa.
- Pruebas enfocadas IMAP/Postmark: 12 passed.
- Servicios systemd: instalados, arrancados y habilitados para arranque automático; los nuevos límites de esta fase aún requieren instalar las unidades actualizadas.
- `POSTMARK_SYNC_ENABLED` permanece en `false`.
- Las unidades fueron instaladas en `/etc/systemd/system/` y `systemctl daemon-reload` fue ejecutado.
- Se dejaron persistidos `TALIA_POSTMARK_WORKER_IN_API=false` y `TALIA_MAILBOX_WORKER_IN_API=false` en `backend/.env`.
- El sender de correo ya fue retirado del API mediante `TALIA_CONTACT_SENDER_IN_API=false`; queda pendiente observar estabilidad y entrega.

### Evidencia posterior al arranque controlado

- `talia-api.service`, `talia-email-worker.service` y `talia-mailbox-worker.service` permanecen `active`.
- `/api/health` respondió `{"status":"ok"}`.
- El API quedó con 9 tareas y aproximadamente 302 MiB en cgroup; los workers quedaron alrededor de 54 MiB y 55 MiB respectivamente.
- Antes de la separación el API había alcanzado aproximadamente 913 MiB de cgroup; la comparación es puntual y debe confirmarse con una línea base repetible.
- El log del API ya no muestra el lector IMAP ni el worker Postmark desde el reinicio; los errores IMAP aparecen ahora en `talia-mailbox-worker.service`.
- El buzón continúa fallando con `[AUTHENTICATIONFAILED] Authentication failed.` para dos configuraciones de tenant. Esto confirma el aislamiento, pero bloquea la aceptación funcional del lector y requiere corregir credenciales o aplicar circuit breaker/backoff.
- Tras reiniciar el worker con el cambio, los fallos registraron `retry_in_seconds=60` y la siguiente ronda ocurrió aproximadamente un minuto después, en lugar de repetirse cada 20 segundos. El backoff quedó comprobado en ejecución.
- No se reactivó la sincronización histórica Postmark; `POSTMARK_SYNC_ENABLED=false` continúa vigente.
- No se modificaron filas de envíos, estados, lotes, plantillas, tenants ni claves de idempotencia durante esta fase.
- Se instaló la unidad actualizada `talia-email-worker.service` con descripción Brevo/Postmark y se reinició correctamente.
- Se activó `TALIA_CONTACT_SENDER_IN_API=false` y se reinició `talia-api.service`.
- Después del reinicio, el API respondió 200 en `/api/health` y no registró un nuevo `sender_started`.
- El worker de correo quedó activo con 4 tareas y aproximadamente 91 MiB de cgroup en la primera medición estable.
- Los conteos de correo pasaron de 5,149 a 5,151 enviados durante la observación; el worker estaba procesando la cola.
- La consulta de cola mostró 55 correos pendientes y 6 en `procesando`; WhatsApp y llamadas no tenían trabajos `procesando`.
- La separación de Brevo/Postmark del API queda funcionalmente activa, pendiente de una ventana de observación más larga y de prueba de entrega controlada.
- Observación pendiente: `logs/email-worker.log` permanece vacío durante esta ejecución; debe confirmarse la salida en journald o corregirse la configuración de logging antes de habilitar el arranque automático.
- Se identificaron 6 envíos de correo abandonados desde el 17 de septiembre: estaban en `procesando`, sin identificadores de proveedor ni marcas de despacho.
- Se reencolaron condicionalmente los 6 registros como `pendiente`, conservando sus columnas de tenant, lote, plantilla, intento e idempotencia; la actualización sólo aplicó cuando todos los indicadores de despacho estaban nulos.
- Se agregó medición estructurada de duración y reintentos de llamadas Supabase, profundidad de cola pendiente/procesando, duración de ciclos y duración/resultado de cada despacho.
- Los workers fuerzan como mínimo nivel `INFO` para que la evidencia operativa no desaparezca cuando el `.env` global usa `WARNING`.
- Se silenció el logger HTTP detallado (`httpx`/`httpcore`) en los workers para no escribir URLs con correos de buzón u otros parámetros sensibles.
- Los 6 envíos recuperados terminaron en `enviado` con identificadores de proveedor persistidos; la cola quedó con `pendiente=0` y `procesando=0`.

### Pendiente antes de habilitar

- [x] Revisar el diff y aprobar los límites systemd.
- [x] Reiniciar `talia-api.service` para que lea los switches nuevos.
- [x] Iniciar los dos workers después de que el API haya dejado sus runners.
- [x] Iniciar primero los workers nuevos en modo controlado.
- [x] Confirmar que ambos procesos permanecen independientes del API durante el smoke test inicial.
- Confirmar que las colas mantienen tenant, lote, plantilla, estado e idempotencia.
- Ejecutar smoke tests y medir la API antes de reactivar sincronización histórica.
- Corregir autenticación IMAP y verificar el backoff en producción antes de habilitar el servicio en el arranque del sistema.
- [x] Habilitar `talia-api.service`, `talia-email-worker.service`, `talia-mailbox-worker.service` y `talia-whatsapp-worker.service` con `systemctl enable`.
- [x] Instalar la versión actualizada de `talia-email-worker.service`, arrancarla y confirmar que solo reclama envíos `correo`.
- [x] Activar `TALIA_CONTACT_SENDER_IN_API=false` después de confirmar que el worker de correo está activo.

## Criterios para marcar la separación como completada

- [ ] `talia-api.service` no inicia workers de comunicaciones.
- [ ] Webhooks con p95 menor a 250 ms.
- [ ] Cero respuestas 500 durante la prueba normal.
- [ ] p95 de API con envíos activos no mayor a 110% de la línea base.
- [ ] CPU de API menor a 50–60% bajo carga nominal.
- [ ] Sin jobs `processing` abandonados.
- [ ] Sin duplicados por tenant, proveedor e idempotency key.
- [ ] Sin cruces de tenant.
- [ ] Checkpoints Postmark avanzan sin reiniciarse.
- [ ] Se conservan tenant, lote, plantilla, estado e idempotencia.
- [ ] Consultas y conexiones Supabase dentro de los límites definidos.
- [ ] Rollback probado y documentado.

## Regla de control

No marcar una fase como completada por compilación, reinicio, healthcheck o existencia del servicio. Cada fase requiere evidencia funcional y, cuando corresponda, persistencia validada, entrega del proveedor y medición posterior.
## 2026-09-19 — Persistencia agrupada Postmark sin afectar otros proveedores

- El preparador Postmark incorpora agrupación por tenant y reutilización de
  contexto para reducir llamadas repetidas durante la preparación.
- La persistencia agrupada queda encapsulada en la RPC
  `tenant_email_queue_messages_bulk`, limitada a 500 mensajes y ejecutable
  únicamente por `service_role`.
- La entrega continúa aislada en `talia-email-worker.service` y conserva la
  llamada Postmark `/email/batch`; Brevo, WhatsApp y el lector de buzones no
  utilizan esta ruta.
- La mejora aún requiere medir en producción el tamaño efectivo de los grupos,
  CPU, memoria, conexiones, latencia y resultados con lotes de 25, 500 y más
  de 500 antes de declararla completada.
