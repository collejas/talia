# Piloto Meta WhatsApp Implementado

Este documento registra el piloto que se ejecutó para validar WhatsApp Cloud API en paralelo a Twilio.

## Contexto

El objetivo inicial fue probar un tenant nuevo con WhatsApp Cloud API sin tocar los tenants existentes que siguen usando Twilio.

Se usó un tenant dedicado de prueba para validar:

- verificación de webhook;
- recepción de mensajes entrantes;
- generación de respuestas por el asistente;
- envío real de mensajes salientes por Meta;
- persistencia de mensajes y estados en la app.

## Lo que se hizo

### 1. Se creó un tenant piloto nuevo

Se creó un tenant nuevo para uso exclusivo con Meta, independiente de los tenants que siguen con Twilio.

### 2. Se configuró el proveedor WhatsApp del tenant

En la configuración del tenant se definió:

- `whatsapp.provider = meta`
- `whatsapp.meta.phone_number_id`
- `whatsapp.meta.graph_api_version`
- `whatsapp.prompt_id` o `whatsapp.assistant_id`
- `whatsapp.prompt_version`
- parámetros de reenganche e inactividad

### 3. Se cargaron los secretos Meta

Se registraron como secretos del tenant:

- `meta.whatsapp.page_access_token`
- `meta.whatsapp.verify_token`
- `meta.whatsapp.app_secret`

### 4. Se configuró el webhook en Meta

Durante el piloto se usó una URL de callback asociada al tenant de prueba.

La verificación se completó con:

- `Callback URL`
- `Verify Token`

Luego se suscribió el evento `messages`.

### 5. Se validó el flujo completo

Se probó:

- mensaje entrante desde WhatsApp;
- webhook llegando al backend;
- respuesta del asistente;
- envío de la respuesta por Meta;
- persistencia de la salida en el inbox de la app.

## Resultado

El piloto quedó funcional:

- Meta recibe y entrega mensajes;
- el backend procesa el inbound;
- el asistente responde;
- el outbound sale por Meta cuando el tenant tiene toda la configuración completa.

## Corrección aplicada durante el piloto

Durante la validación apareció un caso en el que el backend marcaba `meta_not_configured`.

La causa real fue que el tenant tenía secretos Meta, pero le faltaba este valor en `organizaciones.config`:

- `whatsapp.meta.phone_number_id`

Al completar ese dato, el envío por Meta comenzó a funcionar.

## Aclaración importante

El webhook por tenant que se usó en el piloto fue una medida temporal de validación.

Sirvió para probar rápido:

- un tenant Meta aislado;
- credenciales;
- firma;
- envío;
- recepción.

No debe tomarse como el diseño final si van a convivir varios tenants Meta en producción.

## Lo que quedó listo

- tenants existentes pueden seguir en Twilio;
- el tenant piloto puede operar con Meta;
- el backend ya sabe leer config y secretos por tenant;
- el canal Meta quedó validado en la práctica.

## Siguiente paso lógico

El siguiente paso es refactorizar el webhook Meta a un punto de entrada único para toda la app y resolver el tenant por `phone_number_id`.

