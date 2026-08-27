# Changelog — Plan Postmark

Registro de avances, decisiones, validaciones y pendientes de la migración del correo de Talia.

## [2026-08-27]

### Cambios

- Se agregó la reclamación concurrente de mensajes Postmark con `FOR UPDATE SKIP LOCKED`, estado explícito `processing` y recuperación de reclamaciones obsoletas.
- Se conectó el worker aislado de Postmark al ciclo de vida de FastAPI, limitado a tenants con la migración Postmark habilitada.
- El worker conserva y utiliza el `stream_name` persistido al encolar; un cambio posterior de configuración no puede desviar un mensaje a otro stream.
- Se agregó `POSTMARK_WORKER_ENABLED`, desactivado por defecto, para impedir actividad del worker antes de configurar el piloto del tenant maestro.

### Validaciones

- La migración `postmark_queue_claim` fue aplicada y verificada en Supabase.
- La función de reclamación está restringida a `service_role`.
- La cola Postmark no contiene mensajes de prueba.
- El tenant maestro continúa `pending` y con `feature_enabled = false`.
- Pruebas de integración y servicio Postmark: 13 aprobadas; compilación del backend y `git diff --check`: aprobados.

### Pendientes

- Configurar de forma segura los tokens de cuenta/servidor y habilitar el worker únicamente durante el piloto.
- Registrar y verificar el primer dominio remitente del tenant maestro.
- Crear webhooks autenticados y procesar entrega, rebote, queja y supresión.
- Implementar reintentos/backoff y la política final de bloqueo, eliminación y remitente predeterminado.

## [2026-08-26]

### Cambios

- Se precisó la documentación de credenciales: Account API Token para dominios desde `Account -> API Tokens` y Server API Tokens por servidor para envíos; no se capturan en la vista del tenant.
- Se corrigió la configuración para usar un único `POSTMARK_SERVER_TOKEN` por servidor y seleccionar `MessageStream` mediante `POSTMARK_TRANSACTIONAL_STREAM` o `POSTMARK_BROADCAST_STREAM`.
- Se agregó al constructor existente de `prospeccion/campanas` la selección explícita del tipo de correo; se persiste en `email_message_kind` y no dentro de `metadata`.
- Se agregó al servicio Postmark la preparación de mensajes en cola con validación de tenant, dominio verificado, plan, supresión, cuota e idempotencia; el `stream_name` se deriva del tipo de mensaje.
- Se agregó un worker Postmark aislado con reclamación segura por tenant y recuperación de mensajes en estado `processing` obsoleto; solo procesa migraciones Postmark habilitadas.
- Se corrigió el adaptador para usar `PUT /domains/{id}/verifyDkim` y `PUT /domains/{id}/verifyReturnPath`, y para leer `ReturnPathDomainCNAMEValue` según el contrato oficial actual.
- Se agregó el adaptador aislado `backend/app/integrations/postmark/` para llamadas HTTP al servicio de correo.
- Se agregaron contratos internos para mensajes y resultados individuales o batch.
- Se agregaron variables de configuración exclusivas del backend para tokens transaccional y broadcast, sin valores por defecto sensibles.
- El adaptador valida cuerpo, remitente, destinatario, asunto y el límite máximo de 500 mensajes por batch.
- Se agregó una migración nueva para conservar el contenido explícito del mensaje y reservar cuota con idempotencia en una transacción.
- Se agregó una migración de intentos de entrega para reclamar, cerrar y contabilizar mensajes Postmark de forma idempotente.
- Se agregó el endpoint tenant-scoped `GET /tenant/me/email-service` con autorización `settings.view`.
- Se agregó el panel de tenant para consultar estado, dominios, registros DNS y cuota sin exponer tokens ni identificadores del proveedor.
- Se agregó lectura administrativa protegida para consultar el correo de un tenant desde `settings/tenants/{tenantId}`.
- Se materializó la cuota inicial comercial de 10,000 mensajes mensuales por tenant en las tablas propias `tenant_email_plans` y `tenant_email_usage_periods`.
- Se agregó una RPC administrativa atómica y la auditoría `tenant_email_quota_changes` para ajustar la cuota actual por tenant.
- Se agregó el alta y verificación de dominios mediante Account API, con normalización de DKIM y Return-Path en columnas propias.
- Se agregaron rutas tenant y administrativas para registrar dominios y solicitar verificación sin exponer credenciales.
- El panel de `settings/variables` y el detalle de `settings/tenants/{tenantId}` muestran el formulario, los DNS y el estado de verificación.

### Decisiones

- El adaptador no resuelve tenant, permisos, cuotas ni persistencia; esas reglas permanecerán en servicios de negocio separados.
- Los envíos batch conservan el resultado de cada destinatario aunque la respuesta HTTP sea exitosa.
- Postmark no importa, reutiliza ni comparte implementación con Brevo o SMTP; ambos proveedores permanecen completamente separados.
- El panel ya consulta el servicio mediante un contrato neutral; los jobs y los envíos productivos todavía no están conectados.
- La reserva de cuota y la creación del registro local deben ocurrir antes de llamar al proveedor externo.
- Un mensaje aceptado por el proveedor queda en `submitted` hasta que un webhook confirme la entrega.
- El ciclo de entrega reclama el mensaje, llama únicamente al adaptador Postmark y cierra su intento en las tablas propias.

