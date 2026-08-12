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

## Decisiones iniciales

- Usar Postmark con una cuenta central de GEOACTIV.
- Contratar el plan que permita dominios de envío personalizados ilimitados si el número de tenants supera el límite del plan inferior.
- Mantener separación entre streams transaccionales y Broadcast.
- Mantener la cuota de cada tenant en PostgreSQL, no inferirla desde el consumo global de Postmark.
- Usar la API de Postmark desde backend; ninguna API key debe llegar al panel.
- Migrar primero un tenant piloto y retirar Brevo solo después de completar la verificación de paridad y el corte.

## Fuentes oficiales revisadas

- [Postmark pricing](https://postmarkapp.com/pricing/)
- [Bulk Email API](https://postmarkapp.com/developer/api/bulk-email)
- [Message Streams](https://postmarkapp.com/message-streams)
- [Domains API](https://postmarkapp.com/developer/api/domains-api)
- [Sender Signatures API](https://postmarkapp.com/developer/api/signatures-api)
- [Templates API](https://postmarkapp.com/developer/api/templates-api)
- [Webhooks overview](https://postmarkapp.com/developer/webhooks/webhooks-overview)
- [Inbound processing](https://postmarkapp.com/developer/user-guide/inbound)

