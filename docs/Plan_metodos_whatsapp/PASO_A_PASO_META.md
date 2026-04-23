# Paso a paso: crear un tenant piloto Meta WhatsApp Cloud API

Fecha: 2026-04-22

Este documento describe el flujo exacto para crear un tenant nuevo en TalIA y conectarlo a WhatsApp Cloud API de Meta sin afectar los tenants que siguen usando Twilio.

## Escenario recomendado

- `Tal-IA Geoactiv`, `Geoactiv` y `Grupo Gran Peñon` se quedan en Twilio.
- Creas un tenant nuevo exclusivamente para pruebas con Meta.
- Ese tenant usa tu numero ya aprobado en WhatsApp Cloud API.

## Antes de empezar

Ten a la mano:

- acceso a `https://talia.mx/settings/tenants`
- acceso a `Meta Developers`
- acceso a `Meta Business Settings`
- el numero de WhatsApp que ya aprobaste en Meta

## Paso 1. Crear el tenant en TalIA

Ruta:

- `https://talia.mx/settings/tenants`

Vista:

- tarjeta `Crear tenant + admin`

Campos a llenar:

- `Nombre del tenant`
- `Alias webchat` si lo vas a usar
- `Provider WhatsApp` = `Meta WhatsApp Cloud API`
- datos generales del tenant
- datos del admin

Resultado esperado:

- se crea el tenant nuevo
- el backend deja `whatsapp.provider = meta` por defecto

## Paso 2. Abrir el tenant recien creado

Ruta:

- `https://talia.mx/settings/tenants/{tenantId}`

Busca la pestaña o seccion:

- `WhatsApp`

## Paso 3. Obtener el `Phone Number ID` en Meta

En Meta:

- entra a `Meta Developers`
- abre tu app
- entra al producto `WhatsApp`
- ve a `API Setup` o `Getting Started`

Copia:

- `Phone Number ID`

En TalIA pega en:

- `whatsapp.meta.phone_number_id`

## Paso 4. Obtener el `Access Token`

En Meta:

- entra a `Meta Business Settings`
- abre `Users`
- abre `System Users`
- genera o asigna un token con permisos para WhatsApp

Copia:

- `Access Token`

En TalIA pega en:

- `meta.whatsapp.page_access_token`

## Paso 5. Obtener el `App Secret`

En Meta:

- entra a `Meta Developers`
- abre tu app
- entra a `Settings`
- abre `Basic`
- localiza `App Secret`

Copia:

- `App Secret`

En TalIA pega en:

- `meta.whatsapp.app_secret`

## Paso 6. Definir el `Verify Token`

Este dato lo defines tu.

Usa un valor largo y dificil de adivinar, por ejemplo:

- una frase aleatoria
- una cadena de 12 a 24 caracteres
- algo que no reutilices en otro webhook

Ese mismo valor se usa en dos lugares:

- en TalIA: `meta.whatsapp.verify_token`
- en Meta: configuracion del webhook

## Paso 7. Confirmar la version de Graph API

En TalIA pega en:

- `whatsapp.meta.graph_api_version`

Valor recomendado:

- `v21.0`

## Paso 8. Guardar la configuracion del tenant en TalIA

En la seccion `WhatsApp` del tenant llena:

- `whatsapp.provider` = `meta`
- `whatsapp.meta.phone_number_id`
- `whatsapp.meta.graph_api_version`
- `meta.whatsapp.page_access_token`
- `meta.whatsapp.verify_token`
- `meta.whatsapp.app_secret`

Tambien puedes dejar vacio lo de Twilio si este tenant solo sera para Meta.

## Paso 9. Copiar la URL del webhook

TalIA te muestra la URL sugerida en la misma vista:

```text
/api/whatsapp/meta/{tenantId}/webhook
```

La URL completa queda asi:

```text
https://talia.mx/api/whatsapp/meta/{tenantId}/webhook
```

## Paso 10. Configurar el webhook en Meta

En Meta debes ingresar:

- `Callback URL` = la URL anterior
- `Verify Token` = el mismo valor guardado en TalIA

Debes validar que Meta acepte la suscripcion.

## Paso 11. Probar el webhook entrante

Haz una prueba enviando un mensaje al numero conectado en Meta.

Debes ver:

- que llega al webhook de TalIA
- que el mensaje se registra en el tenant correcto
- que el asistente responde

## Paso 12. Probar el envio saliente

Responde desde TalIA o desde el flujo de asistente.

Debes confirmar:

- que el mensaje sale por Meta
- que se registra el `provider_message_id`
- que el historial del chat conserva el turno

## Paso 13. Probar estados

Verifica que lleguen estados como:

- `sent`
- `delivered`
- `read`
- `failed`

En el backend esos estados se guardan como eventos del proveedor.

## Campos exactos que debes usar en TalIA

### Creacion de tenant

Vista:

- `https://talia.mx/settings/tenants`

Campo:

- `Provider WhatsApp`

Valor:

- `Meta WhatsApp Cloud API`

### Edicion del tenant

Vista:

- `https://talia.mx/settings/tenants/{tenantId}`

Seccion:

- `WhatsApp`

Campos:

- `whatsapp.provider`
- `whatsapp.meta.phone_number_id`
- `whatsapp.meta.graph_api_version`
- `meta.whatsapp.page_access_token`
- `meta.whatsapp.verify_token`
- `meta.whatsapp.app_secret`

## Orden recomendado de captura

1. Crear el tenant.
2. Abrir el tenant.
3. Obtener `Phone Number ID`.
4. Obtener `Access Token`.
5. Obtener `App Secret`.
6. Definir `Verify Token`.
7. Llenar todo en TalIA.
8. Copiar la URL del webhook.
9. Configurar Meta.
10. Probar entrada.
11. Probar salida.
12. Probar estados.

## Si algo falla

- Si Meta rechaza el webhook, revisa `verify_token`.
- Si no salen mensajes, revisa `phone_number_id` y `access_token`.
- Si la firma falla, revisa `app_secret`.
- Si el tenant equivocado recibe mensajes, revisa el webhook y el tenant asociado.

