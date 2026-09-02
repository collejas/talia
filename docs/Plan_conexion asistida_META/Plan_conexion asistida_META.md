# Plan: conexión asistida de WhatsApp Meta en Talia

## 1. Objetivo

Permitir que un tenant conecte su número de WhatsApp Cloud API con Talia mediante una conexión asistida:

1. El cliente autoriza en Meta el acceso de Talia a su WhatsApp Business Account (WABA) y al número de teléfono.
2. El cliente captura en Talia los identificadores del activo y el PIN de registro.
3. Talia ejecuta desde su backend el registro del número, la suscripción de la aplicación al WABA y las verificaciones finales.

El cliente no debe capturar secretos propios de Talia ni ejecutar comandos en consola.

## 2. Alcance de la primera versión

La primera versión será una conexión asistida, no un onboarding completamente autoservicio mediante Embedded Signup.

El cliente seguirá necesitando autorizar los activos en Meta. Talia automatizará las operaciones que actualmente se ejecutan manualmente con `curl`.

### Regla obligatoria de compatibilidad con producción

La conexión asistida debe implementarse como un flujo paralelo y no debe alterar automáticamente las conexiones de WhatsApp Meta que ya están funcionando.

Durante la primera versión:

- Los tenants existentes conservarán su `Phone Number ID`.
- Los tenants existentes conservarán sus secretos operativos actuales mientras se valida la nueva arquitectura.
- El envío normal de mensajes continuará utilizando el token configurado para cada tenant.
- El webhook compartido y la resolución por `Phone Number ID` no se cambiarán.
- La versión `v25.0` podrá utilizarse para las operaciones nuevas sin modificar automáticamente la versión de Graph API de los tenants actuales.
- El nuevo token global se utilizará inicialmente para validar activos y ejecutar el onboarding, no para reemplazar de inmediato los tokens de envío existentes.
- No se ejecutará `/register` automáticamente sobre un número que ya esté registrado.
- La suscripción se ejecutará únicamente sobre la WABA seleccionada por el tenant y se verificará después.
- No se cambiará automáticamente `whatsapp.provider` ni ninguna plantilla existente.

La migración o unificación posterior de tokens por tenant hacia el token global será una fase independiente, con pruebas, aprobación y rollback propios.

### Datos que captura el cliente en Talia

- `WABA_ID`: identificador de la WhatsApp Business Account del cliente.
- `Phone Number ID`: identificador del número de WhatsApp del cliente.
- PIN de seis dígitos para el registro de Cloud API.

El `WABA_ID` es un dato nuevo para el flujo asistido. Aunque actualmente no sea necesario para enviar o resolver mensajes, debe persistirse para validar la relación entre la WABA y el número, suscribir la aplicación y mostrar el estado real de la conexión.

El PIN no es el código OTP que Meta envía por SMS o llamada para verificar la propiedad del teléfono.

### Datos que permanecen en Talia

Como configuración global del backend, nunca en la pantalla de variables de cada tenant:

- Meta App ID.
- Meta App Secret.
- System User access token de Talia.
- Verify token del webhook de Talia.
- Versión predeterminada de Graph API.
- Business ID de la empresa de Talia, para mostrarlo al cliente durante la autorización.

### Business ID oficial de Talia para onboarding

El Business ID que debe proporcionarse al cliente para autorizar y compartir sus activos de WhatsApp Business con Talia es:

```text
1358726956043196
```

Este identificador debe mostrarse en las instrucciones de `settings/variables` y utilizarse en el material de onboarding.

Debe configurarse como una variable global del backend, no como un valor escrito directamente en cada componente:

```env
META_TALIA_BUSINESS_ID=1358726956043196
```

La variable no es un secreto de autenticación, pero debe tratarse como configuración de plataforma. El backend puede devolverla mediante una respuesta específica y controlada para que la pantalla de onboarding la muestre al usuario autenticado. No debe enviarse junto con secretos ni exponerse mediante variables públicas del frontend.

No debe confundirse con:

- El `APP_ID` de la aplicación de Meta.
- El `WABA_ID` del cliente.
- El `Phone Number ID` del cliente.
- El identificador de un System User.

El token global solo puede utilizarse para un tenant si Meta le concedió acceso al WABA y al número correspondiente.

## 3. Situación actual

Actualmente la configuración de `settings/variables` permite guardar por tenant:

