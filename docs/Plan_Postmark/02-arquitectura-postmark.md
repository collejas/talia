# Arquitectura objetivo con Postmark

## Guías oficiales para crear la infraestructura

La infraestructura se construirá siguiendo dos fuentes oficiales:

- [Postmark Manual](https://postmarkapp.com/manual): guía de cuenta, servidores, dominios, DKIM, Return-Path, Message Streams, pruebas, tracking, webhooks, DMARC e inbound.
- [Postmark Developer Documentation](https://postmarkapp.com/developer): referencia de API, librerías, templates, mensajes, dominios, streams, webhooks, supresiones y procesamiento inbound.

La implementación de Talia usará la REST API desde backend para obtener respuestas, MessageID, códigos de error, batch sending y control explícito de reintentos. SMTP no será la base de la nueva integración porque no ofrece el mismo nivel de control para lotes, respuestas individuales, plantillas e idempotencia.

## Principio de aislamiento de la migración

Postmark tendrá su propia implementación y su propio modelo de datos. Brevo no será un adaptador de compatibilidad ni una dependencia del nuevo código. La referencia a Brevo en este plan sirve para localizar lo que debe migrarse y retirarse, no para reutilizar su arquitectura.

El despliegue inicial se limitará al tenant maestro `00000000-0000-0000-0000-000000000001`. La habilitación del resto de tenants será progresiva y con una marca explícita de migración por tenant.

## Separación física de módulos

La implementación debe vivir en carpetas propias, separadas del código legado:

```text
backend/app/integrations/postmark/
backend/app/services/postmark/
backend/app/schemas/postmark/
backend/tests/integrations/postmark/
backend/tests/services/postmark/
frontend/panel/src/lib/email-service/
```

### Lotes de campañas

El tenant puede seleccionar hasta 10,000 prospectos en una campaña. Talia conserva un registro individual por destinatario con su tenant, lote, plantilla, estado e idempotencia; Postmark recibe esos registros en llamadas de hasta 500 mensajes mediante `/email/batch`. El worker separa `transactional` y `broadcast`, respeta cada stream y aplica un corte adicional por tamaño aproximado de 45 MiB para no acercarse al límite de 50 MiB. Los resultados individuales de Postmark son la fuente para aceptar o rechazar cada destinatario.

### Preparación asíncrona y envío sin latencia visible

La preparación de una campaña no debe ejecutarse dentro de la solicitud HTTP que
inicia el envío. La API debe crear el lote, registrar sus destinatarios, reservar
la cuota y encolar un trabajo; después debe responder al panel sin esperar a que
se rendericen los mensajes ni a que Postmark acepte el envío.

El proceso se divide en dos workers y dos estados distintos:

```text
Panel/API
  -> crea lote y destinatarios
  -> encola trabajo de preparación
  -> responde inmediatamente

Worker de preparación Postmark
  -> carga una vez tenant, dominio, remitente, stream y plantilla
  -> prepara el contenido fuera de la API
  -> agrupa en bloques de máximo 500
  -> marca cada bloque como ready

Worker de entrega Postmark
  -> reclama un bloque ready completo
  -> llama una vez a /email/batch
  -> persiste el resultado individual de cada elemento

Webhook/worker de eventos
  -> recibe Delivery, Bounce, Open, Click, SpamComplaint y SubscriptionChange
  -> actualiza eventos, supresiones y métricas de forma asíncrona
```

El límite de 500 es el tamaño máximo de una llamada a Postmark, no una razón
para ejecutar 500 tareas individuales. Si una campaña tiene 1,200 destinatarios,
debe producir tres bloques: 500, 500 y 200. Cada bloque debe pertenecer a un
solo tenant, tipo de mensaje y Message Stream. Nunca se debe mezclar
`broadcast` con `transactional`.

La preparación debe evitar consultas repetidas por destinatario. El worker debe
obtener una sola vez el contexto invariable del lote y utilizar consultas o
escrituras agrupadas cuando existan en el repositorio. El contenido variable de
cada destinatario sí debe conservarse individualmente, pero no debe provocar
una nueva resolución de tenant, cuota, dominio, stream, plantilla o secreto en
cada iteración.

El bloque preparado debe persistir como entidad operativa con columnas
explícitas, al menos: `tenant_id`, `campaign_batch_id`, `provider`,
`message_kind`, `message_stream`, `sequence_number`, `message_count`, `status`,
`prepared_at`, `claimed_at`, `submitted_at`, `attempt_count` y `last_error`.
El contenido o snapshot de cada mensaje debe relacionarse con su registro local
de envío; no se debe depender de reconstruir el payload durante la llamada
externa.

Estados mínimos del bloque:

```text
created -> preparing -> ready -> sending -> submitted
                                      \-> failed / retry_wait
```

`submitted` significa que Postmark aceptó individualmente el mensaje. La
entrega real continúa confirmándose mediante webhooks y puede terminar en
`delivered`, `bounced`, `complained`, `unsubscribed` o un estado equivalente.

La preparación y la entrega deben ejecutarse fuera de `talia-api.service` en
workers separados o procesos aislados. El worker de Postmark debe tener un
límite de batches simultáneos, no una concurrencia ilimitada de mensajes. La
configuración inicial recomendada es una o dos llamadas `/email/batch`
simultáneas por servidor, con backoff ante `429`, timeouts o errores de red.
Brevo y WhatsApp conservan sus propios workers, tamaños de lote y límites; no
se debe reutilizar esta concurrencia para esos proveedores.

Este diseño elimina la latencia visible en el panel, limita el impacto sobre
CPU, memoria y conexiones de Supabase, y permite pausar la entrega sin perder
los destinatarios ya preparados.

Las migraciones nuevas se agregarán al directorio estándar de migraciones, pero crearán tablas Postmark propias. No se colocará lógica Postmark dentro de archivos Brevo ni dentro del servicio de correo legado.

## Principio de datos explícitos

El modelo Postmark debe guardar en columnas todos los datos que participen en consultas, filtros, ordenamiento, relaciones, cuotas, permisos, auditoría, reportes o lógica de negocio. Cada dato relevante debe poder indexarse y validarse directamente.

`metadata/jsonb` no será el modelo principal. Solo se permitirá para conservar datos crudos del proveedor o extensiones variables que no tengan uso frecuente. Antes de agregar un campo JSON se debe justificar por qué no corresponde una columna explícita.

## Abstracción visible para tenants

La arquitectura debe separar el nombre interno del proveedor de la interfaz del producto. El backend puede tener módulos y secretos específicos del proveedor, pero los contratos consumidos por el panel deben ser neutrales. El tenant verá únicamente configuración de correo, dominio de envío, remitente, cuota y estados de entrega.

No exponer el nombre del proveedor en rutas tenant-facing, nombres de propiedades JSON, errores, textos del panel, variables públicas ni documentación de ayuda para tenants.

## Cuenta y servidores

Usar una cuenta central de GEOACTIV y crear un servidor Postmark independiente para cada tenant. El servidor es la unidad de aislamiento operativo del cliente: tiene su propio identificador, token, estadísticas, configuración de webhooks y dirección inbound.

### Ciclo de vida de provisión

El servidor se crea automáticamente después de un pago confirmado o de una activación manual realizada por el tenant maestro. Ambos eventos usan el mismo servicio de backend y no se ejecutan dentro de la transacción de alta o checkout: se encolan como tarea idempotente para soportar reintentos y fallos temporales de Postmark.

Un tenant puede estar comercialmente activo mientras su servidor se encuentra `pending`, `provisioning` o `failed`; en esos estados no se habilitan envíos. La suspensión cambia el servidor a un estado no enviable, pero no lo elimina. La reactivación reutiliza el servidor existente.

Dentro de cada servidor se separará el tráfico mediante streams propios:

- stream transaccional: invitaciones, confirmaciones, cotizaciones, notificaciones y correo operacional;
- stream Broadcast: prospección y campañas permitidas;
- stream inbound: recepción y parseo de respuestas, cuando el tenant tenga habilitado ese flujo.

No se compartirán servidores, tokens, streams Broadcast ni supresiones entre tenants. El servidor separado aísla la configuración y las métricas del cliente; no debe interpretarse como garantía de IP dedicada, porque Postmark puede operar con pools compartidos según el plan y el volumen.

## Dominios personalizados

Postmark tiene Domains API a nivel de cuenta. El backend puede crear un dominio, asociarlo al tenant y obtener los datos de DKIM y Return-Path. La asociación tenant-dominio-servidor debe persistirse en Talia y validarse antes de cada envío. El tenant debe publicar los DNS, salvo que Talia integre el proveedor DNS del tenant.

El `From` de cada mensaje debe pertenecer a un dominio o sender signature confirmado. El dominio y el remitente seleccionado se resuelven desde PostgreSQL, nunca desde un valor libre enviado por el navegador.

## Plantillas

Hay dos opciones:

1. Plantillas locales renderizadas por Talia y HTML/texto enviados a Postmark.
2. Plantillas Postmark por servidor, con alias y `TemplateModel`.

Recomendación: conservar el catálogo y el versionado de negocio en Talia. Usar plantillas Postmark para layouts repetibles, pero guardar el snapshot de contenido usado por cada envío cuando la auditoría lo necesite.

## Envío

### Transaccional

Usar API de email o batch con stream transaccional. Cada mensaje debe ser individualizado y tener su propio registro local.

### Broadcast

Usar Broadcast Message Stream. Para grandes campañas, usar Bulk API solo después de obtener aprobación de Postmark. Para envíos individualizados en lote, usar batch/batchWithTemplates y revisar cada resultado de la respuesta.

### Metadata técnica opcional

Si Postmark requiere metadata de transporte para correlación, enviar únicamente identificadores técnicos mínimos. La fuente de verdad será siempre la tabla nueva y sus columnas; esta metadata no sustituye columnas ni se usará como filtro principal:

```json
{
  "tenant_id": "uuid",
  "envio_id": "uuid",
  "campana_id": "uuid",
  "batch_id": "uuid"
}
```

El `MessageID` de Postmark es la correlación principal entre API, webhook y registro local.

## Flujo de envío

```text
Panel/API
  -> autorización tenant + validación de dominio
  -> reserva atómica de cuota
  -> registro local del envío
  -> cola/worker
  -> Postmark API
  -> MessageID
  -> webhook Delivery/Bounce/Open/Click/Spam/Subscription
  -> ledger + métricas + supresiones
```

### Separación temporal en prospección

El correo de prospección tiene dos etapas distintas y ambas deben respetar el
contrato operativo:

1. `prospeccion_contact_sender` prepara y encola el mensaje localmente.
2. `postmark-worker` reclama la cola y realiza la llamada real a Postmark.

La separación mínima de la campaña no se considera cumplida sólo por espaciar
la cola local. Antes de la llamada real a Postmark, el worker obtiene la reserva
transaccional compartida de `organizacion_id + canal` mediante
`reserve_prospeccion_envio_dispatch`. El `MessageID` interno de la cola no es
aceptación del proveedor; `proveedor_aceptado_en` sólo se completa con el ID
externo devuelto por Postmark.

## Flujo de dominio

```text
Tenant registra dominio
  -> Talia crea dominio en Postmark
  -> Postmark devuelve DKIM/Return-Path
  -> tenant publica DNS
  -> Talia verifica
  -> dominio habilitado
  -> prueba controlada
  -> dominio disponible para campañas
```

## Límites que deben considerarse

- El plan Platform de Postmark publica dominios de envío personalizados ilimitados; confirmar el plan contratado y condiciones comerciales antes de provisionar producción.
- Un servidor tiene límites de streams y plantillas según el plan/documentación; no diseñar un stream por tenant.
- Las llamadas batch tienen límite de 500 mensajes y 50 MB.
- Postmark puede devolver HTTP 200 con errores individuales en operaciones batch.
- El límite comercial del tenant lo impone Talia, no Postmark.
- La cuota mensual comercial se configura por el tenant maestro según lo contratado. La programación de prospección no debe aplicar el límite diario de Brevo a un tenant habilitado en Postmark.
