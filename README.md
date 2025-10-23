# Proyecto Talia

Panorama general

TalIA es una plataforma FastAPI que unifica WhatsApp, voz (Twilio), Instagram y webchat en un mismo backend impulsado por OpenAI, con almacenamiento opcional en Postgres/Supabase y un sitio web estático incluido.
El servicio levanta middleware de trazabilidad, prepara CORS abierto para despliegues multi-origen y monta routers específicos para cada canal desde un núcleo único en main.py.
Capacidades clave
Automatización multicanal

El backend expone webhooks listos para conectar Twilio WhatsApp (recepción, adjuntos, envíos, callbacks), flujo de voz en tiempo real con <Connect><Stream>, y placeholders activos para Instagram y webchat, permitiendo que un mismo agente atienda clientes sin importar el canal de entrada.
Inteligencia y personalización

La capa assistant/ abstrae agentes, prompts y versiones en base de datos, resolviendo configuraciones en tiempo de ejecución y habilitando un “prompt wizard” que genera instrucciones, variables, herramientas y guardrails personalizados por industria, tono y objetivos comerciales.

Esto permite adaptar la experiencia conversacional a cualquier negocio sin reescribir código.
Analítica y operación

Los endpoints /api/dashboard/* calculan KPIs, embudos y actividad por agente en ventanas de tiempo configurables, reutilizando consultas agregadas de la base de datos para ofrecer métricas de leads, tiempos de respuesta y carga operativa.
La base de datos registra conversaciones, mensajes, adjuntos y eventos de auditoría, mientras que el panel web existente consume estas métricas de forma inmediata.
Landing conversacional

El sitio público se simplificará a una interfaz tipo ChatGPT: un campo de conversación y las respuestas de TalIA. El layout replica la vista ‘logged out’ (sin sesión) de ChatGPT: fondo limpio, logo discreto, sugerencias opcionales y un único cuadro de texto centrado sobre el pie fijo. Este flujo se conectará a un prompt alojado en OpenAI que explica el producto, presenta precios y recopila nombre, correo y teléfono para iniciar el proceso comercial.

Integraciones y despliegue

El sistema integra Google Places para enriquecer búsquedas de prospectos, manejando paginación y deduplicación automática desde la API oficial.
La configuración centraliza credenciales de OpenAI, Twilio y Supabase, incluyendo soporte para tokens efímeros de streaming de voz y validación de firmas entrantes, lo que facilita escalar con seguridad en entornos productivos.

Base de datos y seguridad

El proyecto opera sobre Supabase/Postgres con un esquema normalizado para contactos, conversaciones, mensajes, adjuntos y eventos. La migración `supabase/migrations/20251023_160500_rls_policies.sql` agrega funciones helper (`puede_ver_conversacion`, `puede_ver_mensaje`) y políticas RLS que aíslan la información por usuario (propietario del contacto o agente asignado) manteniendo privilegios de administración. Para respaldos iniciales y automáticos se incluye `backend/scripts/backup_db.py`, que genera dumps completos y de sólo esquema usando `pg_dump` y las credenciales definidas en `backend/.env`.

Registro de interacciones

- La migración `supabase/migrations/20251024_170500_webchat_persistence.sql` expone la función RPC `registrar_mensaje_webchat`, encargada de crear contactos/identidades webchat, abrir conversaciones activas y persistir mensajes con metadatos.
- El servicio `backend/app/channels/webchat/service.py` consume esa RPC para guardar tanto el turno del visitante como la respuesta de OpenAI, devolviendo `conversation_id`/`message_id` al frontend.
- Cada request adjunta metadata contextual (locale, IP, user-agent y geolocalización aproximada vía `TALIA_GEOLOCATION_API_URL`/`TALIA_GEOLOCATION_API_TOKEN`); la primera interacción se almacena en `contacto_datos` del lead.
- Se infiere el tipo de dispositivo (`desktop`, `mobile`, `tablet`) a partir del user-agent y se persiste junto al mensaje.
- Las pruebas (`poetry run pytest`) validan los escenarios existentes; actualmente 8 casos pasan y 2 quedan marcados como `skip` (placeholders de canales pendientes).

Logging y depuración

- El backend emite logs JSON con nivel `DEBUG` en ambientes que no sean producción (`app/core/logging.py`).
- Middleware `RequestLoggingMiddleware` registra cada request con `request_id`, estado HTTP, duración e IP cliente (cabecera `x-forwarded-for` cuando existe).
- Los canales escriben eventos estructurados (`webchat.message_received`, `webchat.message_sent`) que facilitan correlacionar turnos con IDs de Supabase usando `journalctl -u talia-api.service -f`.
- Además de stdout, los logs rotan en `/home/devuser/talia/logs/api.log` (5 archivos de 10 MB) y se generan trazas específicas en `/home/devuser/talia/logs/request.log`, `/home/devuser/talia/logs/webchat.log`, `/home/devuser/talia/logs/whatsapp.log` y `/home/devuser/talia/logs/voice.log` para depurar peticiones y cada canal.
Descripción sugerida para la landing

“TalIA es el asistente de IA omnicanal para negocios que quieren convertir más leads sin crecer su equipo. Atiende WhatsApp, llamadas, Instagram y webchat desde un solo backend, personaliza prompts para cada vertical y enriquece conversaciones con datos externos como Google Places. Tus agentes obtienen embudos, KPIs y actividad en vivo, mientras la infraestructura se encarga de adjuntos, seguridad y despliegue listo para producción.”
