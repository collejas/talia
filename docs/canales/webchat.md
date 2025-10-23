# Canal Webchat · TalIA

## Objetivo
Permitir que usuarios del landing conversacional interactúen con TalIA en tiempo real, capturando datos de lead sin depender de terceros.

## Arquitectura
- **Frontend**: widget/chat en `landing/src` que envía mensajes al backend via REST (Fase 0/1) o WebSocket (Fase 2+).
- **Backend**: endpoints en `app/channels/webchat/` que orquestan la conversación con OpenAI.
- **OpenAI**: asistente configurado en dashboard, identificado por `TALIA_OPENAI_ASSISTANT_ID`.

## Endpoints planificados
- `POST /api/webchat/messages`
  - Body (`WebchatMessage`): `{ session_id, author, content, locale? }`.
  - Respuesta temporal: `{ status: "queued" }` (Fase 1). Posteriormente devolverá la respuesta del asistente.
- `GET /api/webchat/history/{session_id}` (pendiente): recupera historial desde BD.
- `WS /api/webchat/stream` (pendiente): streaming en tiempo real.

## Variables y configuración
- `.env`:
  - `TALIA_OPENAI_ASSISTANT_ID`
  - `TALIA_OPENAI_API_KEY`
- Posible token corto para asegurar el widget (`TALIA_WEBCHAT_PUBLIC_TOKEN`).

## Flujo Conversacional
1. Usuario escribe en el widget → se envía `POST /messages`.
2. Backend crea/usa un thread de OpenAI (usando `session_id`).
3. Respuesta se entrega al frontend (pull o push en WebSocket).
4. Se registran eventos y datos de lead cuando el asistente confirma nombre/correo/teléfono.

## Registro en base de datos
- Tabla `webchat_sessions`
  - `session_id`
  - `assistant_thread_id`
  - `created_at`
  - `last_activity`
- Tabla `messages`
  - `id`
  - `session_id`
  - `role`
  - `content`
  - `created_at`
- Tabla `leads`
  - `id`
  - `session_id`
  - `name`, `email`, `phone`
  - `source` (`"webchat"`)

## Eventos clave
- `webchat_started`
- `webchat_message_sent`
- `webchat_message_received`
- `lead_captured`

## Consideraciones
- Implementar rate limiting básico por `session_id`/IP.
- Guardar consentimiento antes de enviar datos personales.
- Preparar pruebas de snapshots para asegurar la conversación base.
