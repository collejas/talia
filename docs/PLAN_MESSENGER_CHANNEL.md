# Plan de integración del canal Messenger

Checklist detallada para replicar en Messenger el flujo que ya opera en WhatsApp y Webchat (registro, CRM, asistente, reenganche/escalación):

## 1. Infraestructura de webhook y entrada de mensajes
- [ ] Documentar las credenciales necesarias (`MESSENGER_VERIFY_TOKEN`, `MESSENGER_PAGE_ACCESS_TOKEN`, `MESSENGER_APP_SECRET`, `MESSENGER_DEFAULT_ORGANIZACION_ID`) y dónde configurarlas (Supabase/Secret manager).  
- [ ] Crear un endpoint FastAPI que valide el `verify_token` durante la verificación inicial y reciba eventos `messages`, `standby`, `message_read`.
- [ ] Diseñar y documentar el parser de payloads para extraer `sender.id`, `recipient.id`, `message.mid`, texto, attachments y metadatos (quick replies/posts).
- [ ] Registrar métricas/logs de llegada (`messenger.incoming_received`) y cualquier error durante el parseo.

## 2. Persistencia y CRM
- [ ] Reusar `storage.register_*` (posiblemente creando un helper `register_messenger_message`) para guardar cada mensaje con `channel="messenger"`, `organizacion_id` resuelto y `inactivity_minutes` (configurable).  
- [ ] Garantizar que cada mensaje crea o actualiza `identidades_canal` y `conversaciones`, y que `ensure_conversation_opportunity` se llama igual que en WhatsApp, con `channel="messenger"`, `force_new_opportunity_on_restart` cuando se detecta reinicio y metadata que indique `messenger_followup`.  
- [ ] Confirmar que el contacto ya existe o se crea, y que `contacto_datos.webchat_followup`/similar se inicializa si es necesario (los helpers actuales podrían servir para varios canales).

## 3. Assistant loop y respuesta
- [ ] Reusar la infraestructura de assistant: `ToolRuntimeContext`, `run_tool_loop`, `assistant_spec` y `lead_tools`.  
- [ ] Crear utilería similar a `whatsapp/service.py` que arme el prompt, invoque OpenAI y genere el payload de respuesta.  
- [ ] Implementar respuesta a Messenger vía POST `https://graph.facebook.com/v17.0/<PAGE_ID>/messages` usando la plantilla que el asistente reemplace.  
- [ ] Registrar logs `messenger.reply_sent`, `messenger.failed_response`, etc.

## 4. Tools y reenganches
- [ ] Verificar si los helpers existentes (`webchat_followups`, `lead_tools`) pueden reutilizarse para Messenger o se necesita `messenger_followups` (posiblemente usando los mismos campos de metadata y el job general).  
- [ ] Asegurarse de que los triggers de `mark_contact_ready`, `send_information_email`, `schedule_demo` funcionen cuando el canal es Messenger; si no, extender los tools para detectar `channel=="messenger"`.  
- [ ] Documentar los eventos nuevos que se emitirán (`messenger.followup.*`) y cómo se integran con el CRM (reenganches, escalaciones, auditorías).

## 5. Configuración multitenant
- [ ] Determinar cómo mapear `sender.id` al tenant (`organizacion_id`): usar un header o la configuración de la página para cada tenant, tal como se hace en WhatsApp con `resolve_whatsapp_organizacion`.  
- [ ] Añadir variables de entorno para cada tenant si hay varios `page_id`s y definir cómo se enruta por `recipient.id`.  
- [ ] Documentar en el plan la forma de desplegar múltiples suscripciones de Messenger en el mismo backend (puede requerir rutas con `{page_id}`).

## 6. QA y pruebas
- [ ] Escribir tests unitarios que simulen payloads de Messenger (text, attachments, quick replies) y verifiquen que se registra el mensaje y se llama al asistente.  
- [ ] Mockear la llamada a Facebook cuando se responde y comprobar el payload (texto, quick replies, attachments).  
- [ ] Ejecutar `poetry run pytest backend/tests/channels` y cubrir el nuevo módulo.

## 7. Documentación y monitoreo
- [ ] Actualizar `docs/canales` con una sección para Messenger que describa endpoints, metadatos, eventos y variables.  
- [ ] Añadir entradas de log/metricas en `app/core/logging.py` si es necesario.  
- [ ] Configurar alertas (e.g., en logs/observabilidad) para detectar fallas en el webhook o en la respuesta de Facebook.

