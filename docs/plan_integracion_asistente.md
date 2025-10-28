## Plan de Integración Tal-IA con Dashboard de OpenAI

### 1. Normalizar prompts y funciones
- Consolidar `docs/prompt_landing.md` como fuente de instrucciones para el asistente “Tal-IA”.
- Publicar en el dashboard de OpenAI las funciones descritas en `docs/funciones_prompt_openai.md`, asegurando validaciones (`strict`).
- Documentar en el dashboard la dependencia de `conversacion_id` con la BD (tablas `contactos` y `conversaciones`).
- Registrar que el contexto conversacional se mantiene en OpenAI usando `conversation_id` de `/v1/responses`. Supabase almacena el historial completo y datos del lead, pero cada turno reutiliza el `conversation_id` para evitar reenviar todo el historial.
- Ajustar el prompt para que cada function call incluya siempre un `conversacion_id` válido (o alias soportado) y explicar que el backend responderá con `function_call_output` por cada `call_id`, repitiendo el flujo `responses.create → ejecutar función → responses.create` hasta recibir el mensaje final del asistente.
- Definir explícitamente la política de herramientas: si sólo se permite una tool call por turno, configurar `tool_choice` o `max_tool_calls=1`; si se admiten múltiples, describir cómo se encadenarán secuencialmente respetando `parallel_tool_calls`.

### 2. API Webchat (nuevo backend)
- Crear módulo `app/channels/webchat/` con router FastAPI (`/api/webchat`) que exponga:
  - `POST /messages`: gestiona turnos, llama a OpenAI, procesa `function_call` y reintenta `responses.create` con los `function_call_output` generados hasta cerrar el ciclo; persiste cada mensaje via `registrar_mensaje_webchat`.
  - `GET /messages`: devuelve historial paginado para el widget (usa `storage.fetch_recent_messages` o equivalente).
  - `POST /close`: registra cierre en `webchat_session_closures`.
- Reutilizar `app/services/openai` y `app/assistants/manager` para resolver el `assistant_id`.
- Implementar orquestador que traduzca las tool calls (`set_*`, `close_lead`) en actualizaciones Supabase (`contactos`, `lead_tarjetas`, `conversaciones`), retornando `function_call_output` JSON válido por cada `call_id` recibido.
- Construir el payload de `responses.create` siguiendo el esquema oficial (`input` como lista de mensajes con `type: input_text`, `conversation` con el ID persistido y `tools` definidos) y, si la conversación aún no existe en OpenAI, iniciar con `previous_response_id` para mantener continuidad.
- Registrar métricas en `public.ejecuciones_asistente`, almacenar `response.id`, `previous_response_id`, `call_id` y `conversation_id` asociados a cada turno, y controlar modo manual vía `conversaciones_controles`.

### 3. Persistencia y Supabase
- Revisar `registrar_mensaje_webchat` (migraciones 20251024–20251029) para asegurar alineación con campos esperados (metadata de sesión, `conversacion_openai_id`, `response_id`).
- Implementar helpers para:
  - Actualizar campos del contacto (`set_full_name`, `set_email`, `set_phone_number`, `set_company_name`).
  - Ejecutar `close_lead` creando/actualizando `lead_tarjetas`, `lead_movimientos` y `conversaciones_insights`.
  - Persistir el `response.id` devuelto por OpenAI, el `previous_response_id` retornado al cerrar cada turno y los `call_id` procesados, de modo que el historial y las auditorías puedan reconstruirse.
- Validar RLS/policies necesarias (`service_role`, `anon`) y JWT (`supabase_anon`, `supabase_service_role`).

### 4. Frontend y métricas
- Conectar el widget (`landing/src/assets/js/modules/chat.js`) a la nueva API, incluyendo metadata (`assistant_response_id`, `conversation_id`, `manual_mode`) para distinguir respuestas del asistente frente a intervenciones humanas.
- Asegurar que el panel (`app/public/panel/*`) consume nuevos KPIs provenientes de `conversaciones`, `lead_tarjetas`, `webchat_session_closures` y que pueda trazar conversaciones usando `response.id` y `conversacion_openai_id`.
- Instrumentar cierres de sesión desde el widget con `POST /api/webchat/close` para alimentar métricas de visitantes/conversión.

### 5. QA y despliegue
- Añadir pruebas unitarias/integración (pytest) para el módulo webchat (mock de OpenAI y Supabase REST).
- Verificar logs dedicados (`whatsapp.log`, `webchat.log`, `voice.log`) y rotación.
- Documentar variables requeridas en `.env` (`TALIA_OPENAI_ASSISTANT_ID`, `TALIA_OPENAI_API_KEY`, `TALIA_SUPABASE_*`, Twilio opcional).
- Preparar checklist de deploy (migraciones Supabase + build estático del panel + despliegue FastAPI).

> **Recordatorio clave:** crear la API de webchat en el backend antes de exponer el asistente en producción.