- `whatsapp.meta.phone_number_id` en la configuración del tenant.
- `whatsapp.meta.graph_api_version` en la configuración del tenant.
- `meta.whatsapp.page_access_token` como secreto cifrado por tenant.
- `meta.whatsapp.verify_token` como secreto cifrado por tenant.
- `meta.whatsapp.app_secret` como secreto cifrado por tenant.

El runtime de WhatsApp carga esos datos por organización. El webhook de Meta valida la firma con `app_secret`, valida el challenge con `verify_token` y resuelve el tenant principalmente mediante el `phone_number_id` recibido en el payload.

### Aclaración del funcionamiento productivo actual

La revisión del código confirma que Talia ya opera en producción con varios tenants de Meta. Esa operación no demuestra, por sí sola, que exista un único token global para todos los tenants.

Actualmente:

- El `phone_number_id` se configura por tenant dentro de `config.whatsapp.meta.phone_number_id`.
- El envío de mensajes utiliza el token cargado para la organización actual desde `meta.whatsapp.page_access_token`.
- La firma del webhook utiliza el `meta.whatsapp.app_secret` cargado para la organización actual.
- El challenge del webhook utiliza el `meta.whatsapp.verify_token` cargado para la organización actual, con fallback a la configuración global existente.
- La resolución del tenant del webhook utiliza el `phone_number_id` de Meta.
- El `WABA_ID` no aparece actualmente como dato persistido en la configuración productiva del tenant.

Esto explica por qué la operación existente puede funcionar sin guardar el WABA: el envío y la recepción se resuelven principalmente mediante el número. Sin embargo, el WABA sí es necesario para las operaciones administrativas de la conexión asistida, especialmente `subscribed_apps` y las validaciones de pertenencia del número.

La conexión asistida no debe cambiar de inmediato el mecanismo productivo de los tenants existentes. Primero debe probarse el nuevo modelo con un System User access token global de Talia. Si ese token puede acceder a los activos compartidos por los clientes, podrá utilizarse para registrar y suscribir nuevos tenants. Si no tiene acceso a una WABA concreta, Meta rechazará la operación aunque los IDs sean correctos.

### Token actual frente al token global propuesto

El nombre actual `meta.whatsapp.page_access_token` corresponde a un secreto por tenant que Talia ya utiliza para enviar mensajes. La existencia de varios tenants conectados no significa necesariamente que todos compartan el mismo token.

Para la conexión asistida se debe confirmar en Meta si Talia dispone de un System User access token global con acceso a las WABA y números compartidos por los clientes.

El escenario objetivo es: el cliente comparte el activo con Talia y el System User de Talia recibe los permisos necesarios. Talia utiliza entonces el token global para validar, registrar y suscribir cada WABA. Antes de retirar los secretos de la pantalla, este escenario debe probarse con un tenant de prueba sin afectar a los tenants existentes.

### Evidencia confirmada del token global

El token utilizado actualmente como `META_TOKEN` fue validado mediante `debug_token` y Meta devolvió:

- `type: SYSTEM_USER`.
- `is_valid: true`.
- `expires_at: 0`.
- `data_access_expires_at: 0`.
- `app_id: 950298070825920`, correspondiente a `App WhatApp Tal-IA`.
- Permisos de `whatsapp_business_management` y `whatsapp_business_messaging`, además de permisos adicionales ya concedidos.

El mismo token fue probado contra seis WABA y en todos los casos permitió consultar la WABA, sus números y sus aplicaciones suscritas:

- Rentauto: WABA `1248465307374188`, Phone Number ID `1252312431306430`.
- Porta Mezquite: WABA `1014490217751038`, Phone Number ID `1141725625688901`.
- Tal-IA: WABA `1851800489561166`, Phone Number ID `1164463663426947`.
- Saul Martinez: WABA `1895659001151044`, Phone Number ID `1230608700141056`.
- Grupo Imlux: WABA `1492804725705304`, Phone Number ID `1046129768592659`.
- Gran Peñón: WABA `3483150995170974`, Phone Number ID `1139218909270276`.

En las seis respuestas apareció la aplicación `950298070825920` dentro de `subscribed_apps`. Esto confirma que el token actual ya tiene capacidad global de lectura y administración sobre múltiples WABA de clientes. Debe utilizarse como base del nuevo flujo, sujeto a rotación segura antes de ponerlo en una variable definitiva de producción.

### Webhook compartido confirmado

Los seis números devolvieron la misma aplicación de webhook:

