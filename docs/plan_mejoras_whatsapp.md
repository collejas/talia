# Plan para evitar respuestas dobles en WhatsApp

Documento que resume las acciones para corregir el bug de doble respuesta detectado el 21-dic-2025 y, de paso, endurecer el canal WhatsApp.

## 1. Webhook principal no debe bloquearse
- **Problema actual:** `/api/whatsapp/webhook` tarda ~36 s antes de responder a Twilio; al pasar de ~15 s Twilio dispara el fallback y procesamos el mismo mensaje dos veces.
- **Objetivo:** responder 200 OK en <1 s y mover la lógica pesada (fetch de contexto, llamada a OpenAI, persistencia, envío por Twilio) a un worker asíncrono.
- **Acciones sugeridas:**
  1. Al recibir el `FormData`, valida la firma y regresa `{"status": "accepted"}` de inmediato.
  2. Encola el payload (Redis, queue interna o al menos `asyncio.create_task`) para que `handle_incoming_message` corra fuera del request HTTP.
  3. Si se usa cola persistente, agrega un monitor/alerta cuando el lag pase X segundos para saber si el worker va atrasado.

## 2. Idempotencia por `MessageSid`
- **Problema actual:** el mismo mensaje (`MessageSid`) gatilla dos veces `_generate_assistant_reply`.
- **Objetivo:** garantizar que cada `MessageSid` se procese una sola vez aun cuando Twilio reintente.
- **Acciones sugeridas:**
  1. Antes de llamar a OpenAI, consulta si ya existe un registro para ese `message_sid` (helper en `storage` o índice único en la tabla `mensajes`).
  2. Si ya está registrado, termina la función sin generar respuesta ni reenviar mensajes.
  3. Implementa un índice único en la BD (`twilio_message_sid`) para reforzar la idempotencia a nivel de persistencia.
  4. Registra un log tipo `whatsapp.duplicate_webhook_detected` para saber cuántas veces Twilio reintenta.

## 3. Estrategia de fallback
- **Problema actual:** el endpoint `/api/whatsapp/fallback` ejecuta exactamente el mismo flujo y, combinado con los puntos anteriores, duplica respuestas.
- **Objetivo:** mantener redundancia sin volver a contactar al cliente dos veces.
- **Acciones sugeridas:**
  1. Cambiar el fallback para que solo registre el mensaje y encole el job (igual que el webhook principal), sin ejecutar la respuesta inmediatamente.
  2. Alternativa conservadora: deshabilitar el fallback en Twilio una vez que el endpoint principal responde rápido e idempotente.
  3. Si se conserva, documentar que su rol es “backup” y que cualquier envío al cliente debe pasar por la verificación de `MessageSid`.

## Resultado esperado
Con estas tres líneas de trabajo:
- Twilio siempre recibirá un 200 rápido, evitando la reejecución automática.
- Aunque Twilio reintente, la validación por `MessageSid` evitará respuestas duplicadas.
- El fallback seguirá existiendo como red de seguridad pero sin reinyectar mensajes al cliente.
