# Plan Postmark para Talia

Documentación de la migración completa de Brevo a Postmark.

## Objetivo

Que GEOACTIV opere el servicio de correo desde Talia para todos los tenants:

- Postmark será el único proveedor externo de correo.
- Cada tenant podrá enviar desde un dominio propio verificado.
- Talia administrará cuotas, plantillas, campañas, remitentes, estados y métricas.
- Se eliminarán dependencias de Brevo en backend, panel, base de datos, webhooks, jobs y configuración.

## Estado de este documento

Plan iniciado con la revisión del repositorio al 2026-08-12. El núcleo de tablas ya existe en Supabase, el tenant maestro ya fue probado y la creación de tenants ahora aprovisiona automáticamente la estructura operativa de correo en estado pendiente. La entrega Postmark ya usa `/email/batch` y puede agrupar hasta 500 mensajes, pero la preparación todavía debe terminar de aislarse en un worker de lotes para que no genere latencia ni presión sobre la API y Supabase. La verificación de dominio, activación por tenant y webhooks de métricas siguen siendo pasos explícitos antes de retirar el proveedor anterior.

## Orden de lectura

1. [Inventario actual](./00-inventario-actual.md)
2. [Plan de implementación](./01-plan-implementacion.md)
3. [Arquitectura objetivo](./02-arquitectura-postmark.md)
4. [Matriz Brevo/Postmark](./04-matriz-brevo-postmark.md)
5. [Seguridad y operación](./03-seguridad-y-operacion.md)
6. [Runbook de dominios por tenant](./05-runbook-dominio-tenant.md)
7. [Decisiones operativas y criterios](./06-decisiones-operativas-y-criterios.md)
8. [Sincronización Postmark por tenant](./07-sincronizacion-postmark-por-tenant.md)
9. [Changelog](./CHANGELOG.md)

## Decisiones iniciales

- Usar Postmark con una cuenta central de GEOACTIV.
- Crear un servidor Postmark independiente para cada tenant dentro de la cuenta central de GEOACTIV.
- Mantener para cada tenant su propio Server API Token, streams, webhooks, métricas, supresiones y configuración de inbound.
- Contratar el plan que permita dominios de envío personalizados ilimitados si el número de tenants supera el límite del plan inferior.
- Mantener separación entre los streams transaccionales y Broadcast de cada tenant.
- Mantener la cuota de cada tenant en PostgreSQL, no inferirla desde el consumo global de Postmark.
- La cuota mensual efectiva de cada tenant la define el tenant maestro según el contrato comercial y se administra desde la configuración comercial del tenant; la cola Postmark sólo ejecuta esa regla de forma atómica.
- Usar la API de Postmark desde backend; ninguna API key debe llegar al panel.
- Construir Postmark con código, contratos y tablas propias; no reutilizar la implementación de Brevo.
- Mantener la implementación en carpetas propias de Postmark, separadas del código de Brevo y del servicio de correo anterior siempre que la arquitectura lo permita.
- Implementar primero en el tenant maestro `00000000-0000-0000-0000-000000000001`.
- Migrar los demás tenants uno por uno y retirar Brevo solo después de completar la verificación de paridad y el corte.
- Modelar la información Postmark en columnas explícitas, con foreign keys, constraints e índices adecuados.
- Evitar `metadata`, `json`, `jsonb`, `payload`, `config` y estructuras similares para datos de negocio; usarlos solo para información cruda, opcional y no consultada frecuentemente.
- No mostrar el nombre del proveedor en vistas, configuraciones, respuestas API, errores ni textos visibles para tenants.
- No eliminar tablas históricas de Brevo hasta demostrar que ningún reporte, auditoría, función SQL, job o migración activa depende de ellas y conservar un respaldo.
- Sincronizar por tenant la información histórica que Postmark exponga mediante API y recibir en tiempo real los eventos mediante webhooks; el backend debe conservar checkpoints, idempotencia y auditoría.
- Usar Postmark como fuente de verdad para eventos y estado del proveedor, y Talia como fuente de verdad para atribución de negocio, cuota contratada y reglas operativas.
- Conservar en Talia el historial local completo: la sincronización histórica nunca eliminará datos porque hayan expirado de la retención de Postmark.

## Decisión de rendimiento y lotes Postmark

El objetivo operativo es que la acción del usuario sólo cree y encole el lote;
la preparación y la entrega deben continuar en segundo plano. Postmark debe
recibir un payload completo de hasta 500 objetos por llamada `/email/batch`, no
una secuencia de llamadas individuales separadas cinco segundos.

La arquitectura aprobada es:

