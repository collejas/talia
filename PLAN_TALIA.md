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

- ### Fase 4 · Persistencia y analítica
- ✅ Esquema base creado en Supabase/Postgres (conversaciones, mensajes, eventos, leads) + políticas RLS aplicadas vía migración `20251023_160500_rls_policies.sql`.
- ✅ Función RPC `registrar_mensaje_webchat` en Supabase (migración `20251024_170500_webchat_persistence.sql`) y servicio FastAPI registrando mensajes con metadata contextual (locale, IP, user-agent, geolocalización opcional).
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






• Hallazgos

  - backups/postgres_20251025_201958_schema.sql:3393 define public.contactos con origen, propietario_usuario_id, estado in
    ('lead','activo','bloqueado') y contacto_datos jsonb; este es hoy el contenedor de leads.
  - backups/postgres_20251025_201958_schema.sql:3411 define public.conversaciones enlazadas a contactos, con canal, estado,
    asignado_a_usuario_id y soporte para último mensaje; es la pieza central multicanal.
  - backups/postgres_20251025_201958_schema.sql:3487 aporta public.conversaciones_insights con lead_score, siguiente_accion,
    tags; ya tienes analítica que conviene reutilizar en el tablero.
  - backups/postgres_20251025_201958_schema.sql:3602 muestra public.identidades_canal que relaciona contactos con
    identificadores externos por canal (whatsapp/webchat/voz/instagram).
  - RLS existente (backups/postgres_20251025_201958_schema.sql:6306-6393) concede acceso a propietarios/usuarios asignados
    usando helpers public.es_admin y public.puede_ver_conversacion; cualquier nueva tabla debe seguir este patrón.

  Nueva Estructura

  - public.lead_tableros: id uuid PK, nombre, slug, departamento_id uuid?, es_default boolean, propietario_usuario_id uuid,
    creado_en/actualizado_en; permite futuros tableros por equipo sin romper la vista global.
  - public.lead_etapas: id uuid PK, tablero_id uuid FK lead_tableros, codigo, nombre, orden smallint, probabilidad
    numeric(5,2), categoria text CHECK ('abierta','ganada','perdida'), sla_horas integer, metadatos jsonb; así modelas columnas
    kanban y SLA.
  - public.lead_tarjetas: id uuid PK, contacto_id uuid FK contactos, conversacion_id uuid FK conversaciones, tablero_id
    uuid, etapa_id uuid, canal text CHECK como conversaciones, propietario_usuario_id uuid (fallback a contacto),
    asignado_a_usuario_id uuid, monto_estimado numeric(12,2), moneda char(3), probabilidad_override numeric(5,2), motivo_cierre
    text, cerrado_en timestamptz, lead_score integer DEFAULT insights.lead_score, tags text[], metadata jsonb, timestamps; es
    la tarjeta que el asistente crea/mueve.
  - public.lead_movimientos: id uuid PK, tarjeta_id uuid FK lead_tarjetas, etapa_origen_id uuid, etapa_destino_id uuid,
    cambiado_por uuid, cambiado_en timestamptz DEFAULT now(), motivo text, fuente text CHECK('asistente','humano','api');
    conserva historial y habilita auditoría.
  - public.lead_recordatorios opcional: tarjeta_id, due_at, descripcion, creado_por; cubre follow-ups en etapas específicas sin
    mezclar con conversaciones.
  - Vista public.v_leads_kanban: join de lead_tarjetas, contactos, conversaciones, conversaciones_insights para alimentar la UI
    sin múltiples roundtrips (incluye conteos por etapa, últimos mensajes, asignado).

  Integración

  - Trigger AFTER INSERT en public.conversaciones que cree tarjeta en etapa inicial (categoria='abierta') para contactos
    estado='lead' y propague canal y propietario_usuario_id.
  - Trigger AFTER UPDATE en public.lead_tarjetas que sincronice contactos.estado ('activo' cuando etapa categoria='ganada',
    'lead' si regresa a abiertas); ampliar el CHECK de contactos.estado si deseas guardar 'perdido'.
  - Función public.puede_ver_lead(tarjeta_id uuid) siguiendo el patrón de public.puede_ver_conversacion: propietario del
    contacto, asignado en la tarjeta o admin; úsala en políticas RLS (SELECT/UPDATE/DELETE/INSERT) de lead_*.
  - Índices sugeridos: idx_lead_tarjetas_etapa (tablero_id, etapa_id, asignado_a_usuario_id), idx_lead_movimientos_tarjeta,
    idx_lead_tarjetas_conversacion, idx_lead_tarjetas_estado_categoria para conteos rápidos por columna/estado.
  - Habilita REPLICA IDENTITY FULL en lead_tarjetas y lead_movimientos para soportar Supabase Realtime; publica eventos en
    public.eventos_auditoria mediante trigger para auditar cambios de etapa.
  - Aprovecha conversaciones_insights.lead_score y siguiente_accion: copy-on-write al crear tarjeta y refrescar con trigger
    cuando insights cambian (AFTER UPDATE ON conversaciones_insights).
  - Define ENUM lead_categoria en lugar de TEXT check si prefieres tipos fuertes, siguiendo la convención de
    public.fuente_resultado.