### Validaciones

- `backend/tests/integrations/postmark/test_client.py`: 4 pruebas aprobadas.
- `backend/tests/services/postmark/test_service.py`: 4 pruebas aprobadas.
- `git diff --check`: aprobado.
- `20260826_220000_postmark_queue_quota` fue aplicada y verificada en Supabase; agregó las columnas de contenido y la RPC atómica de cola/cuota.
- `20260826_230000_postmark_delivery_attempts` fue aplicada y verificada en Supabase; las RPC quedaron protegidas y no se crearon registros de prueba.
- `20260826_235000_reconcile_postmark_core` fue aplicada y verificada en Supabase; confirmó las 11 tablas originales, `FORCE RLS` y el único registro pendiente del tenant maestro sin reejecutar el DDL inicial.

### Estado

La cola y el worker aislado fueron completados posteriormente; los pendientes actuales se mantienen en la entrada del 2026-08-27.

## [No publicado]

### Base de datos

- Se creó la migración nueva `supabase/migrations/20260812_130000_email_service_core.sql`.
- Se agregaron tablas propias para migración por tenant, dominios, planes, cuotas, plantillas, mensajes, intentos, eventos, webhooks y supresiones.
- Se agregaron columnas explícitas, constraints, índices, RLS y claves compuestas para impedir referencias cross-tenant.
- Se agregó el ledger `tenant_email_usage_events` para auditar reservas, liberaciones y consumo de cuota sin depender únicamente de contadores agregados.
- Se inicializó únicamente el tenant maestro `00000000-0000-0000-0000-000000000001` en estado `pending` y con la funcionalidad desactivada.
- No se modificaron tablas ni migraciones de Brevo o de prospección existentes.

### Documentación

- Se creó el plan general de migración completa de Brevo a un servicio central de correo.
- Se definió una implementación nueva e independiente, sin reutilizar código, contratos ni tablas de Brevo.
- Se estableció el tenant maestro `00000000-0000-0000-0000-000000000001` como primer tenant de implementación y validación.
- Se definió la migración progresiva, tenant por tenant.
- Se documentó que no habrá fallback automático ni mezcla de proveedores dentro del mismo tenant.
- Se documentó la separación física de la implementación en carpetas propias de integración, servicios, schemas y pruebas.
- Se definió que el nombre del proveedor no debe aparecer en vistas, configuraciones, respuestas API, errores ni textos visibles para tenants.
- Se estableció el uso prioritario de columnas explícitas, foreign keys, constraints e índices.
- Se restringió el uso de `metadata`, `json`, `jsonb`, `payload`, `config` y `settings` a datos crudos o realmente variables que no formen parte de la lógica de negocio.
- Se documentaron cuotas, estados, idempotencia, webhooks, inbound, dominios, plantillas, supresiones, observabilidad, rollback y eliminación final de Brevo.
- Se agregó este archivo para registrar los siguientes avances de la implementación.
- Se documentaron como fuentes oficiales de infraestructura el [Postmark Manual](https://postmarkapp.com/manual) y la [Postmark Developer Documentation](https://postmarkapp.com/developer).
- Se definió que el Manual guiará la creación de cuenta, servidores, dominios, DNS, streams, pruebas, tracking, webhooks, DMARC e inbound.
- Se definió que la Developer Documentation será la referencia para APIs, contratos, librerías, templates, dominios, mensajes, supresiones y webhooks.

### Validaciones

- Se revisó la documentación oficial de Postmark sobre dominios, Message Streams, Bulk API, plantillas, webhooks e inbound.
- Se revisó el acoplamiento actual de Brevo en backend, panel, SQL, métricas, cuotas, plantillas y procesamiento inbound.
- `git diff --check` pasó correctamente después de actualizar la documentación.

### Pendientes

- Confirmar la cuenta y el plan comercial de Postmark.
- Confirmar aprobación de Bulk API para la cuenta.
- Aplicar y verificar la migración nueva en la base de datos real.
- Implementar las carpetas y módulos propios de la integración.
- Definir los contratos API neutrales visibles para el panel.
- Implementar el piloto en el tenant maestro.
- Configurar y verificar el primer dominio remitente.
- Ejecutar pruebas de envío, cuotas, webhooks, rebotes, supresiones e inbound.
- Migrar los tenants restantes uno por uno.
- Retirar Brevo después de completar el checklist de eliminación y respaldo histórico.

## Formato para futuras entradas

```md
## [AAAA-MM-DD]

### Cambios

- ...

### Decisiones

- ...

### Validaciones

- ...

### Pendientes

- ...

### Riesgos

- ...
```
