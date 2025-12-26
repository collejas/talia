# Canal Webchat · TalIA

## Objetivo
Permitir que usuarios del landing conversacional interactúen con TalIA en tiempo real, capturando datos de lead sin depender de terceros.

## Arquitectura
- **Frontend**: widget/chat en `landing/src` que envía mensajes al backend via REST (Fase 0/1) o WebSocket (Fase 2+).
- **Backend**: endpoints en `app/channels/webchat/` que orquestan la conversación con OpenAI.
- **OpenAI**: asistente configurado en dashboard, identificado por `TALIA_OPENAI_ASSISTANT_ID`.
- **Persistencia**: la función RPC `public.registrar_mensaje_webchat` (migración `20251024_170500_webchat_persistence.sql`) crea contactos, abre conversaciones y guarda cada turno en Supabase, adjuntando metadata (locale, IP, user-agent, tipo de dispositivo, geolocalización si está disponible).

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
  - `TALIA_WEBCHAT_INACTIVITY_HOURS` (por defecto 24)
- Posible token corto para asegurar el widget (`TALIA_WEBCHAT_PUBLIC_TOKEN`).

## Flujo Conversacional
1. Usuario escribe en el widget → se envía `POST /messages`.
2. Backend crea/usa un identificador de conversación de OpenAI (Chat Prompts: `conv_...`, Assistants Threads: `thread.id`). Con Chat Prompts usamos `conversacion_openai_id` persistido; si pasan `TALIA_WEBCHAT_INACTIVITY_HOURS` sin actividad, se inicia una nueva conversación.
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

## Seguimiento y reenganches automáticos
- `contactos.contacto_datos.webchat_followup` guarda el estado de captura/autorización: contiene `state` con `fields` (timestamps `email_captured_at`, `phone_captured_at`, `company_captured_at`, `need_captured_at`), `contact_ready_at`, `datos_completos_at` y `entrega_realizada_at`. La clave `stop_reason` explica por qué se frenó el workflow (ej. `datos_completos`, `entrega`, `session_closed`).  
- El job `webchat_followups.run_followups` revisa conversaciones `webchat` inactivas, ignora las que tengan `datos_completos_at`/`entrega_realizada_at`, verifica cierres con `webchat_session_closures` y registra en metadata cada intento `webchat_followup.state.reengage` con `attempts`, `sent_at` y `last_message`.  
- Se documentan eventos de observabilidad como `webchat.followup.reengage_sent`, `webchat.followup.skipped_session_closed`, `webchat.followup.reengage_recorded`, `webchat.followup.state_updated` y `webchat_followup.stop_reason_marked`.  
- Cuando los `attempts` llegan a `WEBCHAT_REENGAGE_MAX_ATTEMPTS`, el job dispara una notificación al vendedor asignado registrando la entrada `sales_notifications.webchat_escalate` en la oportunidad, marca `webchat_followup.state.stop_reason` como `reengage_limit` y emite `webchat.followup.escalated`; se evitan duplicados con `webchat.followup.escalate_skipped_duplicate` y cualquier fallo queda en `webchat.followup.escalate_failed`.  
- Los endpoints y tools que buscan asignar un vendedor (ej. `schedule_calendar_booking`, `schedule_demo`) hacen uso de `webchat_followups.ensure_contact_ready_for_assignment` y el helper `service._ensure_opportunity_when_contact_ready` antes de invocar `storage.ensure_conversation_opportunity`, así que si no hay al menos un teléfono o correo el gate emite `webchat.assignment.blocked_contact_missing` y responde con el mensaje `"Necesito al menos un teléfono o correo para conectarte con un vendedor."`.  
- Configuración: `WEBCHAT_REENGAGE_MINUTES` define el SLA de inactividad, `WEBCHAT_REENGAGE_MAX_ATTEMPTS` limita los intentos y `WEBCHAT_REENGAGE_MINUTES` se puede ajustar por tenant en env.  
- El asistente ofrece tool `mark_contact_ready` y el helper `capture_opportunity_if_ready` para asegurar que la asignación de vendedores solo ocurra después de capturar al menos teléfono o correo. La tool dispara `ensure_contact_ready_for_assignment` y, si se cumplen los datos, llama a `capture_opportunity_if_ready` antes de registrar la oportunidad.  

## Consideraciones
- Implementar rate limiting básico por `session_id`/IP.
- Guardar consentimiento antes de enviar datos personales.
- Preparar pruebas de snapshots para asegurar la conversación base.
 - Persistir el `conversacion_openai_id` (ID `conv_...` de OpenAI) asociado al hilo para conservar memoria entre reinicios y réplicas. Si pasan 24 horas sin actividad, se inicia una nueva conversación y se reinicia el `conversacion_openai_id`.
