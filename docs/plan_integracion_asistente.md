## Plan de Integración Tal-IA con Dashboard de OpenAI

### 1. Normalizar prompts y funciones
- Consolidar `docs/prompt_landing.md` como fuente de instrucciones para el asistente “Tal-IA”.
- Publicar en el dashboard de OpenAI las funciones descritas en `docs/funciones_prompt_openai.md`, asegurando validaciones (`strict`).
- Documentar en el dashboard la dependencia de `conversacion_id` con la BD (tablas `contactos` y `conversaciones`).
- Registrar que el contexto conversacional se mantiene en OpenAI usando `conversation_id` de `/v1/responses`. Supabase almacena el historial completo y datos del lead, pero cada turno reutiliza el `conversation_id` para evitar reenviar todo el historial.
- Documentar en el prompt que cada function call debe incluir un `conversacion_id` válido (o alias soportado) y que las tool calls se devolverán como `function_call` dentro de la respuesta; el backend las ejecutará una sola vez por turno.

### 2. API Webchat (nuevo backend)
- Crear módulo `app/channels/webchat/` con router FastAPI (`/api/webchat`) que exponga:
  - `POST /messages`: gestiona turnos, llama a OpenAI, procesa function calls y persiste mensajes via `registrar_mensaje_webchat`.
  - `GET /messages`: devuelve historial paginado para el widget (usa `storage.fetch_recent_messages` o equivalente).
  - `POST /close`: registra cierre en `webchat_session_closures`.
- Reutilizar `app/services/openai` y `app/assistants/manager` para resolver el `assistant_id`.
- Implementar orquestador que traduzca las tool calls (`set_*`, `close_lead`) en actualizaciones Supabase (`contactos`, `lead_tarjetas`, `conversaciones`).
- Registrar métricas en `public.ejecuciones_asistente` y controlar modo manual (`conversaciones_controles`).

### 3. Persistencia y Supabase
- Revisar `registrar_mensaje_webchat` (migraciones 20251024–20251029) para asegurar alineación con campos esperados (metadata de sesión, `conversacion_openai_id`).
- Implementar helpers para:
  - Actualizar campos del contacto (`set_full_name`, `set_email`, `set_phone_number`, `set_company_name`).
  - Ejecutar `close_lead` creando/actualizando `lead_tarjetas`, `lead_movimientos` y `conversaciones_insights`.
- Validar RLS/policies necesarias (`service_role`, `anon`) y JWT (`supabase_anon`, `supabase_service_role`).

### 4. Frontend y métricas
- Conectar el widget (`landing/src/assets/js/modules/chat.js`) a la nueva API, incluyendo metadata (`assistant_response_id`, `manual_mode`).
- Asegurar que el panel (`app/public/panel/*`) consume nuevos KPIs provenientes de `conversaciones`, `lead_tarjetas`, `webchat_session_closures`.
- Instrumentar cierres de sesión desde el widget con `POST /api/webchat/close` para alimentar métricas de visitantes/conversión.

### 5. QA y despliegue
- Añadir pruebas unitarias/integración (pytest) para el módulo webchat (mock de OpenAI y Supabase REST).
- Verificar logs dedicados (`whatsapp.log`, `webchat.log`, `voice.log`) y rotación.
- Documentar variables requeridas en `.env` (`TALIA_OPENAI_ASSISTANT_ID`, `TALIA_OPENAI_API_KEY`, `TALIA_SUPABASE_*`, Twilio opcional).
- Preparar checklist de deploy (migraciones Supabase + build estático del panel + despliegue FastAPI).

> **Recordatorio clave:** crear la API de webchat en el backend antes de exponer el asistente en producción.
