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
Integraciones y despliegue

El sistema integra Google Places para enriquecer búsquedas de prospectos, manejando paginación y deduplicación automática desde la API oficial.
La configuración centraliza credenciales de OpenAI, Twilio y Supabase, incluyendo soporte para tokens efímeros de streaming de voz y validación de firmas entrantes, lo que facilita escalar con seguridad en entornos productivos.
Descripción sugerida para la landing

“TalIA es el asistente de IA omnicanal para negocios que quieren convertir más leads sin crecer su equipo. Atiende WhatsApp, llamadas, Instagram y webchat desde un solo backend, personaliza prompts para cada vertical y enriquece conversaciones con datos externos como Google Places. Tus agentes obtienen embudos, KPIs y actividad en vivo, mientras la infraestructura se encarga de adjuntos, seguridad y despliegue listo para producción.”

