# Plan Postmark para Talia

Documentación de la migración completa de Brevo a Postmark.

## Objetivo

Que GEOACTIV opere el servicio de correo desde Talia para todos los tenants:

- Postmark será el único proveedor externo de correo.
- Cada tenant podrá enviar desde un dominio propio verificado.
- Talia administrará cuotas, plantillas, campañas, remitentes, estados y métricas.
- Se eliminarán dependencias de Brevo en backend, panel, base de datos, webhooks, jobs y configuración.

## Estado de este documento

Plan inicial basado en la revisión del repositorio al 2026-08-12. No se ha modificado todavía el código ni se ha aplicado una migración de base de datos.

## Orden de lectura

1. [Inventario actual](./00-inventario-actual.md)
2. [Plan de implementación](./01-plan-implementacion.md)
3. [Arquitectura objetivo](./02-arquitectura-postmark.md)
4. [Matriz Brevo/Postmark](./04-matriz-brevo-postmark.md)
5. [Seguridad y operación](./03-seguridad-y-operacion.md)
6. [Runbook de dominios por tenant](./05-runbook-dominio-tenant.md)
7. [Decisiones operativas y criterios](./06-decisiones-operativas-y-criterios.md)
8. [Changelog](./CHANGELOG.md)

## Decisiones iniciales

- Usar Postmark con una cuenta central de GEOACTIV.
- Contratar el plan que permita dominios de envío personalizados ilimitados si el número de tenants supera el límite del plan inferior.
- Mantener separación entre streams transaccionales y Broadcast.
- Mantener la cuota de cada tenant en PostgreSQL, no inferirla desde el consumo global de Postmark.
- Usar la API de Postmark desde backend; ninguna API key debe llegar al panel.
- Construir Postmark con código, contratos y tablas propias; no reutilizar la implementación de Brevo.
- Mantener la implementación en carpetas propias de Postmark, separadas del código de Brevo y del servicio de correo anterior siempre que la arquitectura lo permita.
- Implementar primero en el tenant maestro `00000000-0000-0000-0000-000000000001`.
- Migrar los demás tenants uno por uno y retirar Brevo solo después de completar la verificación de paridad y el corte.
- Modelar la información Postmark en columnas explícitas, con foreign keys, constraints e índices adecuados.
- Evitar `metadata`, `json`, `jsonb`, `payload`, `config` y estructuras similares para datos de negocio; usarlos solo para información cruda, opcional y no consultada frecuentemente.
- No mostrar el nombre del proveedor en vistas, configuraciones, respuestas API, errores ni textos visibles para tenants.
- No eliminar tablas históricas de Brevo hasta demostrar que ningún reporte, auditoría, función SQL, job o migración activa depende de ellas y conservar un respaldo.

## Decisión de implementación aprobada

La migración será una implementación aislada e independiente de Postmark. Brevo no será la base del nuevo diseño: no se copiarán sus servicios, contratos, tablas ni nombres de proveedor como modelo de negocio.

El tenant maestro `00000000-0000-0000-0000-000000000001` será el primer tenant habilitado porque es el dueño de la aplicación. Después se hará una migración controlada tenant por tenant, con evidencia de envío, dominios, cuotas, webhooks, métricas e inbound antes de avanzar.

Durante la migración solo puede existir una diferencia operativa: los tenants todavía no migrados seguirán atendidos por el sistema anterior y los tenants migrados por Postmark. No habrá fallback entre proveedores, mezcla de proveedores dentro del mismo tenant ni código compartido nuevo. Brevo se deshabilitará al terminar la migración de todos los tenants. El código y las tablas exclusivas de Brevo se retirarán después de la verificación final; los datos históricos se respaldarán y solo se eliminarán cuando no tengan valor operativo, legal, de auditoría o analítico.

## Regla de modelado de datos

Toda información que se consulte, filtre, ordene, relacione, valide, audite, reporte o use en permisos y lógica de negocio debe existir como columna explícita. El diseño debe priorizar consultas rápidas, índices eficientes, integridad referencial y aislamiento por tenant.

No se deben esconder datos estructurales dentro de `metadata`, `json`, `jsonb`, `payload`, `config`, `settings` o campos equivalentes. Solo se permitirán, con justificación documentada, para datos crudos del proveedor, extensiones realmente variables o información que no se consulte frecuentemente.

## Regla de ocultamiento del proveedor

El proveedor maestro de correo no debe ser identificable por ningún tenant. Las vistas, formularios, configuraciones, nombres de campos, respuestas JSON, mensajes de error, notificaciones, documentación de ayuda y bundles del panel deben usar terminología neutral: “Correo”, “Servicio de correo”, “Dominio de envío”, “Remitente”, “Cuota” y “Estado de entrega”.

El nombre técnico del proveedor solo puede existir en código backend, secretos, tareas internas de plataforma y logs técnicos restringidos. No debe enviarse al navegador ni aparecer en endpoints, payloads o errores tenant-facing.

## Estructura física prevista

La implementación nueva se organizará, como mínimo, en espacios propios:

- `backend/app/integrations/postmark/` para cliente API, dominios, plantillas, envío, webhooks y normalización de respuestas;
- `backend/app/services/postmark/` para reglas de negocio de cuotas, dominios, campañas y mensajes;
- `backend/app/schemas/postmark/` para contratos internos de la integración;
- `backend/tests/integrations/postmark/` y `backend/tests/services/postmark/` para pruebas;
- `frontend/panel/src/lib/email-service/` para clientes y tipos neutrales del panel, sin exponer el nombre del proveedor;
- `supabase/migrations/` con migraciones nuevas y tablas propias, sin reutilizar tablas de Brevo.

Los nombres exactos podrán ajustarse al patrón final del repositorio, pero Postmark no se implementará dentro de `brevo.py`, `email.py`, `brevo_quota.py`, `brevo_templates.py` ni dentro de otro módulo legado.

## Fuentes oficiales revisadas

- [Postmark pricing](https://postmarkapp.com/pricing/)
- [Bulk Email API](https://postmarkapp.com/developer/api/bulk-email)
- [Message Streams](https://postmarkapp.com/message-streams)
- [Domains API](https://postmarkapp.com/developer/api/domains-api)
- [Sender Signatures API](https://postmarkapp.com/developer/api/signatures-api)
- [Templates API](https://postmarkapp.com/developer/api/templates-api)
- [Webhooks overview](https://postmarkapp.com/developer/webhooks/webhooks-overview)
- [Inbound processing](https://postmarkapp.com/developer/user-guide/inbound)
