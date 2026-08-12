# Changelog — Plan Postmark

Registro de avances, decisiones, validaciones y pendientes de la migración del correo de Talia.

## [No publicado]

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
- Diseñar y revisar las migraciones nuevas de base de datos.
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
