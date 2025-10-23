# Canal Webchat · TalIA

## Objetivo
Permitir que usuarios del landing conversacional interactúen con TalIA en tiempo real, capturando datos de lead sin depender de terceros.

## Arquitectura
- **Frontend**: widget/chat en `landing/src` que envía mensajes al backend via REST (Fase 0/1) o WebSocket (Fase 2+).
- **Backend**: endpoints en `app/channels/webchat/` que orquestan la conversación con OpenAI.
- **OpenAI**: asistente configurado en dashboard, identificado por `TALIA_OPENAI_ASSISTANT_ID`.
- **Persistencia**: la función RPC `public.registrar_mensaje_webchat` (migración `20251024_170500_webchat_persistence.sql`) crea contactos, abre conversaciones y guarda cada turno en Supabase, adjuntando metadata (locale, IP, user-agent, geolocalización si está disponible).

## Endpoints planificados
- `POST /api/webchat/messages`
  - Body (`WebchatMessage`): `{ session_id, author, content, locale? }`.
  - Respuesta actual: `{ reply, metadata }` donde `metadata` incluye `conversation_id`, `last_message_id`, `assistant_message_id` y opcionalmente `assistant_response_id`.
  - El backend detecta IP y `user-agent` desde el `Request`, y puede integrar un proveedor externo (`TALIA_GEOLOCATION_API_URL`/`TOKEN`) para enriquecer la metadata.
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
- Tabla `mensajes`
  - `id`
  - `conversacion_id`
  - `direccion`
  - `tipo_contenido`
  - `texto`
  - `datos` (incluye `session_id`, `author`, metadata extra)
  - `estado`
  - `creado_en`
- Tabla `contactos`
  - `id`
  - `nombre_completo`
  - `contacto_datos` (`session_id`, datos opcionales)
  - `origen` (`"webchat"`)

## Eventos clave
- `webchat_started` → detección via creación de conversación/identidad.
- `webchat_message_sent` / `webchat_message_received` → almacenados en `public.mensajes` con `direccion` `entrante/saliente`.
- `lead_captured` → completar datos en `contactos` y `conversaciones`.

## Consideraciones
- Implementar rate limiting básico por `session_id`/IP.
- Guardar consentimiento antes de enviar datos personales.
- Preparar pruebas de snapshots para asegurar la conversación base.