```text
https://talia.mx/api/whatsapp/meta/a2f79c76-340a-4fe7-b05a-6ff4dd532325/webhook
```

Esto no representa una falla exclusiva de Rentauto. Es la URL común configurada para la aplicación de Talia. Los mensajes se entregan al tenant correcto porque Talia resuelve la organización mediante el `Phone Number ID` incluido en el payload de Meta.

La URL compartida puede mantenerse mientras el flujo productivo continúe funcionando. Como mejora futura, se puede evaluar un endpoint global más explícito, por ejemplo `/api/whatsapp/meta/webhook`, sin cambiarlo durante la primera versión de la conexión asistida.

## 3.3. Compatibilidad y rollback

La implementación debe poder desplegarse sin modificar datos ni credenciales de los tenants productivos existentes.

Si una operación nueva falla, el tenant debe permanecer con su configuración anterior y no debe marcarse como `conectado`.

El rollback de la primera versión debe consistir en:

1. Deshabilitar los botones o endpoints nuevos de conexión asistida.
2. Mantener activos el webhook, envío y procesamiento actuales.
3. No eliminar `phone_number_id`, secretos ni configuración existente.
4. Revertir únicamente el estado de onboarding incompleto del tenant nuevo.

La prueba de aceptación debe demostrar que, después de habilitar el nuevo flujo, un tenant productivo existente puede seguir recibiendo y enviando mensajes sin cambios funcionales.

Las operaciones manuales actuales son equivalentes a:

```text
POST /{PHONE_NUMBER_ID}/register
POST /{WABA_ID}/subscribed_apps
GET  /{WABA_ID}/subscribed_apps
```

La primera llamada debe enviar:

```json
{
  "messaging_product": "whatsapp",
  "pin": "123456"
}
```

## 4. Significado correcto del PIN

El campo `pin` de `/{PHONE_NUMBER_ID}/register` es el PIN de verificación en dos pasos de WhatsApp Cloud API.

La llamada realiza dos acciones:

1. Registra el número en Cloud API.
2. Establece o utiliza un PIN de seguridad de seis dígitos.

Reglas del flujo:

- Si el número ya tiene verificación en dos pasos, el cliente debe proporcionar el PIN existente.
- Si no tiene PIN configurado, el valor enviado puede establecer el nuevo PIN.
- No debe utilizarse un PIN fijo para todos los tenants.
- Talia no debe registrar el PIN en logs.
- Si se genera automáticamente, debe mostrarse al cliente de forma controlada y documentarse que deberá conservarlo.
- Antes del registro, Meta puede requerir un código OTP por SMS o llamada para verificar la propiedad del número.

Fuente: [Meta Cloud API - Register Phone Number](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).

## 5. Autorización que debe realizar el cliente en Meta

Talia debe mostrar instrucciones concretas dentro de la sección de WhatsApp.

El dato que se debe entregar al cliente es el Business ID de Talia o el identificador de partner que corresponda a la configuración de Meta. No debe entregarse el `APP_ID`, el `WABA_ID` ni el `Phone Number ID` como identificador de autorización.

Flujo esperado para el cliente:

1. Entrar a Meta Business Settings.
2. Ir a la sección de partners o activos de negocio.
3. Agregar o compartir con Talia el activo de WhatsApp Business.
4. Seleccionar la WABA del cliente.
5. Compartir también el número de teléfono asociado.
6. Conceder los permisos necesarios de administración y mensajería.
7. Confirmar que la identidad de Talia o su System User tenga acceso al WABA y al número.
8. Regresar a Talia y capturar los IDs solicitados.

La implementación deberá confirmar con la configuración real de Meta si el cliente comparte el activo con el Business Manager de Talia y después Talia asigna su System User, o si Meta permite asignar directamente el System User en el flujo elegido. La pantalla debe mostrar el identificador exacto configurado para esa modalidad.

## 6. Permisos y credenciales

El System User access token de Talia debe tener los permisos necesarios para las operaciones de WhatsApp Business Management y Messaging. Como mínimo, se debe validar el permiso requerido para registrar el número y suscribir la aplicación al WABA.

El token no debe considerarse válido solo porque sea sintácticamente correcto. Antes de modificar datos del tenant, Talia debe comprobar que:

- El WABA existe y es accesible.
- El `Phone Number ID` pertenece al WABA indicado.
- El token tiene acceso al WABA.
- El token tiene acceso al número.
- El número corresponde al tenant que está ejecutando la conexión.

