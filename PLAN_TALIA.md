# Plan de desarrollo TalIA

## Contexto actual
- **Landing pública** (`landing/src/index.html`): hoy comunica la propuesta de valor con secciones estáticas; evolucionará a una vista tipo ChatGPT con un único campo de conversación y respuestas conectadas a un prompt controlado desde OpenAI.
- **Estilos y experiencia** (`landing/src/assets/css/styles.css`): define tokens de diseño, variantes de color y comportamiento responsive.
- **Interacción demo** (`landing/src/assets/js/main.js`, `landing/src/data/chat-responses.js`): administra temas, mensajes de bienvenida y simulación de respuestas.
- **Infraestructura web**: Nginx sirve la landing desde `/var/www/talia-landing`, con certificados Let’s Encrypt activos y HTTP→HTTPS forzado.
- **Documentación existente**: `README.md` describe la visión del backend FastAPI multicanal; `Que _llevo _realizado.md` detalla alcance actual; `comandos_configuracion_inicial.md` registra pasos de despliegue de la landing.

## Objetivos generales
1. Entregar un backend FastAPI unificado para WhatsApp, voz (Twilio), Instagram y webchat.
2. Transformar la landing en una experiencia conversacional que replique la pantalla inicial de ChatGPT, conectada a un prompt de ventas alojado en OpenAI.
3. Construir una capa de asistentes configurable (prompts, herramientas, guardrails) respaldada por base de datos.
4. Proveer analítica en tiempo real (KPIs, embudos, actividad por agente) consumida por un dashboard web.
5. Garantizar operación segura: aislamiento de datos, cumplimiento y observabilidad.

## Diseño de la landing conversacional
- Mantener un layout centrado tipo ‘logged out’ de ChatGPT: logo/firma TalIA discreto arriba, contenedor principal con saludo, sugerencias (chips opcionales) y área de mensajes.
- Fondo minimal (degradado suave) reutilizando variables del tema `theme-aurora`, con posibilidad de tema oscuro/ligero si mantenemos selector.
- Pie fijo con campo de entrada redondeado, botón principal y mensajes de estado ("TalIA está escribiendo", validaciones).
- Definir estados iniciales: pantalla en blanco, primer mensaje automático del asistente, burbuja typing y errores.
- Incorporar copy de venta (beneficios, planes, garantías) dentro de respuestas guiadas del prompt.
- Añadir CTA secundario (por ejemplo "Hablar con un humano" o enlace a correo) fuera del chat para usuarios que no completan el flujo.

## Fases de trabajo
### Fase 0 · Preparación
- Inventariar credenciales (Twilio, OpenAI, Supabase/Postgres, SendGrid u otros).
- Definir estrategia de despliegue (Docker/Compose vs. servicios gestionados) y flujo CI/CD.
- Diseñar el guion conversacional del landing (prompt en OpenAI) y las métricas de captación (nombre, correo, teléfono).
- Documentar wireframe y estados UI basados en la vista 'sin sesión' de ChatGPT (layout, tipografía, degradados, estados typing/error).
- Configurar repositorio para backend (estructura FastAPI, linters, tests).

### Fase 1 · Núcleo FastAPI
- Generar proyecto base (`app/main.py`, configuración, routers modulares).
- Implementar autenticación básica y estructura de middlewares (CORS, trazabilidad, manejo de errores).
- Modelar esquemas `pydantic` y ORMs iniciales (usuarios, conversaciones, mensajes, adjuntos).

### Fase 2 · Integraciones de canales
- **Twilio WhatsApp**: endpoints de recepción, envío, manejo de adjuntos y callbacks de estado.
- **Twilio Voice**: flujo `<Connect><Stream>` para transcripción y respuesta en tiempo real.
- **Instagram / Webchat**: placeholders avanzados para pruebas internos; definir eventos y payloads esperados.
- Gestionar validación de firmas y reintentos para cada canal.

### Fase 3 · Inteligencia conversacional
- Implementar módulo `assistant/` para prompts versionados, variables dinámicas y guardrails.
- Integrar OpenAI (o proveedor equivalente) con caching, límites de uso y logs de auditoría.
- Crear “prompt wizard” configurable por vertical, tono y objetivos comerciales.

### Fase 4 · Persistencia y analítica
- Diseñar esquema en Supabase/Postgres para conversaciones, eventos y métricas.
- Construir consultas agregadas para KPIs (leads, tiempos de respuesta, carga por agente).
- Exponer endpoints `/api/dashboard/*` reutilizando agregaciones.
- Asegurar migraciones reproducibles (Alembic) y tests de integridad de datos.

### Fase 5 · Frontend operativa y observabilidad
- Reemplazar la landing por la interfaz tipo ChatGPT conectada al prompt de ventas y a un pipeline de captura de leads, respetando el wireframe definido (contenedor central, pie fijo, estados typing/error).
- Construir dashboard web que consuma las métricas; integrar autenticación.
- Añadir monitoreo (logs centralizados, alertas, tracing) y políticas de retención.
- Formalizar playbooks de operación, rollback y renovación de certificados.

## Dependencias y recursos clave
- Twilio (WhatsApp Business, Programmable Voice).
- OpenAI (modelos de lenguaje, embeddings).
- Supabase/Postgres para almacenamiento estructurado.
- Nginx como reverse proxy y gestión SSL.
- Pipelines CI/CD (GitHub Actions u otro) para pruebas, despliegues y sincronización de la landing.

## Riesgos y mitigaciones
- **Integraciones externas**: manejar límites de tasa y fallos transitorios con colas/reintentos.
- **Seguridad de datos**: aplicar aislamiento por cliente, cifrado en reposo y tránsito, monitoreo de accesos.
- **Escalabilidad**: diseñar arquitectura que permita horizontalidad (workers, WebSockets, streaming).
- **Mantenimiento**: documentar procesos, automatizar backups y renovaciones.

## Métricas de éxito y entregables
- Landing conversacional en producción, conectada al prompt de ventas y registrando leads contactables.
- Backend con cobertura de tests y documentación de API (OpenAPI/Swagger).
- Procesos automatizados de despliegue y renovación de certificados válidos.
- Dashboard con KPIs clave y reportes exportables.
- Checklist de tareas actualizado y trazable.
