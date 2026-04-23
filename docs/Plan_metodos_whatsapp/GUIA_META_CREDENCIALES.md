# Guia de credenciales Meta WhatsApp Cloud API

Fecha: 2026-04-22

Este documento sirve como checklist operativo para crear un tenant nuevo con WhatsApp Cloud API de Meta y cargarlo en TalIA sin tocar los tenants existentes de Twilio.

## Objetivo

- Crear un tenant piloto con `whatsapp.provider = meta`.
- Obtener en Meta las credenciales correctas.
- Saber en que vista/campo del panel de TalIA se debe registrar cada dato.

## Flujo recomendado

1. Crear el tenant nuevo en `https://talia.mx/settings/tenants`.
2. Elegir `Meta WhatsApp Cloud API` como provider.
3. Obtener en Meta las credenciales del app y del numero.
4. Cargar los datos en el formulario de WhatsApp del tenant.
5. Registrar el webhook de Meta apuntando a la URL sugerida por TalIA.
6. Probar mensaje entrante, saliente y estados.

## Datos que debes obtener de Meta

### 1. `Phone Number ID`

**Que es**

- Identificador del numero de WhatsApp que Meta expone para enviar y recibir mensajes via Cloud API.

**Donde se obtiene**

- En tu app de Meta Developers, dentro del producto WhatsApp.
- Ruta tipica:
  - `Meta Developers`
  - `My Apps`
  - tu app
  - `WhatsApp`
  - `API Setup` o `Getting Started`

**Donde se ingresa en TalIA**

- Vista: `https://talia.mx/settings/tenants/{tenantId}`
- Seccion: `WhatsApp`
- Campo: `whatsapp.meta.phone_number_id`

**Notas**

- Este dato es obligatorio para enviar mensajes con Meta.
- Debe corresponder al numero aprobado que vas a usar en pruebas.

### 2. `Access Token` de Meta para WhatsApp

**Que es**

- Token de acceso para llamar a Graph API.
- En produccion debe ser un token estable, normalmente de System User, no un token temporal de prueba.

**Donde se obtiene**

- En el ecosistema de Meta Business / Developers, normalmente desde:
  - `Business Settings`
  - `Users`
  - `System Users`
  - generar o asignar un token con permisos de WhatsApp.

**Donde se ingresa en TalIA**

- Vista: `https://talia.mx/settings/tenants/{tenantId}`
- Seccion: `WhatsApp`
- Campo secreto: `meta.whatsapp.page_access_token`

**Notas**

- En TalIA se guarda como secreto.
- No se debe pegar en un campo visible ni en `organizaciones.config`.
- Si el token expira o se rota, hay que actualizarlo en TalIA y en Meta si aplica.

### 3. `App Secret`

**Que es**

- Secreto del app de Meta.
- Se usa para validar la firma `X-Hub-Signature-256` del webhook.

**Donde se obtiene**

- En `Meta Developers`
- Tu app
- `Settings`
- `Basic`
- campo `App Secret`

**Donde se ingresa en TalIA**

- Vista: `https://talia.mx/settings/tenants/{tenantId}`
- Seccion: `WhatsApp`
- Campo secreto: `meta.whatsapp.app_secret`

**Notas**

- Este valor tambien se guarda como secreto.
- No debe compartirse en texto plano.

### 4. `Verify Token`

**Que es**

- Cadena que tu defines para validar la suscripcion del webhook.
- No te la da Meta.
- La generas tu y la pones igual en Meta y en TalIA.

**Donde se obtiene**

- No viene de Meta.
- Se define por nosotros.

**Donde se ingresa en TalIA**

- Vista: `https://talia.mx/settings/tenants/{tenantId}`
- Seccion: `WhatsApp`
- Campo secreto: `meta.whatsapp.verify_token`

**Donde se pega en Meta**

- En la configuracion del webhook de WhatsApp de tu app.

**Notas**

- Debe coincidir exactamente entre Meta y TalIA.
- Si lo cambias, debes actualizar ambos lados.

### 5. `Graph API Version`

**Que es**

- Version de Graph API que usara TalIA para enviar mensajes.

**Donde se obtiene**

- No es un secreto.
- Lo puedes dejar como la version sugerida por el sistema o cambiarlo si Meta te pide una version especifica.

**Donde se ingresa en TalIA**

- Vista: `https://talia.mx/settings/tenants/{tenantId}`
- Seccion: `WhatsApp`
- Campo: `whatsapp.meta.graph_api_version`

**Valor sugerido**

- `v21.0` o la version mas reciente que estes usando en tu app de Meta.

## Campos que debes llenar en TalIA

### En la creacion del tenant

Ruta:

- `https://talia.mx/settings/tenants`

Campo:

- `Provider WhatsApp`

Valor:

- `Meta WhatsApp Cloud API`

### En edicion del tenant

Ruta:

- `https://talia.mx/settings/tenants/{tenantId}`

Seccion:

- `WhatsApp`

Campos de Meta:

- `whatsapp.provider`
- `whatsapp.meta.phone_number_id`
- `whatsapp.meta.graph_api_version`
- `meta.whatsapp.page_access_token`
- `meta.whatsapp.verify_token`
- `meta.whatsapp.app_secret`

## Webhook que debes configurar en Meta

Usa esta URL:

```text
https://talia.mx/api/whatsapp/meta/{tenantId}/webhook
```

En Meta debes configurar:

- `Callback URL`: la URL anterior
- `Verify Token`: el mismo valor guardado en `meta.whatsapp.verify_token`

## Orden recomendado de carga

1. Crear el tenant nuevo en `settings/tenants`.
2. Elegir `Meta WhatsApp Cloud API`.
3. Guardar el tenant.
4. Abrir el tenant y entrar a la seccion `WhatsApp`.
5. Llenar `phone_number_id`.
6. Llenar `graph_api_version`.
7. Pegar `page_access_token`.
8. Pegar `verify_token`.
9. Pegar `app_secret`.
10. Configurar el webhook en Meta.
11. Probar mensaje entrante.
12. Probar respuesta saliente.
13. Probar estados de entrega.

## Que no debes confundir

- `Phone Number ID` no es el numero telefonico visible.
- `Access Token` no es el `App Secret`.
- `Verify Token` lo defines tu.
- `App Secret` lo genera Meta.

## Notas de operacion

- Los tenants existentes pueden seguir en Twilio.
- Este tenant de prueba debe ser exclusivo para Meta.
- Si la prueba es exitosa, ya se puede planear el cambio tenant por tenant.

