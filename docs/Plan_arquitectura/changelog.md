# Changelog — Arquitectura de comunicaciones

Este archivo controla los avances del plan documentado en [AUDITORIA_COMUNICACIONES_Y_PLAN_SEPARACION.md](./AUDITORIA_COMUNICACIONES_Y_PLAN_SEPARACION.md).

## Estado general

- [x] Auditoría técnica inicial.
- [x] Medición puntual del estado actual.
- [x] Identificación de procesos dentro de `talia-api.service`.
- [x] Diseño de arquitectura objetivo.
- [x] Definición inicial de límites operativos.
- [x] Definición de pruebas, criterios de aceptación y rollback.
- [ ] Implementación de la separación.
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

Estado: pendiente.

- [ ] Crear métricas por servicio, proveedor, tenant y tipo de job.
- [ ] Medir duración de consultas y llamadas HTTP.
- [ ] Medir tamaño, antigüedad y tasa de error de cada cola.
- [ ] Registrar `request_id`, `job_id`, `provider_event_id` e idempotency key sin secretos.
- [ ] Establecer línea base de latencia de la API sin carga de workers.
- [ ] Establecer línea base de latencia con carga controlada.

### Fase 1 — Separación de IMAP

Estado: pendiente.

- [ ] Crear `talia-mailbox-worker.service`.
- [ ] Mover `email_inbound_reader` fuera de `backend/app/main.py`.
- [ ] Conservar estado, deduplicación y tenant.
- [ ] Agregar límite de reintentos y circuit breaker para credenciales inválidas.
- [ ] Verificar que un error IMAP no afecte la API.
- [ ] Validar consumo de CPU, memoria y conexiones.

### Fase 2 — Worker de Brevo y Postmark

Estado: pendiente.

- [ ] Crear `talia-email-worker.service`.
- [ ] Mover entrega Postmark fuera de `talia-api.service`.
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

