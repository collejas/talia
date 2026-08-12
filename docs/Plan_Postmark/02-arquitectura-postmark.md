# Arquitectura objetivo con Postmark

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

Las migraciones nuevas se agregarán al directorio estándar de migraciones, pero crearán tablas Postmark propias. No se colocará lógica Postmark dentro de archivos Brevo ni dentro del servicio de correo legado.

## Principio de datos explícitos

El modelo Postmark debe guardar en columnas todos los datos que participen en consultas, filtros, ordenamiento, relaciones, cuotas, permisos, auditoría, reportes o lógica de negocio. Cada dato relevante debe poder indexarse y validarse directamente.

`metadata/jsonb` no será el modelo principal. Solo se permitirá para conservar datos crudos del proveedor o extensiones variables que no tengan uso frecuente. Antes de agregar un campo JSON se debe justificar por qué no corresponde una columna explícita.

## Abstracción visible para tenants

La arquitectura debe separar el nombre interno del proveedor de la interfaz del producto. El backend puede tener módulos y secretos específicos del proveedor, pero los contratos consumidos por el panel deben ser neutrales. El tenant verá únicamente configuración de correo, dominio de envío, remitente, cuota y estados de entrega.

No exponer el nombre del proveedor en rutas tenant-facing, nombres de propiedades JSON, errores, textos del panel, variables públicas ni documentación de ayuda para tenants.

## Cuenta y servidores

Usar una cuenta central de GEOACTIV y separar el tráfico por servidores/streams según el volumen y el aislamiento requerido.

Configuración inicial sugerida:

- servidor transaccional: invitaciones, confirmaciones, cotizaciones, notificaciones y correo operacional;
- servidor broadcast: prospección/campañas que cumplan la política de Postmark;
- servidor inbound: recepción y parseo de respuestas mediante Inbound Processing, obligatorio en la arquitectura nueva.

No crear un stream por tenant. Los tenants se aíslan en Talia mediante ownership, dominio, columnas explícitas de tenant, ledger y permisos. Los streams deben separar tipos de tráfico para proteger entregabilidad.

## Dominios personalizados

Postmark tiene Domains API a nivel de cuenta. El backend puede crear un dominio y obtener los datos de DKIM y Return-Path. El tenant debe publicar los DNS, salvo que Talia integre el proveedor DNS del tenant.

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
