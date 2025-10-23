# Canal WhatsApp · TalIA

## Objetivo
Integrar mensajes entrantes y salientes de WhatsApp Business (Twilio) con el backend para conectar visitantes con TalIA y registrar leads.

## Creación y configuración en Twilio
1. **Cuenta**: habilita WhatsApp Business en Twilio Console (`Messaging > Try it out > Send a WhatsApp message`).
2. **Número / Sender**:
   - Sandbox para pruebas: anota `Sandbox Number` y código de unión.
   - Producción: solicita aprobación del número o usa un Messaging Service.
3. **API Keys**: genera `Account SID` + `Auth Token` secundario.
4. **Webhooks**:
   - Inbound: `https://{dominio}/api/whatsapp/webhook` (método POST).
   - Status callbacks: `https://{dominio}/api/whatsapp/status` (se definirá en Fase 2).
5. **Firmas**: activa `Validate requests` y usa `TWILIO_AUTH_TOKEN` para verificar `X-Twilio-Signature`.

## Configuración en backend
- Variables de entorno (`.env`):
  - `TALIA_TWILIO_ACCOUNT_SID`
  - `TALIA_TWILIO_AUTH_TOKEN`
  - `TALIA_WHATSAPP_NUMBER`
  - `TALIA_WHATSAPP_MESSAGING_SERVICE_SID` (opcional)
- Rutas:
  - `POST /api/whatsapp/webhook`: recibe mensajes.
  - `POST /api/whatsapp/status`: (pendiente) procesa callbacks de delivery.
- Servicios involucrados:
  - `app/channels/whatsapp/service.py`
  - `app/services/twilio.py`
  - `app/services/openai.py`
- Dependencies: `app/channels/whatsapp/deps.py` validará firmas.

## Flujo de mensajes
1. Twilio envía payload `application/x-www-form-urlencoded` con campos `From`, `Body`, `WaId`, etc.
2. El backend transforma el payload a `WhatsAppMessage` (`schemas.py`).
3. Se crea/continúa un `thread` en OpenAI con el `ASSISTANT_ID` configurado (no se almacena prompt).
4. Respuesta generada → se envía de vuelta usando `twilio.messages.create`.
5. Guardar interacción en base de datos.

## Registro en base de datos (supuesto inicial)
- Tabla `conversations`
  - `id` (uuid)
  - `channel` (`"whatsapp"`)
  - `external_id` (`WaId`)
  - `status` (`open`, `closed`)
  - `created_at`, `updated_at`
- Tabla `messages`
  - `id`
  - `conversation_id`
  - `role` (`user`, `assistant`)
  - `content`
  - `external_message_id` (SID de Twilio)
  - `sent_at`
- Tabla `leads`
  - `id`
  - `conversation_id`
  - `name`, `email`, `phone`
  - `source` (`"whatsapp"`)

## Eventos para analytics
- `message_received`
- `message_sent`
- `lead_created`
- `handoff_requested`

## Próximos pasos técnicos
- Implementar parseo de payload y validación `X-Twilio-Signature`.
- Crear servicio para enviar mensaje a Twilio y manejar errores.
- Persistir conversación/mensajes en Supabase/Postgres.
- Asegurar reintentos ante fallas (Twilio reenvía max 3 veces).
