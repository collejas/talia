# Inventario de credenciales · TalIA

> Objetivo: centralizar qué credenciales necesita el proyecto, dónde viven, responsables y pasos para rotarlas sin exponer secretos en el repositorio.

## Tabla maestra

| Servicio | Variables sugeridas (.env / Secrets) | Uso principal | Responsables | Notas de rotación |
|----------|--------------------------------------|---------------|--------------|-------------------|
| Twilio Console | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Autenticación API REST para WhatsApp y voz. | Operaciones | Rotar desde Twilio Console → Account → API Keys. Preferir API Keys secundarias en vez del Auth Token maestro. |
| Twilio WhatsApp Sandbox / Business | `TWILIO_WHATSAPP_NUMBER`, `TWILIO_MESSAGING_SERVICE_SID` | Origen de mensajes y plantillas aprobadas. | Operaciones | Documentar cada sender/plantilla y fechas de renovación. |
| Twilio Voice | `TWILIO_TWIML_APP_SID`, `TWILIO_VOICE_WEBHOOK_SECRET` | Streaming `<Connect><Stream>` y validación de firmas. | Backend | Generar secret para validar `X-Twilio-Signature`. |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_PROJECT_ID`, `OPENAI_ORG_ID` | Llamadas a modelos (prompts, embeddings). | IA | Activar rotate en portal de OpenAI y registrar fecha. |
| Supabase / Postgres | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, `SUPABASE_ANON_KEY`, `DATABASE_URL` | Persistencia de conversaciones, eventos, leads. | Datos | Guardar `SERVICE_ROLE` sólo en servidor; comprobar políticas RLS cuando se regenere. |
| SendGrid / mailer | `SENDGRID_API_KEY` o servicio equivalente | Envío de notificaciones y resumen de leads. | Marketing | Configurar API Key con permisos mínimos y activar alertas de rebote. |
| Nginx / Servidor | `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_KEY_PATH` | Scripts de deploy automatizado y sincronización landing. | Infra | Mantener llaves en gestor de secretos (1Password, Vault). Rotar al rotar llaves del servidor. |
| Geolocalización IP (ipapi/ipinfo) | `TALIA_GEOLOCATION_API_URL`, `TALIA_GEOLOCATION_API_TOKEN` (opcional) | Enriquecer leads con ciudad/país aproximados. | Datos | Revisar límites del proveedor y políticas de privacidad al almacenar ubicación. |

## Gestión y almacenamiento
- Utilizar un gestor central (1Password Business / Vault) con acceso por roles: `Infra`, `Backend`, `IA`, `Marketing`.
- Replicar credenciales críticas en un `vault.yaml` encriptado con `sops` o `age` para despliegues automatizados.
- Prohibido subir `.env` al repo. Agregar `env.sample` sin valores reales cuando se cree el backend.
- Documentar cada cambio en un registro interno (fecha, responsable, motivo, fecha de expiración si aplica).

## Checklist operativo
- [ ] Crear bóveda "TalIA Prod" en el gestor de secretos elegido.
- [ ] Cargar las variables anteriores con descripciones y enlaces al servicio.
- [ ] Definir responsables de rotación y frecuencia (recomendado: trimestral para claves API, semestral para llaves SSH).
- [ ] Automatizar notificaciones de expiración/rotación (Google Calendar/Slack).

## Próximos pasos
1. Confirmar si se usará Twilio Business (sender aprobado) o sandbox. Ajustar inventario según plan comercial.
2. Solicitar acceso al equipo de IA para OpenAI y asignar presupuesto mensual.
3. Configurar Supabase: crear proyecto, activar políticas RLS y obtener claves iniciales.
4. Documentar en la misma bóveda las URLs de paneles y datos de facturación asociados.