Fuentes:

- [Meta Cloud API - Registration](https://www.postman.com/meta/whatsapp-business-platform/folder/zuoeksl/registration).
- [Meta WhatsApp Business Platform - Partners](https://whatsappbusiness.com/partners/become-a-partner/).

## 7. Diseño funcional de `settings/variables`

Dentro de `WhatsApp > Meta WhatsApp Cloud API` debe existir un bloque de conexión separado de la configuración operativa y de las plantillas.

### Información visible

- Estado actual de conexión.
- Business ID de Talia que debe autorizar el cliente.
- Instrucciones para compartir el WABA y el número.
- URL del webhook que debe quedar configurada en Meta, si aplica.
- Aviso de que Talia nunca solicita el token privado del cliente.
- Aviso sobre la diferencia entre PIN de Cloud API y código OTP.

### Campos del tenant

- `WABA_ID`.
- `Phone Number ID`.
- PIN de seis dígitos, como campo protegido y de uso controlado.

El PIN no debe mostrarse después de guardarse. Si el proceso requiere volver a registrar el número, el usuario deberá capturarlo nuevamente o utilizar un PIN almacenado de forma segura según la política definida.

## 7.1. Validación guiada paso a paso

La pantalla debe validar cada etapa mediante una llamada del backend a Meta. No basta con comprobar que los IDs tengan formato numérico ni con guardar los valores en la configuración del tenant.

### Paso 1: mostrar la autorización requerida

Talia muestra al cliente el Business ID de Talia o el identificador de partner configurado para la modalidad de autorización elegida. Para el onboarding actual, el Business ID oficial de Talia es `1358726956043196`.

El mensaje debe indicar:

> Comparte tu WhatsApp Business Account y el número de teléfono con Talia usando este Business ID: `1358726956043196`.

El cliente realiza la autorización desde Meta Business Settings y después regresa a Talia.

Talia no debe presentar el `APP_ID`, el `WABA_ID` ni el `Phone Number ID` como si fueran el identificador que el cliente debe autorizar.

### Paso 2: capturar los identificadores del cliente

El cliente captura:

- `WABA_ID`.
- `Phone Number ID`.

La acción disponible debe ser `Validar autorización`.

### Paso 3: validar acceso a la WABA

El backend utiliza el token global de Talia para consultar la WABA:

```http
GET /{WABA_ID}
```

Esta llamada debe confirmar que:

- La WABA existe.
- El token de Talia tiene acceso.
- Meta devuelve la identidad esperada del activo.

Si la consulta falla por permisos, Talia debe mostrar una instrucción de autorización, no el JSON completo de Meta.

Mensaje sugerido:

> Talia todavía no tiene acceso a esta WABA. Regresa a Meta Business Settings y comparte el activo con el Business ID indicado.

### Paso 4: validar que el número pertenece a la WABA

El backend consulta los números asociados a la WABA:

```http
GET /{WABA_ID}/phone_numbers
```

Debe comprobar que el `Phone Number ID` capturado aparece dentro de la respuesta.

Si no aparece, Talia no debe permitir el registro ni guardar la conexión como válida.

Mensaje sugerido:

> El Phone Number ID no pertenece a la WABA indicada. Revisa ambos datos en Meta Business Settings.

Cuando ambas consultas son correctas, la interfaz muestra:

> Autorización correcta. Talia puede acceder a la WABA y al número seleccionado.

### Paso 5: registrar el número

Después de validar el acceso, se habilita la acción `Registrar número`.

El cliente captura el PIN de seis dígitos y el backend ejecuta:

```http
POST /{PHONE_NUMBER_ID}/register
```

El PIN se envía únicamente al backend. No debe aparecer en URL, logs, respuestas, auditoría ni mensajes de error.

Si el registro es correcto, la interfaz muestra:

> Número registrado correctamente en WhatsApp Cloud API.

Si Meta rechaza el PIN, la pantalla debe indicar que se revise el PIN de verificación en dos pasos del número. No debe revelar la respuesta técnica completa.

### Paso 6: suscribir la aplicación al WABA

Después del registro correcto, se habilita la acción `Suscribir aplicación`.

El backend ejecuta:

```http
POST /{WABA_ID}/subscribed_apps
```

La respuesta positiva de esta llamada debe considerarse solo como resultado provisional hasta completar la siguiente consulta.

### Paso 7: verificar la suscripción

El backend ejecuta una consulta posterior:

```http
GET /{WABA_ID}/subscribed_apps
```

Debe buscar el `APP_ID` de Talia en la lista de aplicaciones suscritas.

Si aparece, Talia muestra:

> WhatsApp conectado correctamente. La aplicación de Talia está suscrita a tu WABA.

Si no aparece, el tenant no debe marcarse como conectado, aunque el POST de suscripción haya devuelto `success: true`.

### Paso 8: guardar el estado final

Solo después de validar la WABA, la pertenencia del número, el registro y la suscripción, Talia debe guardar el estado `conectado`.

El frontend debe recibir un estado funcional y un mensaje accionable. Los detalles técnicos de Meta deben quedar únicamente en logs protegidos y auditoría segura.

### Acciones

Botones propuestos:

- `Validar autorización`.
- `Validar acceso`.
- `Registrar número`.
- `Suscribir aplicación al WABA`.
- `Verificar conexión`.
- `Conectar WhatsApp` como acción guiada que ejecute el flujo completo con confirmaciones.

La acción completa debe ser idempotente o tratar explícitamente los casos en que el número ya esté registrado o la aplicación ya esté suscrita.

## 8. Flujo técnico propuesto

### Paso A: validar identificadores

El backend recibe `waba_id` y `phone_number_id`, valida formato y consulta Meta para verificar que el número pertenece al WABA.

No se debe confiar únicamente en que ambos valores sean IDs numéricos válidos.

### Paso B: validar autorización

El backend ejecuta una consulta de lectura utilizando el token global de Talia para confirmar el acceso al WABA y al número.

Si falla, Talia debe mostrar una instrucción accionable, por ejemplo:

> Meta no permite que Talia acceda a este activo. Regresa a Meta Business Settings y comparte la WABA y el número con el Business ID indicado.

### Paso C: registrar el número

El backend ejecuta:

```http
POST https://graph.facebook.com/{GRAPH_API_VERSION}/{PHONE_NUMBER_ID}/register
Authorization: Bearer {TALIA_SYSTEM_USER_TOKEN}
Content-Type: application/json
```

Con el cuerpo que contiene `messaging_product` y el PIN recibido.

### Paso D: suscribir la aplicación

El backend ejecuta:

```http
POST https://graph.facebook.com/{GRAPH_API_VERSION}/{WABA_ID}/subscribed_apps
Authorization: Bearer {TALIA_SYSTEM_USER_TOKEN}
```

Fuente: [Meta Cloud API - Subscribe to a WABA](https://www.postman.com/meta/whatsapp-business-platform/request/26gui66/subscribe-to-a-waba).

### Paso E: verificar la suscripción

El backend ejecuta:

```http
GET https://graph.facebook.com/{GRAPH_API_VERSION}/{WABA_ID}/subscribed_apps
Authorization: Bearer {TALIA_SYSTEM_USER_TOKEN}
```

Debe comprobar que la aplicación de Talia aparece en la respuesta y no limitarse a aceptar un `success: true` de una llamada previa.

### Paso F: guardar estado

Solo después de completar las validaciones, Talia debe guardar o actualizar la configuración del tenant:

- `waba_id`.
- `phone_number_id`.
- Estado de conexión.
- Fecha de última validación.
- Fecha de registro.
- Fecha de suscripción.
- Identificador de aplicación suscrita, si Meta lo devuelve.
- Código de error técnico normalizado, cuando exista.

Los datos estructurales anteriores deben ser columnas explícitas o una entidad de conexión relacionada; no deben esconderse dentro de `metadata`.

## 9. Modelo de estado recomendado

Estados funcionales:

- `sin_configurar`: no existen los IDs requeridos.
- `requiere_autorizacion`: Talia no puede acceder al WABA o al número.
- `activos_validados`: los IDs son correctos y accesibles.
- `registro_pendiente`: falta ejecutar o completar `/register`.
- `numero_registrado`: el número está registrado en Cloud API.
- `suscripcion_pendiente`: falta suscribir la app al WABA.
- `conectado`: registro y suscripción confirmados.
- `error`: ocurrió un fallo que requiere acción.

El estado no debe inferirse solamente por la existencia de `phone_number_id`. Un número verificado no demuestra que la aplicación esté suscrita al WABA.

## 10. API interna sugerida

Las rutas exactas deberán seguir el patrón existente de Talia, pero el contrato puede ser:

```text
POST /tenant/me/whatsapp/meta/validate-access
POST /tenant/me/whatsapp/meta/register
POST /tenant/me/whatsapp/meta/subscribe
es que ese token es este:POST /tenant/me/whatsapp/meta/verify
POST /tenant/me/whatsapp/meta/connect
GET  /tenant/me/whatsapp/meta/connection
```

Requisitos:

- Autenticación obligatoria.
- Permiso `settings.manage` para ejecutar acciones.
- Tenant obtenido del contexto autenticado, no de un `tenant_id` enviado libremente.
- Schemas Pydantic con validación estricta.
- Timeouts para llamadas a Meta.
- Errores externos normalizados y traducidos a mensajes claros.
- No devolver tokens ni secretos.
- Registrar auditoría sin incluir PIN, token, `Authorization` ni payloads sensibles.

## 11. Almacenamiento de configuración

### Configuración global del backend

Las credenciales de Talia deben configurarse mediante variables de entorno del backend y el mecanismo de secretos de infraestructura:

- `META_APP_ID`.
- `META_APP_SECRET`.
- `META_SYSTEM_USER_ACCESS_TOKEN`.
- `WHATSAPP_META_VERIFY_TOKEN`.
- `META_TALIA_BUSINESS_ID`.
- `WHATSAPP_META_GRAPH_API_VERSION` con valor propuesto `v25.0`.

Los nombres son orientativos y deben adaptarse a la convención existente.

### Configuración por tenant

Debe permanecer por tenant:

- `waba_id`.
- `phone_number_id`.
- Estado de conexión.
- Datos de auditoría y última validación.

Si se conserva temporalmente el nombre `meta.whatsapp.page_access_token`, debe documentarse que contiene el token de servicio de Talia y no debe editarse desde la pantalla del tenant.

## 12. Seguridad

- Nunca mostrar el System User token, App Secret o verify token en frontend.
- Nunca guardar tokens en `config` público o `metadata`.
- Nunca registrar el PIN ni headers de autorización.
- Usar el token global únicamente después de validar la asociación tenant-WABA-phone.
- Evitar que un usuario de un tenant ejecute la conexión para otro tenant.
- Aplicar límites de frecuencia para evitar abuso o intentos repetidos de PIN.
- No reintentar automáticamente `/register` sin control, porque puede generar bloqueos o efectos no deseados.
- Usar mensajes de error sin exponer la respuesta completa de Graph API.
- Mantener auditoría de usuario, tenant, operación, resultado y código normalizado.
- Rotar cualquier credencial que haya sido almacenada en archivos del repositorio, aunque esté dentro de comentarios.

## 13. Versión de Graph API

Debe definirse una única versión predeterminada para el flujo.

La implementación actual presenta una diferencia que debe resolverse antes de construir los botones:

- Los comandos manuales utilizan `v25.0`.
- El runtime de Talia tiene fallback a `v21.0`.

La versión no debe depender accidentalmente de un valor diferente entre consola, frontend y backend. Se debe validar la versión elegida contra las llamadas de registro, consulta de teléfonos y suscripción.

## 14. Diferencia con Embedded Signup

Este plan no depende inicialmente de Embedded Signup.

La conexión asistida requiere que el cliente comparta los activos de Meta con Talia y después Talia ejecute las llamadas API con su System User token.

Embedded Signup sería una fase posterior para que el cliente autorice mediante un flujo OAuth hospedado por Meta. Ese flujo requiere revisar la elegibilidad de Talia como Tech Provider, la configuración de Facebook Login for Business, permisos avanzados y App Review.

Meta describe Embedded Signup como el flujo para que Solution Partners, Tech Providers y Tech Partners incorporen clientes a WhatsApp Cloud API. [Meta Embedded Signup](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup)

## 15. Mensajes de error esperados

Mensajes orientados al usuario:

- `No se encontró la WABA indicada.`
- `El Phone Number ID no pertenece a la WABA indicada.`
- `Talia no tiene acceso a este activo. Revisa la autorización en Meta.`
- `El PIN debe contener exactamente seis dígitos.`
- `Meta rechazó el PIN. Si el número ya tenía verificación en dos pasos, utiliza el PIN existente.`
- `El número ya está registrado en Cloud API.`
- `La aplicación no pudo suscribirse al WABA.`
- `La suscripción no pudo confirmarse. No marques el tenant como conectado.`
- `Meta no está disponible temporalmente. Intenta nuevamente.`

Los logs internos pueden conservar un código técnico normalizado, pero no deben devolver al usuario el JSON completo ni el token utilizado.

## 16. Criterios de aceptación

La funcionalidad podrá considerarse lista cuando:

1. Un usuario autorizado vea el Business ID correcto de Talia.
2. Las instrucciones indiquen cómo compartir la WABA y el número.
3. El tenant solo capture WABA ID, Phone Number ID y PIN.
4. Talia valide que el número pertenece al WABA.
5. Talia valide que su token tiene acceso a ambos activos.
6. El backend registre el número con el PIN recibido.
7. El backend suscriba la aplicación al WABA.
8. El backend confirme la suscripción mediante una lectura posterior.
9. El estado `conectado` solo se guarde después de todas las validaciones.
10. Ningún secreto aparezca en frontend, respuesta API, logs o auditoría.
11. Los reintentos y los casos ya registrados sean seguros.
12. Se pruebe el flujo con un tenant de prueba y un tenant real autorizado.
13. Se confirme un mensaje entrante y uno saliente después de la conexión.
14. Las conexiones existentes no cambien su token, Phone Number ID, webhook, proveedor ni plantillas.
15. El token global se use inicialmente solo para las operaciones de onboarding y administración de la conexión.
16. `/register` no se ejecute automáticamente sobre números ya registrados.
17. Un error durante el onboarding no deje al tenant productivo en un estado parcialmente conectado.
18. El flujo pueda deshabilitarse sin interrumpir el envío ni la recepción de tenants existentes.

## 17. Primer corte implementado

El primer corte del refactor deja preparado el flujo en paralelo al mecanismo productivo existente:

- `GET /tenant/me/whatsapp/meta/connection` consulta el estado persistido del onboarding.
- `POST /tenant/me/whatsapp/meta/connection` ejecuta una acción explícita: `validar`, `registrar` o `suscribir`.
- La validación consulta el WABA, confirma que el Phone Number ID pertenece a ese WABA y verifica la suscripción de la aplicación.
- El PIN se recibe únicamente durante el registro y no se persiste ni se escribe en logs.
- El estado se persiste en `whatsapp_meta_connections`; no se guardan tokens en esa tabla.
- Solo después de una conexión completamente confirmada se sincroniza `config.whatsapp.meta.phone_number_id`, que es el dato que ya usa el resolver del webhook. El proveedor solo cambia a `meta` cuando la aplicación queda suscrita.
- Si un intento queda en `error` o `pendiente`, el tenant puede corregir el WABA y el Phone Number ID. Una conexión `conectado` permanece protegida contra reemplazos accidentales.
- La UI se agregó dentro de `settings/variables > WhatsApp`, con instrucciones, Business ID de Talia y botones por paso.

La migración debe aplicarse antes de habilitar el panel en producción. El token global se lee con compatibilidad desde `META_SYSTEM_USER_ACCESS_TOKEN` o el nombre actualmente operativo `META_TOKEN`; el resto de valores globales usa `META_TALIA_BUSINESS_ID`, `META_APP_ID`, `META_APP_SECRET` y `META_GRAPH_API_VERSION`.

## 18. Pendientes antes de desplegar

- Confirmar en Meta el procedimiento exacto de autorización por partner Business Manager que se mostrará al cliente.
- La solicitud de aprobación adicional de Meta quedó resuelta; no bloquea el uso del token global validado.
- Formalizar la variable global `META_TALIA_BUSINESS_ID=1358726956043196` en configuración y despliegue.
- Formalizar `META_TOKEN` como secreto global del backend después de rotar las credenciales expuestas.
- Definir y probar `v25.0` como versión única de Graph API.
- No persistir el PIN en Talia: recibirlo de forma temporal, enviarlo a Meta durante `/register` y descartarlo después.
- [x] Aplicar la migración `20260828_120000_whatsapp_meta_assisted_connections.sql` en Supabase.
- Mantener documentada la configuración actual del webhook compartido y la resolución por `phone_number_id`.
- Retirar los secretos de tenant de la UI y conservar compatibilidad durante la migración.
- Rotar credenciales expuestas en archivos `.env` del repositorio.
- Implementar pruebas de permisos, tenant isolation, errores de Meta, idempotencia y reintentos.
- Ejecutar pruebas de no regresión con al menos un tenant existente antes y después del despliegue.
- Definir el mecanismo de feature flag o desactivación del onboarding asistido.
