# Changelog — Plan Postmark

Registro de avances, decisiones, validaciones y pendientes de la migración del correo de Talia.

## [2026-08-26]

### Cambios

- Se agregó el adaptador aislado `backend/app/integrations/postmark/` para llamadas HTTP al servicio de correo.
- Se agregaron contratos internos para mensajes y resultados individuales o batch.
- Se agregaron variables de configuración exclusivas del backend para tokens transaccional y broadcast, sin valores por defecto sensibles.
- El adaptador valida cuerpo, remitente, destinatario, asunto y el límite máximo de 500 mensajes por batch.
- Se agregó una migración nueva para conservar el contenido explícito del mensaje y reservar cuota con idempotencia en una transacción.
- Se agregó una migración de intentos de entrega para reclamar, cerrar y contabilizar mensajes Postmark de forma idempotente.

### Decisiones

- El adaptador no resuelve tenant, permisos, cuotas ni persistencia; esas reglas permanecerán en servicios de negocio separados.
- Los envíos batch conservan el resultado de cada destinatario aunque la respuesta HTTP sea exitosa.
- Postmark no importa, reutiliza ni comparte implementación con Brevo o SMTP; ambos proveedores permanecen completamente separados.
- El servicio Postmark tampoco se conectó todavía al panel ni a los jobs existentes.
- La reserva de cuota y la creación del registro local deben ocurrir antes de llamar al proveedor externo.
- Un mensaje aceptado por el proveedor queda en `submitted` hasta que un webhook confirme la entrega.
- El ciclo de entrega reclama el mensaje, llama únicamente al adaptador Postmark y cierra su intento en las tablas propias.

### Validaciones

- `backend/tests/integrations/postmark/test_client.py`: 4 pruebas aprobadas.
- `backend/tests/services/postmark/test_service.py`: 4 pruebas aprobadas.
- `git diff --check`: aprobado.
- `20260826_220000_postmark_queue_quota` fue aplicada y verificada en Supabase; agregó las columnas de contenido y la RPC atómica de cola/cuota.
- `20260826_230000_postmark_delivery_attempts` fue aplicada y verificada en Supabase; las RPC quedaron protegidas y no se crearon registros de prueba.

### Pendientes

- Crear servicio de negocio con tenant, dominio, cuota, idempotencia y persistencia en las tablas nuevas.
- Reconciliar el historial formal de migraciones de Supabase con las tablas ya existentes.
- Crear endpoints neutrales protegidos y webhooks autenticados.
- Configurar tokens y recursos reales de la cuenta de correo solo durante el piloto.

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