- `talia-api.service`: crea el lote, valida permisos y encola el trabajo;
- worker de preparación Postmark: construye y persiste bloques completos de hasta 500;
- `talia-email-worker`: reclama bloques `ready` y llama `/email/batch`;
- worker de webhooks/eventos: persiste y procesa entregas, rebotes, quejas, aperturas, clics y bajas;
- `talia-whatsapp-worker`: permanece independiente y no comparte la concurrencia de correo.

La concurrencia se controla por batch completo. No se usará la concurrencia para
disparar mensajes individuales. Brevo conservará sus límites y worker propios.
El sistema debe aplicar backpressure cuando aumenten CPU, memoria, conexiones
de base de datos, errores o profundidad de cola, sin borrar ni duplicar lotes.

La experiencia esperada es que el panel responda rápidamente con el lote en
estado `preparando`; la latencia de renderizado, persistencia y entrega queda
fuera de la solicitud HTTP y puede observarse mediante el progreso del lote.

## Alta automática de tenants

Desde la migración `20260829_120000_provision_postmark_for_new_tenants.sql`, cada tenant nuevo recibe automáticamente:

- un registro en `tenant_email_migrations` con estado `pending` y `feature_enabled=false`;
- el plan `included_10000` con 10,000 mensajes mensuales;
- el periodo mensual correspondiente en `tenant_email_usage_periods`.

El aprovisionamiento se ejecuta mediante un trigger de PostgreSQL sobre `organizaciones`, por lo que cubre altas administrativas, checkout y futuras rutas de creación. No registra dominios, no define remitentes y no habilita envíos. El tenant debe configurar su dominio y DNS, y el tenant maestro debe aprobar la activación.

El trigger solo aprovisiona la estructura interna de Talia. La creación del servidor Postmark, sus streams, webhooks y credenciales se ejecutará desde backend mediante la Account API y tareas administrativas seguras. Los tokens no se guardarán en la base de datos ni llegarán al panel.

La provisión externa del servidor será automática cuando la suscripción quede confirmada como pagada o cuando el tenant maestro active manualmente al tenant. Ambos caminos llamarán al mismo servicio idempotente de backend; iniciar un checkout no crea servidores. Un fallo deja el registro en `failed` para reintento y una suspensión bloquea envíos sin borrar el servidor ni su historial.

## Modelo de proveedor por tenant

GEOACTIV operará una cuenta maestra de Postmark y Talia será la capa de administración para sus clientes. Cada tenant tendrá un servidor Postmark propio dentro de esa cuenta. El cliente no necesitará una cuenta de Postmark ni acceso al panel del proveedor: configurará su dominio, remitente, DNS, cuotas, plantillas, campañas, supresiones y métricas desde Talia.

El aislamiento mínimo por tenant será:

- servidor Postmark e identificador externo propios;
- Server API Token propio, administrado como secreto de backend;
- stream transaccional propio;
- stream Broadcast propio;
- configuración de webhooks e inbound propia;
- dominios, remitentes y Return-Path propios;
- supresiones y métricas propias.

## Webhooks por tenant

Cada servidor tendrá configurados desde backend sus webhooks de entrega, rebote, queja, apertura, clic, cambio de suscripción e inbound. Estos eventos actualizarán el estado y las métricas del tenant en Talia. La tabla `tenant_email_webhook_receipts` conservará la recepción idempotente para tolerar reintentos de Postmark; ningún evento se procesará confiando únicamente en un `tenant_id` enviado por el proveedor.

Postmark no proporciona actualmente firma HMAC para estos webhooks. La protección será HTTPS, Basic Auth, validación del payload y allowlist de los rangos IP de Postmark cuando sea compatible con el firewall. La deduplicación usará `X-PM-Webhook-Trace-Id` junto con `MessageID` y el tipo de evento. La verificación y el estado se controlarán por evento, porque Postmark puede pausar un tipo que falle persistentemente sin detener los demás.

Un servidor Postmark separado aísla la operación, las estadísticas y la configuración del cliente. No implica por sí mismo una IP dedicada: la disponibilidad de IP compartida o dedicada depende de Postmark y del volumen contratado.

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
- [Messages API](https://postmarkapp.com/developer/api/messages-api)
- [Bounce API](https://postmarkapp.com/developer/api/bounce-api)
- [Stats API](https://postmarkapp.com/developer/api/stats-api)
- [Sender Signatures API](https://postmarkapp.com/developer/api/signatures-api)
- [Templates API](https://postmarkapp.com/developer/api/templates-api)
- [Webhooks overview](https://postmarkapp.com/developer/webhooks/webhooks-overview)
- [Inbound processing](https://postmarkapp.com/developer/user-guide/inbound)
- [Postmark Manual](https://postmarkapp.com/manual)
- [Postmark Developer Documentation](https://postmarkapp.com/developer)
