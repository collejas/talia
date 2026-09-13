# Seguridad y operación

## Estado esperado

Aprobado con pendientes de implementación. Este documento define controles; todavía no certifica el sistema migrado.

## Ocultamiento del proveedor

El proveedor central de correo es un detalle interno de infraestructura y no debe revelarse a tenants. Revisar que no aparezca en pantallas de configuración, formularios, URLs o endpoints consumidos por el panel, respuestas JSON, errores, logs enviados al cliente, variables públicas de Next.js ni documentación tenant-facing.

La ocultación no sustituye autorización: los permisos, ownership y validaciones deben seguir existiendo en backend. El nombre técnico puede conservarse en código y observabilidad interna restringida para diagnóstico operativo.

## Secretos

- Guardar tokens Postmark únicamente en secretos del backend/deploy.
- Separar el Account API Token del tenant Postmark de los Server API Tokens de cada servidor.
- El Account API Token se obtiene en `Account -> API Tokens` y solo está disponible para el Account Owner/Account Admin; se usa con `X-Postmark-Account-Token` para operaciones de cuenta como dominios.
- El Server API Token se obtiene en `Servers -> [servidor] -> API Tokens -> Server API tokens`; se usa con `X-Postmark-Server-Token` para enviar mensajes de ese servidor.
- La pantalla `settings/variables` de Talia no debe pedir estas credenciales: se configuran en secretos del backend por el administrador de plataforma. El tenant solo administra su dominio y sus DNS desde la vista autorizada.
- No exponer tokens en Next.js, respuestas, logs, errores ni panel.
- No guardar tokens dentro de `metadata`, plantillas o registros de envío.
- Rotar tokens y documentar el procedimiento de sustitución.

## Aislamiento por servidor

- Cada tenant debe utilizar exclusivamente su servidor Postmark, su Server API Token y sus streams.
- El backend debe resolver el servidor por el contexto autenticado y nunca aceptar `server_id`, `postmark_server_id`, token o stream como autoridad desde el frontend.
- Las consultas de mensajes, eventos, cuotas, supresiones y webhooks deben validar simultáneamente `organizacion_id` y el servidor asociado.
- La creación o retiro de servidores solo podrá ejecutarla una tarea administrativa de plataforma con el Account API Token.
- La creación automática solo podrá dispararse desde un pago confirmado o una activación manual autorizada del tenant maestro; nunca desde un dato enviado por el navegador.
- La tarea debe ser idempotente por `organizacion_id`: si existe un servidor externo, no crea otro; los errores se registran como estado operativo y se reintentan sin exponer tokens.
- La suspensión del tenant bloquea el envío, pero no elimina servidores ni secretos; el retiro definitivo requiere una operación administrativa separada y auditada.
- La rotación de un token no debe cambiar el tenant asociado ni dejar credenciales en logs, respuestas o archivos públicos.

## Dominios y autorización

- Un tenant solo puede crear, modificar, verificar, seleccionar o eliminar sus propios dominios.
- La API debe resolver `organizacion_id` desde el contexto autenticado.
- El backend debe verificar que el remitente pertenece al dominio verificado del tenant.
- No aceptar `postmark_server_id`, `postmark_domain_id` o `tenant_id` como autoridad desde frontend.
- Las acciones globales de cuenta/servidor deben limitarse a permisos de plataforma.

## Webhooks

Postmark no ofrece actualmente firma HMAC para webhooks según su documentación. Usar:

- HTTPS obligatorio;
- Basic Auth con secreto largo;
- allowlist de IPs de Postmark cuando la infraestructura lo permita;
- validación estricta de payload y campos esperados;
- deduplicación por MessageID/evento;
- respuesta 200 rápida y procesamiento posterior;
- no registrar cuerpos completos con datos personales.

No confiar en un `tenant_id` recibido en metadata sin buscar primero el `provider_message_id` en la base de datos.

La provisión del servidor debe registrar y verificar sus webhooks antes de marcarlo como operativo. La URL puede ser común a nivel técnico, pero la autorización, el servidor, el tenant y el MessageID deben resolverse y validarse en backend. El receptor debe aceptar reintentos sin duplicar eventos y devolver un error `5xx` cuando no pueda persistir o encolar el evento, para que Postmark pueda reintentarlo.

Eventos mínimos: Delivery, Bounce, SpamComplaint, Open, Click, SubscriptionChange e Inbound. Las quejas, bajas y rebotes permanentes deben reflejarse en las supresiones locales del tenant.

## Cuotas y abuso

- Reservar cuota con transacción/lock o función SQL atómica.
- Definir si los rebotes, supresiones y errores de validación consumen cuota.
- Limitar tamaño de lote, frecuencia y destinatarios por tenant.
- Bloquear campañas si el dominio no está verificado.
- Requerir permiso de campañas para envíos Broadcast.
- Registrar actor, tenant, campaña, cantidad, fecha y resultado.

## Entregabilidad y cumplimiento

- Separar streams transaccional y broadcast.
- Exigir remitente válido y dominio autenticado.
- Incluir mecanismo de baja en comunicaciones promocionales.
- Mantener supresiones locales y respetar bounces, spam complaints y unsubscribes.
- No convertir Postmark en un canal de envío indiscriminado o spam.
- Definir proceso de revisión para tenants con altas tasas de rebote/queja.

## Logs

Permitido:

- `provider_message_id`;
- tipo de evento;
- tenant interno;
- campaña/envío internos;
- código de error normalizado;
- latencia y número de lote.

No permitido:

- tokens;
- passwords Basic Auth;
- payloads completos;
- cuerpos HTML completos;
- listas completas de destinatarios;
- headers de autorización.

## Checklist de revisión antes del corte

1. ¿Quién puede registrar un dominio?
2. ¿Quién puede usarlo para enviar?
3. ¿El backend valida ownership en todas las rutas?
4. ¿Se puede modificar otro tenant usando un UUID conocido?
5. ¿Los webhooks tienen autenticación y deduplicación?
6. ¿Los reintentos pueden duplicar mensajes o descontar dos veces la cuota?
7. ¿Las bajas y rebotes bloquean futuros envíos?
8. ¿Los tokens están fuera del frontend y de los logs?
9. ¿El batch revisa errores individuales?
10. ¿El inbound evita crear conversaciones en otro tenant?
11. ¿Una búsqueda en el bundle, respuestas API y vistas tenant-facing confirma que no se revela el proveedor?
