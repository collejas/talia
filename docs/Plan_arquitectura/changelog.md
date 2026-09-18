# Changelog — Arquitectura de comunicaciones

Este archivo controla los avances del plan documentado en [AUDITORIA_COMUNICACIONES_Y_PLAN_SEPARACION.md](./AUDITORIA_COMUNICACIONES_Y_PLAN_SEPARACION.md).

## Estado general

- [x] Auditoría técnica inicial.
- [x] Medición puntual del estado actual.
- [x] Identificación de procesos dentro de `talia-api.service`.
- [x] Diseño de arquitectura objetivo.
- [x] Definición inicial de límites operativos.
- [x] Definición de pruebas, criterios de aceptación y rollback.
- [ ] Implementación completa de la separación.
- [x] Entry points independientes preparados para Postmark e IMAP.
- [ ] Extracción completa de envíos Brevo.
- [x] Switches de migración para retirar Postmark e IMAP del API.
- [ ] Pruebas de carga.
- [ ] Migración gradual en producción.
- [ ] Retiro de workers del proceso API.
- [ ] Reactivación controlada de la sincronización histórica Postmark.

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
- [ ] Definir límites de concurrencia por proveedor.
- [ ] Definir backoff, leases y máximo de reintentos.
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

Estado: pendiente.

- [ ] Crear `talia-whatsapp-worker.service`.
- [ ] Mover follow-ups WhatsApp.
- [ ] Mover reconciliación Meta.
- [ ] Encolar mensajes y callbacks recibidos.
- [ ] Sustituir trabajos críticos en `BackgroundTasks`.
- [ ] Mantener resolución por `phone_number_id`.
- [ ] Probar duplicados y callbacks fuera de orden.
- [ ] Probar aislamiento entre tenants.
- [ ] Validar límites por tenant y proveedor.

### Fase 5 — Limpieza de la API

Estado: pendiente.

- [ ] Retirar runners de comunicaciones del lifespan.
- [ ] Mantener en el API únicamente API, panel, autenticación y recepción de webhooks.
- [ ] Mantener la verificación Meta en el API.
- [ ] Mantener la validación de firmas en el API.
- [ ] Confirmar que el API no inicia conexiones a Brevo, Postmark o IMAP por jobs.
- [ ] Confirmar que no quedan procesos de sincronización histórica en el API.

## 2026-09-18 — Primera implementación reversible

### Cambios aplicados

- Se agregaron los entrypoints `backend/app/workers/email_worker.py` y `backend/app/workers/mailbox_worker.py`.
- Se agregaron `backend/scripts/run_email_worker.sh` y `backend/scripts/run_mailbox_worker.sh`.
- Se prepararon `infra/systemd/talia-email-worker.service` y `infra/systemd/talia-mailbox-worker.service`.
- Se agregaron los switches `POSTMARK_WORKER_IN_API` y `MAILBOX_WORKER_IN_API`.
- El lifespan de FastAPI respeta ambos switches.
- Los defaults mantienen el comportamiento actual hasta habilitar los workers externos.
- Los servicios preparados incluyen límites iniciales de CPU/memoria.
- El entrypoint de correo de esta fase procesa Postmark; los envíos Brevo permanecen en el flujo actual hasta implementar su cola durable.
- Se agregó backoff exponencial por buzón IMAP ante fallos de conexión/autenticación: inicia en 60 segundos, duplica hasta 15 minutos y se limpia tras un ciclo exitoso.
- El backoff se mantiene en memoria del worker, no guarda credenciales ni cambia estados de mensajes o cursores.
- `ProspeccionContactSender` acepta un filtro de canales y el worker de correo queda preparado para procesar únicamente `canal=correo`.
- La cola durable existente `prospeccion_contacto_envio` se reutiliza para Brevo; conserva tenant, lote, plantilla, estado e idempotencia.
- El claim del worker admite filtro de canal y mantiene la transición atómica `pendiente` → `procesando`.

### Verificación

- Compilación de módulos Python: exitosa.
- Pruebas enfocadas IMAP/Postmark: 12 passed.
- Servicios systemd: instalados y arrancados; todavía no habilitados para arranque automático.
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

### Pendiente antes de habilitar

- [x] Revisar el diff y aprobar los límites systemd.
- [x] Reiniciar `talia-api.service` para que lea los switches nuevos.
- [x] Iniciar los dos workers después de que el API haya dejado sus runners.
- [x] Iniciar primero los workers nuevos en modo controlado.
- [x] Confirmar que ambos procesos permanecen independientes del API durante el smoke test inicial.
- Confirmar que las colas mantienen tenant, lote, plantilla, estado e idempotencia.
- Ejecutar smoke tests y medir la API antes de reactivar sincronización histórica.
- Corregir autenticación IMAP y verificar el backoff en producción antes de habilitar el servicio en el arranque del sistema.
- Habilitar `talia-email-worker.service` y `talia-mailbox-worker.service` con `systemctl enable` después de superar la prueba de estabilidad.
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
