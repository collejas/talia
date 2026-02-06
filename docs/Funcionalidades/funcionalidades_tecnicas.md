# Funcionalidades principales de TalIA

## 1. Núcleo backend FastAPI
- API central construida con FastAPI que mantiene middleware de trazabilidad, CORS abierto, logging por canal y dos tareas en background (captura de contactos y reenganches).
- Ruteo organizado en módulos: `/api/admin`, `/api/crm`, `/api/propuesta`, `/api/tenant`, más routers dedicados para cada canal (webchat, WhatsApp, Messenger y voz).
- Servicios compartidos (OpenAI, Twilio, almacenamiento, tenant runtime, calendarios, geolocalización) con repositorios que abstraen la persistencia en Supabase/Postgres.

## 2. Atención multicanal
- **Webchat**: widget conectado desde `landing`/`frontend`, recibe mensajes y adjuntos, administra sesiones, persiste conversaciones y dispara followups automáticos. Cuenta con endpoints para historial, uploads, visitas y calendario de demos.
- **WhatsApp**: integra webhooks de Twilio (mensaje entrante, status callback) y orquesta conversación con OpenAI para responder, almacenar mensajes y crear leads.
- **Voz**: responde a Twilio Voice con TwiML `<Connect><Stream>`, procesa audio (ASR/LLM) y registra llamadas, transcripciones y métricas asociadas.
- **Messenger** (planificado): estructura similar basada en endpoints dedicados y resoluciones de alias.

## 3. Experiencia del panel y landing
- Panel Next.js (`frontend/panel`) ofrece el dashboard multi-tenant, vistas de métricas, onboarding y herramientas de configuración (tenants, rutas, secretos). El backend expone la SPA en `/panel-react`.
- Landing conversacional tipo ChatGPT que promueve el widget webchat, muestra características y vincula al dashboard/widget.
- Documentación y planes en `docs/` explican cómo personalizar prompts, prompts bounds, campañas y estrategias comerciales.

## 4. Multi-tenancy y gobernanza
- Tablas principales: `organizaciones`, `organizacion_rutas_canal`, `secretos`, `platform_admins`. Permiten asignar alias (widget), números WhatsApp y configuraciones por tenant sin añadir más variables de entorno.
- Configuración runtime lee `organizaciones.config`; los secretos se rotan vía `secretos`. Están los endpoints `GET/PUT /api/admin/tenants/{org}/config` y CRUD de rutas/secrets.
- Auditoría y seguridad reforzada con políticas RLS (`supabase/migrations/20251023_160500_rls_policies.sql`) y funciones helper como `puede_ver_conversacion`.

## 5. Persistencia y analítica
- Supabase/Postgres estructuran contactos, conversaciones, mensajes, adjuntos, oportunidades, leads, campañas, calendarios y métricas. Los dumps están en `backups/postgres_*` y se generan con `backend/scripts/backup_db.py`.
- Eventos clave (`webchat_message_received`, `webchat.followup.*`, `call_started`, `lead_captured`) se escriben en logs JSON y en tablas tipo `eventos_auditoria`, `audit_logs`, `webchat_session_closures`.
- El CRM ofrece endpoints para importar leads, métricas de ventas, seguimiento de oportunidades y log de actividades.

## 6. Integraciones y herramientas auxiliares
- OpenAI Assistant/Prompts configurables (registro de versiones y prompts/custom tools) permiten personalizar la respuesta por vertical; el runtime resuelve asistente/prompt en función de `assistant_id`.
- Twilio (WhatsApp y voz) y Google Places enriquecen datos de prospecto, con validaciones (X-Twilio-Signature, geolocalización, etc.).
- Jobs de prospección/buscador (`services/google_search_jobs`, `buscador`) automatizan envíos de campañas y perfiles de leads enriquecidos.
- El sistema provee APIs públicas y documentación para registrar visitas, cerrar sesiones, manejar reenganches, reservar demos y notificar a agentes.

## 7. Operación y monitoreo
- Logging se canaliza por archivo por módulo (`logs/request.log`, `webchat.log`, `whatsapp.log`, etc.) y se estructura en formato JSON con request_id.
- Métricas de usuarios/agentes se exponen en `/api/dashboard/*` (KPIs, embudos, tiempos de respuesta).
- Scripts de respaldo y tests (`poetry run pytest`) y linters (`ruff`) facilitan mantener la estabilidad.
