# Plan Maestro: Metodos WhatsApp en paralelo

Fecha: 2026-04-22

## Objetivo general

Diseñar e implementar un esquema de coexistencia para WhatsApp con dos proveedores:

- `twilio` para tenants existentes y operacion actual.
- `meta` para nuevos tenants y pruebas controladas.

La meta es correr ambos metodos en paralelo, validar el nuevo flujo en produccion controlada y, al final, suspender Twilio por configuracion sin eliminarlo.

## Principios de diseno

1. El proveedor de WhatsApp debe resolverse por tenant.
2. La configuracion debe vivir en el panel de `settings/tenants`.
3. La persistencia debe guardar trazabilidad del proveedor usado.
4. Twilio no se elimina durante la migracion.
5. El nuevo metodo debe ser compatible con el flujo actual de CRM, inbox, asistentes y automatizaciones.

## Alcance

### Base de datos

- Extender la configuracion del tenant para guardar el metodo de WhatsApp.
- Guardar credenciales y parametros por proveedor.
- Registrar en mensajes, eventos de entrega y auditoria el proveedor utilizado.
- Evitar que los nombres de campos sigan amarrando la operacion a Twilio cuando el provider sea Meta.

### Backend

- Introducir un resolvedor de provider por tenant.
- Separar el transporte de WhatsApp en adaptadores:
  - Twilio adapter
  - Meta Cloud API adapter
- Mantener el flujo de negocio actual:
  - recepcion de mensajes
  - persistencia
  - generacion de respuesta
  - envio
  - callbacks/status
- Hacer que los endpoints seleccionen el proveedor correcto sin duplicar logica de negocio.

### Frontend

- Agregar en `settings/tenants` el selector de metodo de WhatsApp.
- Mostrar campos especificos segun el provider elegido.
- Permitir editar tenants existentes sin romper su configuracion actual.
- Dejar visible el metodo activo y el estado de integracion.

## Diseno objetivo por capa

### 1. Capa de datos

#### Configuracion del tenant

Guardar una estructura por tenant similar a:

```json
{
  "whatsapp": {
    "provider": "twilio",
    "twilio": {
      "phone_number": "+521...",
      "account_sid_secret": "twilio.account_sid",
      "auth_token_secret": "twilio.auth_token"
    },
    "meta": {
      "phone_number_id_secret": "whatsapp.phone_number_id",
      "access_token_secret": "whatsapp.access_token",
      "app_secret_secret": "whatsapp.app_secret",
      "verify_token": "..."
    }
  }
}
```

#### Identificadores y trazabilidad

- Los mensajes deben guardar:
  - `provider`
  - `provider_message_id`
  - `provider_status`
  - `provider_error`
- La capa de entrega debe poder distinguir si el evento vino de Twilio o de Meta.
- Los nombres de columnas legacy pueden mantenerse temporalmente, pero la direccion final debe ser hacia campos genericos.

#### Compatibilidad con legado

- Conservar la estructura actual mientras se migra.
- Agregar campos nuevos en vez de romper los existentes.
- Preparar migraciones de backfill si alguna tabla depende de `twilio_message_sid`.

### 2. Capa backend

#### Resolucion de provider

- Resolver el provider por tenant antes de:
  - validar webhook
  - registrar mensaje entrante
  - enviar respuesta
  - registrar delivery status

#### Adapters

- `TwilioWhatsAppAdapter`
  - webhook actual
  - envio actual
  - indicadores actuales

- `MetaWhatsAppAdapter`
  - webhook JSON
  - firma `X-Hub-Signature-256`
  - envio por Graph API
  - manejo de estados y errores de Meta

#### Router y service

- El router de WhatsApp debe volverse un punto de entrada neutral.
- El service debe delegar a un adapter segun `provider`.
- La logica de negocio debe quedar comun:
  - deduplicacion
  - registro en CRM
  - generacion de respuesta
  - persistencia de salida

#### Runtime por tenant

- `tenant_runtime` debe leer:
  - provider activo
  - secretos de Twilio
  - secretos de Meta
  - numero origen o `phone_number_id`
  - verify token o app secret segun aplique

### 3. Capa frontend

#### Settings tenants

- Agregar selector:
  - `Twilio`
  - `Meta WhatsApp Cloud API`

- Si se elige Twilio:
  - mostrar campos de numero, account SID, auth token, validacion de firma.

- Si se elige Meta:
  - mostrar `phone_number_id`, `access_token`, `app_secret`, `verify_token`, y webhook callback URL.

#### UX de edicion

- Los tenants actuales deben abrir con `twilio` preseleccionado.
- Los tenants nuevos deben poder nacer con `meta` como default.
- Debe existir una indicacion clara del provider activo y si esta listo para produccion.

## Estrategia de migracion

### Fase 1

Preparar infraestructura de datos y runtime sin cambiar el comportamiento actual.

### Fase 2

Agregar soporte Meta en paralelo para un tenant nuevo de prueba.

### Fase 3

Validar envio, recepcion, estados, adjuntos y registros de conversacion.

### Fase 4

Mover tenants seleccionados a Meta.

### Fase 5

Suspender Twilio por configuracion para tenants migrados, manteniendo el codigo y datos historicos.

## Criterios de exito

1. Un tenant puede operar con Twilio sin cambios.
2. Un tenant nuevo puede operar con Meta sin afectar a Twilio.
3. El panel de tenants permite elegir provider y guardar credenciales.
4. El backend enruta correctamente segun el provider.
5. El inbox, CRM y automatizaciones siguen funcionando con ambos metodos.
6. Twilio se puede desactivar por tenant sin eliminar integraciones historicas.

## Riesgos principales

1. Acoplamiento historico a `twilio_message_sid`.
2. Diferencias en payloads entrantes entre Twilio y Meta.
3. Mensajes de estado y adjuntos con formatos distintos.
4. Duplicidad de envios durante la coexistencia.
5. Errores de configuracion en tenants editados manualmente.

## Resultado esperado

Una plataforma de WhatsApp multimetodo, controlada por tenant, con coexistencia segura, observabilidad y ruta de migracion gradual.
