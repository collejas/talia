# Diseno Final: Webhook Unico Para Meta WhatsApp

Este documento define el comportamiento objetivo una vez terminado el piloto de WhatsApp Cloud API.

## Objetivo

Tener un solo webhook publico para Meta y resolver desde el backend a que tenant pertenece cada evento.

Esto evita mantener un callback distinto por tenant y permite que:

- varios tenants convivan con Meta;
- otros tenants sigan usando Twilio;
- el routing sea centralizado;
- la operacion sea mas simple y mas estable.

## Lo que se valida en el piloto

Durante el piloto se confirmo que:

- el backend recibe mensajes de Meta;
- el asistente responde;
- la respuesta se puede enviar por Meta;
- el flujo funciona por tenant individual.

Ese piloto sirve para validar la integracion, pero no es el diseno final si se van a operar varios tenants Meta.

## Diseno final propuesto

### 1. Un solo webhook para Meta

La app debe exponer una sola URL publica para Meta, por ejemplo:

```text
https://talia.mx/api/whatsapp/meta/webhook
```

Meta apuntara siempre a ese endpoint.

### 2. Resolver tenant por `phone_number_id`

Cada tenant que use Meta ya debe guardar:

- `whatsapp.provider = meta`
- `whatsapp.meta.phone_number_id`
- `meta.whatsapp.page_access_token`
- `meta.whatsapp.verify_token`
- `meta.whatsapp.app_secret`

Cuando llegue un webhook, el backend debe:

1. leer el `phone_number_id` del payload;
2. buscar a que tenant pertenece ese `phone_number_id`;
3. cargar la config y secretos de ese tenant;
4. procesar el inbound y el outbound con ese contexto.

### 3. Mantener Twilio como proveedor separado

Los tenants existentes que ya operan con Twilio deben seguir igual.

El backend debe elegir proveedor por tenant:

- `meta` para tenants Meta;
- `twilio` para tenants legados.

## Por que este diseno es mejor

- evita tener un webhook distinto por tenant;
- simplifica la configuracion de Meta;
- hace mas facil mover tenants entre proveedores;
- reduce errores operativos al recrear tenants;
- mantiene el panel y la base de datos alineados con un modelo real de produccion.

## Cambios que implica

### Backend

- cambiar el router de webhook Meta a un endpoint unico;
- resolver tenant desde el payload;
- usar `phone_number_id` como llave de enrute;
- mantener la validacion de firma con `app_secret`;
- seguir usando `verify_token` para la verificacion inicial.

### Base de datos

- conservar `whatsapp.meta.phone_number_id` por tenant;
- asegurar que ese valor sea obligatorio para `provider = meta`;
- mantener separados los secretos de Meta y Twilio.

### Frontend

- mostrar el webhook unico de Meta en la vista de tenant;
- dejar claro que el tenant solo guarda credenciales y no un webhook distinto;
- validar los campos requeridos segun el provider.

## Estado actual

Hoy el sistema ya funciona en modo piloto con un webhook asociado al tenant de prueba.

Ese estado es util para pruebas, pero el siguiente paso es moverlo a este diseno unico.

## Conclusion

El piloto quedo validado.

El diseno final debe ser un webhook unico por app Meta, con routing interno por `phone_number_id` y coexistencia limpia con Twilio.

