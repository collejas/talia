# Plan tecnico de implementacion: WhatsApp Twilio + Meta

Fecha: 2026-04-22

## Objetivo

Convertir el plan maestro en una hoja de trabajo tecnica, indicando:

- archivos objetivo;
- cambios por capa;
- orden de implementacion;
- criterios de validacion.

## 1. Base de datos

### Objetivo

Hacer que la configuracion de WhatsApp viva por tenant y soporte multiples proveedores.

### Archivos y migraciones objetivo

- `supabase/migrations/`
- `supabase/migrations/*whatsapp*.sql`
- funciones/rpcs relacionadas con WhatsApp en:
  - `supabase/migrations/20251220_*.sql`
  - `supabase/migrations/20260304_*.sql`
  - `supabase/migrations/20261005_*.sql`

### Cambios necesarios

1. Agregar un bloque de configuracion por tenant para WhatsApp.
2. Guardar `provider` con valores:
   - `twilio`
   - `meta`
3. Guardar secretos o referencias por provider.
4. Agregar trazabilidad generica en mensajes:
   - `provider`
   - `provider_message_id`
   - `provider_status`
   - `provider_error`
5. Revisar las funciones que hoy usan `twilio_message_sid`.

### Nota tecnica

No conviene eliminar de inmediato `twilio_message_sid`. Lo correcto es:

- mantener compatibilidad;
- agregar campos nuevos;
- migrar lectura/escritura por fases.

### Criterio de salida

- un tenant puede declararse `twilio` o `meta`;
- los mensajes pueden registrar el proveedor usado;
- el inbox y el CRM siguen consultando historial sin romperse.

## 2. Backend

### Objetivo

Separar el transporte WhatsApp de la logica de negocio.

### Archivos objetivo principales

- `backend/app/channels/whatsapp/service.py`
- `backend/app/channels/whatsapp/router.py`
- `backend/app/channels/whatsapp/deps.py`
- `backend/app/channels/whatsapp/schemas.py`
- `backend/app/channels/whatsapp/routing.py`
- `backend/app/services/tenant_runtime.py`
- `backend/app/services/storage.py`
- `backend/app/services/twilio.py`
- `backend/app/repositories/crm.py`
- `backend/app/core/config.py`

### Cambios funcionales

#### A. Resolver provider por tenant

- Leer `whatsapp.provider` desde configuracion del tenant.
- Resolver provider en tiempo de ejecucion antes de:
  - validar webhook;
  - registrar mensaje;
  - enviar respuesta;
  - registrar estados.

#### B. Crear adaptadores por proveedor

Propuesta:

- `backend/app/channels/whatsapp/providers/twilio.py`
- `backend/app/channels/whatsapp/providers/meta.py`
- `backend/app/channels/whatsapp/providers/base.py`

Responsabilidades:

- normalizar payload de entrada;
- enviar respuestas;
- interpretar estados;
- reportar errores.

#### C. Reescribir el router como punto neutral

El router no debe asumir Twilio como proveedor unico.

- `POST /whatsapp/webhook`
- `POST /whatsapp/status`
- `POST /whatsapp/fallback`

deben seleccionar la logica correcta segun el provider del tenant.

#### D. Generalizar schemas

`WhatsAppIncomingMessage` y `WhatsAppStatusCallback` deben poder representar:

- payload Twilio;
- payload Meta Cloud API.

#### E. Ajustar storage y CRM

- `storage.register_whatsapp_message(...)` debe persistir provider.
- `storage.record_delivery_event(...)` debe dejar de depender unicamente de Twilio.
- `CRMRepository.get_message_by_twilio_sid(...)` debe convivir con un equivalente generico o con una ruta de compatibilidad.

### Archivos de apoyo que casi seguro se tocaran

- `backend/app/main.py`
  - si se agregan rutas nuevas o registracion de adapters.
- `backend/tests/channels/test_whatsapp_service.py`
- `backend/tests/channels/test_whatsapp_webhook.py`
- `backend/tests/services/test_storage_channels.py`
- `backend/tests/services/test_whatsapp_followups.py`

### Cambios de configuracion

En `backend/app/core/config.py`:

- agregar modelo de config por provider;
- conservar `TWILIO_*`;
- agregar `META_*` o `WHATSAPP_META_*`;
- permitir default por tenant nuevo.

En `backend/app/services/tenant_runtime.py`:

- resolver runtime de Twilio;
- resolver runtime de Meta;
- retornar una estructura comun para WhatsApp.

### Criterio de salida

- tenants Twilio siguen operando;
- un tenant Meta puede enviar y recibir mensajes;
- la logica de negocio no se duplica.

## 3. Frontend

### Objetivo

Habilitar la configuracion del provider desde `settings/tenants`.

### Archivos objetivo probables

La UI de tenants no se ubico aun en este turno, pero el ajuste deberia caer en el modulo de settings de tenants dentro de:

- `frontend/panel/src/app/`
- `frontend/panel/src/components/settings/`
- `frontend/panel/src/lib/settings/`

### Cambios funcionales

1. Agregar selector de provider:
   - `Twilio`
   - `Meta WhatsApp Cloud API`
2. Mostrar campos condicionales segun provider.
3. Marcar el provider actual del tenant.
4. Permitir crear tenants nuevos con default `meta`.
5. Mantener tenants existentes con default `twilio`.

### Campos sugeridos por provider

#### Twilio

- `phone_number`
- `account_sid`
- `auth_token`
- `phone_number_sid`
- `validate_signatures`

#### Meta

- `phone_number_id`
- `access_token`
- `app_secret`
- `verify_token`
- `graph_api_version`

### Criterio de salida

- desde la pantalla de tenants se puede configurar el metodo;
- el formulario valida campos requeridos por provider;
- el tenant queda listo para el backend sin editar archivos manualmente.

## 4. Secuencia real de trabajo

### Paso 1

Definir el contrato de datos y el nombre final de los campos.

### Paso 2

Crear migraciones y compatibilidad de persistencia.

### Paso 3

Introducir adapters de backend sin cambiar el comportamiento de Twilio.

### Paso 4

Agregar Meta como proveedor paralelo para un tenant piloto.

### Paso 5

Actualizar la UI de `settings/tenants`.

### Paso 6

Hacer pruebas end to end con ambos providers.

### Paso 7

Migrar tenants por etapas.

### Paso 8

Suspender Twilio por configuracion en tenants migrados.

## 5. Riesgos tecnicos

1. Dependencia historica de nombres Twilio en BD y logs.
2. Payloads distintos entre Twilio y Meta.
3. Duplicacion de mensajes durante coexistencia.
4. Configuracion incompleta de secrets por tenant.
5. UI que exponga campos incorrectos por provider.

## 6. Resultado esperado

Al terminar esta implementacion:

- Twilio seguira disponible para tenants viejos;
- Meta funcionara para tenants nuevos o migrados;
- la configuracion se administrara desde el panel;
- el backend elegira el provider por tenant;
- Twilio podra quedar suspendido por configuracion sin borrar soporte historico.
