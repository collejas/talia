# Changelog · Prospección

Formato recomendado por entrada:
- `Frontend`
- `Backend`
- `Base de datos`
- `Operación/Notas`

## 2026-02-28

### Frontend
- Nueva vista `prospeccion/whatsapp-atribucion`:
  - alta/edición/borrado de reglas por frase,
  - filtros por canal/estado/búsqueda,
  - simulador de frase para validar match antes de guardar.
- Nueva vista `prospeccion/metricas`:
  - dashboard unificado de prospección con filtros globales (fecha/canal/campaña/regla),
  - KPIs combinados de campañas + atribución WhatsApp por frase,
  - tablas de detalle (`campañas`, `frases por canal`, `frases por regla`),
  - gráficas de tendencia diaria para campañas y frases.
  - exportación CSV del bloque activo (campañas o frases).
  - exportación XLSX con workbook multi-hoja.
- Sidebar de Prospección:
  - nuevo acceso `Atribución WhatsApp`.
  - nuevo acceso `Métricas`.

### Backend
- Nuevos endpoints de reglas de atribución WhatsApp:
  - `GET/POST /crm/prospeccion/whatsapp/atribucion/reglas`
  - `PATCH/DELETE /crm/prospeccion/whatsapp/atribucion/reglas/{regla_id}`
  - `POST /crm/prospeccion/whatsapp/atribucion/reglas/simular`
- Nuevo endpoint agregador:
  - `GET /crm/prospeccion/metricas`
  - combina en una sola respuesta métricas de campañas y frases WhatsApp.
  - incluye `timeseries` diaria para ambos bloques.
- Nuevo endpoint de exportación:
  - `GET /crm/prospeccion/metricas/export/xlsx`
  - genera archivo XLSX con hojas de resumen y detalle.
- Webhook inbound WhatsApp:
  - evalúa reglas activas por prioridad y aplica primera coincidencia.
  - guardas operativas:
    - sólo primer mensaje de conversación nueva,
    - anti-duplicado por conversación,
    - ventana anti-duplicado por contacto (24h).
  - persistencia rápida en contacto:
    - `contactos.contacto_datos.publicidad_whatsapp_atribucion`.
- Inbox:
  - cuando existe evento de atribución, la conversación se expone con `source=publicidad_whatsapp`.
  - soporte de filtro `source=publicidad_whatsapp` en `GET /crm/inbox/threads`.

### Base de datos
- Nueva migración aplicada:
  - `20280421_120000_prospeccion_whatsapp_atribucion_frases.sql`.
- Nuevas tablas:
  - `public.prospeccion_whatsapp_atribucion_reglas` (catálogo editable por tenant, RLS).
  - `public.prospeccion_whatsapp_atribucion_eventos` (evento inmutable de atribución por conversación, RLS).

### Operación/Notas
- Validación funcional completada:
  - al enviar WhatsApp con frase registrada, se genera evento de atribución y queda visible en UI/Inbox.

### Frontend
- `inbox`:
  - se habilitó canal `Correo` en filtros de bandeja.
  - se agregó badge visual para conversaciones de correo.

### Backend
- Brevo webhook de prospección:
  - ahora procesa eventos transaccionales y correos entrantes (inbound reply) en el mismo endpoint.
- Inbound correo:
  - parsea remitente y encabezados (`In-Reply-To`, `References`, `Message-ID`) para asociar la respuesta con el envío de prospección.
  - actualiza `prospeccion_contacto_envio` a `respondido` cuando aplica.
  - registra log `reply_inbound` y publica progreso para métricas.
  - dispara autopromoción de prospecto cuando hay respuesta real por correo.
- Inbox:
  - se guarda el inbound como mensaje en conversación manual con `channel=correo`.
  - reply manual desde Inbox ahora soporta envío de correo saliente usando proveedor configurado (con headers de hilo para continuidad).
- Email service:
  - soporte de headers personalizados en envío SMTP/Brevo para threading de respuestas.

### Base de datos
- Nueva migración:
  - `20260228_001000_inbox_email_channel_derivado.sql`.
  - índice por `mensajes.datos->>'channel'`.
  - actualización de `panel_inbox_threads` para derivar canal desde metadata del último mensaje y filtrar correctamente por `correo`.

### Operación/Notas
- Objetivo cubierto:
  - habilitar base técnica para medir `Respondidos` por correo desde inbound real.
- Validación mínima recomendada:
  - enviar correo de prospección, responder desde cliente externo, confirmar:
    - estado `respondido` en envío,
    - log `reply_inbound`,
    - visibilidad en `inbox` canal `Correo`.

## 2026-02-27

### Frontend
- `prospeccion/prospectos`:
  - lectura/escritura de preferencias de tabla (orden y visibilidad de columnas) en backend.
  - fallback local (`localStorage`) cuando el backend no responde o no hay preferencia guardada.
  - vistas guardadas por usuario (crear/aplicar/eliminar) con preset de filtros + orden + columnas.
  - se muestra etiqueta amigable de consulta por prospecto (`busqueda_id/query`) con fallback legible.
- `prospeccion/contactos` y `prospeccion/campanas`:
  - lotes muestran etiqueta amigable de consulta (`query/busqueda_id`) resolviendo nombre desde metadata de prospectos cuando existe.
- `prospeccion/prospectos`, `prospeccion/contactos`, `prospeccion/campanas`:
  - se evita mostrar `busqueda_id` (UUID técnico) como texto de consulta cuando no existe etiqueta amigable.
  - prioridad de etiqueta legible (`query/busqueda_query`) sobre fallback técnico.
- `prospeccion/contactos`:
  - nueva tarjeta de conversión por fuente (`Google Places`, `DENUE`, `Usuario`) con porcentajes de contacto y conversión a contacto CRM.
  - nueva tarjeta de eventos Brevo (delivered/opened/click/bounce/spam/unsubscribe) con timestamp del último evento por tipo.
- `prospeccion/campanas`:
  - importación de plantillas de correo desde catálogo Brevo (botón `Importar` por plantilla).
  - nuevo bloque de atribución por plantilla con métricas persistentes (envíos/entregas/respuestas + aperturas/clics + sesiones UTM).
  - vista jerárquica operativa en 4 niveles: `Campaña -> Plantilla -> Lote -> Prospecto`.
  - métricas por canal diferenciadas (correo vs WhatsApp) y etiquetas ajustadas por contexto.
  - nivel `Plantilla` ahora muestra porcentajes (`Entrega`, `Respuesta`, `Clic/Sesión` en correo).
  - nivel `Lote`:
    - muestra `Sesiones UTM` y `Clic/Sesión`.
    - `Clic/Sesión` se alinea al criterio de nivel y se calcula sobre el total del lote.
    - precarga de detalle al expandir plantilla para evitar valor inicial `0.00%` antes de abrir el lote.
  - nivel `Prospecto`:
    - se muestra `Prospecto: <nombre>` y `Segmento`.
    - se removió campo técnico `Mensaje` del detalle.
  - lotes se muestran como `Lote 1`, `Lote 2`, ... (evita UUID en UI).
  - se añadió filtro por canal en métricas jerárquicas (`Todos`, `Correo`, `WhatsApp`, `Llamada`).
  - KPIs de lectura comercial ajustados:
    - `Clic/Total` (interés),
    - `Sesiones/Clic`,
    - `Entrega` y `Respuesta`.
  - tooltips explicativos (lenguaje no técnico) en porcentajes y badges de métricas.
  - renombre de etiqueta para usuario final:
    - `Sesiones UTM` -> `Visitas al sitio`.
  - `Campañas recientes` simplificada para gestión:
    - muestra nombre de campaña, `Entregados`, `Lotes completados`, `Total de plantillas`, y acciones (`Plantillas`, `Editar`, `Eliminar`).
  - título del segundo nivel ajustado a:
    - `Plantilla: <nombre>`.
  - contador de plantillas por campaña corregido para WhatsApp:
    - ahora cuenta plantillas reales vinculadas por `campana_id` (no inferidas por lotes).
  - modal de plantillas de correo:
    - nuevo campo `Web destino` (usa dominio del tenant para tracking base).
    - botón `Insertar enlace web` en `Cuerpo (HTML)` con anchor trackeable.
    - barra rápida de edición:
      - `Cuerpo (texto)`: saltos, separador, viñetas, CTA rápida.
      - `Cuerpo (HTML)`: negrita, cursiva, subtítulo, lista, insertar enlace.
    - inserción de imagen corregida:
      - si se edita `Cuerpo (HTML)`, no contamina `Cuerpo (texto)`.
- Proxy nuevo:
  - `GET/PUT /api/prospeccion/prospectos/preferences`.
  - `GET/PUT /api/prospeccion/prospectos/views`.

### Backend
- Nuevos endpoints:
  - `GET /crm/prospeccion/prospectos/preferences`.
  - `PUT /crm/prospeccion/prospectos/preferences`.
  - `GET /crm/prospeccion/prospectos/views`.
  - `PUT /crm/prospeccion/prospectos/views`.
- Persistencia multi-tenant por usuario para preferencias de UI de prospección.
- Normalización de email en capa API al crear/editar prospectos (manual y desde resultados).
- Suppressions/opt-out por canal:
  - nuevos endpoints para listar/crear/actualizar reglas (`/prospeccion/contacto/suppressions`).
  - aplicación de suppressions durante `contactar_prospectos` y actualización de campañas.
  - enforcement adicional en worker al procesar envíos (evita salida si hay opt-out activo).
  - webhook Brevo `unsubscribe` ahora crea suppression de correo automáticamente.
- `GET /crm/prospeccion/contacto/metrics`:
  - incorpora `conversion_por_fuente` con base persistente (RPC) en lugar de cálculo in-memory.
  - incorpora `brevo_eventos` agregados desde logs persistentes de prospección.
- Nuevos endpoints Brevo para plantillas de correo:
  - `GET /crm/prospeccion/contacto/templates/brevo-catalog` (lectura catálogo SMTP).
  - `POST /crm/prospeccion/contacto/templates/import-brevo` (import/sync a plantilla local ligada a campaña de correo).
- Nuevo endpoint de atribución:
  - `GET /crm/prospeccion/campanas/atribucion` (resumen persistente por campaña/plantilla).
- Tracking correo de prospección:
  - URL de tracking ahora incluye ids técnicos `cid` (campaña) y `tid` (plantilla) para consolidar sesiones UTM por plantilla.
  - URL de tracking añade `eid` (envío) y `pid` (prospecto) para habilitar atribución por destinatario.
  - `GET /crm/prospeccion/contacto/envios` enriquece cada envío con `sesiones_utm` por `envio_id`.
  - fix en worker de correo para pasar `id` de envío al render de tracking; sin este fix no se emitía `eid` en algunos envíos.
  - render de contexto de plantilla de correo con:
    - `{{tracking_url}}` (URL completa con tracking),
    - `{{website_url}}` (URL limpia del sitio).
  - ajuste de envío para no ensuciar texto plano con query de tracking.
  - preservación de saltos de línea:
    - `Cuerpo (texto)` y `Cuerpo (HTML)` mantienen separaciones al render final de correo.
  - robustez del fallback texto->HTML:
    - cuando el HTML trae solo enlace/imagen, se inyecta también el cuerpo base para no perder contenido en clientes como Gmail.
- Actualización de plantillas (PATCH):
  - se corrige persistencia de limpieza de campos (`cuerpo_html`, `cuerpo_texto`, `asunto`, `descripcion`) permitiendo guardar `null` explícito.
  - evita que reaparezca `Cuerpo (HTML)` borrado al reabrir plantilla.
- Webhook Brevo (operativo E2E):
  - Se habilitó endpoint público en panel para recepción externa:
    - `POST /api/prospeccion/contacto/brevo/webhook` (proxy hacia backend `/crm/prospeccion/contacto/brevo/webhook`).
  - Se corrigió persistencia de logs de eventos Brevo en backend:
    - `backend/app/services/brevo.py` ahora envía `organizacion_id` al insertar `prospeccion_contactos_log`.
  - Resultado esperado tras fix:
    - `entregados` continúa actualizando desde estado de `prospeccion_contacto_envio`.
    - `aperturas/clics` se contabilizan desde eventos webhook persistidos en `prospeccion_contactos_log`.

### Base de datos
- Nueva tabla:
  - `public.prospeccion_user_preferences` (RLS + índices + triggers).
- Nueva tabla:
  - `public.prospeccion_contacto_suppressions` (RLS + índices + triggers).
- Nueva función SQL:
  - `public.prospeccion_conversion_fuente()` para agregación de conversión por fuente.
- Nueva función SQL:
  - `public.prospeccion_brevo_eventos_resumen()` para agregación de eventos Brevo por tipo.
- Nueva función SQL:
  - `public.prospeccion_campana_template_atribucion(p_campana_id, p_limit)` para atribución persistente por plantilla.
  - extendida con `sesiones_utm` y `click_to_session_pct` (join con `webchat_visitantes` vía UTM + ids técnicos).
  - ajuste de agregación Brevo para dashboard: `brevo_aperturas`/`brevo_clicks` deduplicados por `envio_id` (prioriza `unique_*`, fallback a evento total).
  - ajuste de atribución de sesiones para evitar inflado:
    - campañas/plantillas ahora contabilizan `sesiones_utm` solo cuando existe `eid/envio_id` en la URL.
    - se elimina fallback por `cid/tid` y por `campana_id` para el conteo de sesiones agregadas.
    - impacto: `Sesiones/Clic` queda alineado con niveles `lote/prospecto`.
- Nueva función SQL:
  - `public.prospeccion_envio_sesiones_utm(p_envio_ids)` para resolver sesiones UTM a nivel envío (`eid`).
- Normalización de correos:
  - trigger `BEFORE INSERT/UPDATE` en `public.prospeccion_prospectos`.
  - backfill para pasar correos existentes a minúsculas.

### Operación/Notas
- Se cierra pendiente de `siguiente_pasos.md` sobre persistencia backend de preferencias de tabla.
- Se cierra pendiente de normalización de email al persistir.
- Se cierra pendiente de vistas guardadas para la tabla de prospectos.
- Configuración requerida en Brevo para métricas de app:
  - Webhook `Transactional` activo apuntando a:
    - `https://talia.mx/api/prospeccion/contacto/brevo/webhook`
  - Eventos mínimos recomendados:
    - `delivered`, `opened`, `unique_opened`, `click`, `unique_click`, `hard_bounce`, `soft_bounce`, `blocked`, `spam`, `invalid`, `error`, `unsubscribe`.
- Aclaración de métricas en campaña correo:
  - `Respondidos` para correo requiere flujo de inbound email/reply hacia logs de prospección.
  - `Sesiones UTM` sube cuando la landing genera sesión en `webchat_visitantes` con `utm_source=prospeccion`, `utm_medium=email` y señales `cid/tid/kw`.

## 2026-02-24

### Frontend
- `prospeccion/prospectos`:
  - Orden por columnas.
  - Reordenamiento de columnas (drag & drop).
  - Mostrar/ocultar columnas.
  - Ajustes visuales de densidad/tipografía y simplificación de columna de fuente.
- `prospeccion/google-busqueda`:
  - UI de resultados almacenados alineada con `denue-busqueda`.
  - Eliminación individual y masiva de búsquedas recientes.
  - Paginación de resultados a 5000.
- `prospeccion/denue-busqueda`:
  - Filtro de tamaño (`Tamaño`).
  - Paginación de resultados y mapa a 5000.
  - Eliminación individual y masiva de búsquedas recientes.
  - Match de filtros de contacto con modo `TODOS`/`CUALQUIERA`.
- Se corrigió proxy frontend `POST /api/prospeccion/prospectos/contactar` para propagar cabeceras de organización.
- Se resolvió error operativo: `422 missing header X-Organizacion-Id` desde modal de `prospeccion/prospectos`.
- `prospeccion/denue-busqueda`: guardar como prospectos ahora solicita `Segmento` en modal.
- `settings/tenants` y `settings/variables`: pestaña nueva `Whats-Prosp` para registrar múltiples SIDs.
- `prospeccion/prospectos`: preview de plantilla WhatsApp al seleccionar SID runtime.
- `prospeccion/prospectos` y `settings/prospeccion/plantillas`:
  - Soporte de variable `{{logo_url}}` en correo.
  - Botón `Insertar logo` ahora inserta placeholder reutilizable en vez de URL fija.
  - Placeholder legado `{{DATA:IMAGE:...}}` normalizado a `{{logo_url}}`.
  - Estilo por defecto del logo en correo ajustado a `5/6` del cuerpo (`width:83.333%`).

### Backend
- Se agregó `GET /crm/prospeccion/whatsapp/readiness` para validar configuración runtime (Twilio + plantilla por tenant).
- Se reforzó `POST /crm/prospeccion/prospectos/contactar` para operación multi-tenant con `X-Organizacion-Id`.
- Se habilitó fallback de plantilla WhatsApp por tenant (`whatsapp.templates.sales`) cuando aplica.
- Se extendieron filtros de `/crm/inbox/threads` por `source`, `channel`, `batch_id`, `campana_id`.
- Se agregó endpoint `GET /crm/inbox/filter-options`.
- `GET /crm/prospeccion/contacto/templates` incorpora plantillas runtime desde `whatsapp.templates.prospeccion`.
- Enriquecimiento runtime con Twilio Content API (nombre/cuerpo/variables de plantilla).
- Ajuste de envío en frío para evitar omisión por `whatsapp_no_permitido` en lotes de prospección.
- Correo de prospección:
  - Render de `body_html` con placeholders dinámicos (`{{logo_url}}` incluido en metadata de envío).
  - Fallback `texto -> HTML` cuando aplica para mejorar visualización del cuerpo.
  - Todas las imágenes del HTML se envuelven con link de tracking a `https://talia.mx/` con UTM + `kw`.
- Settings/logos:
  - Fix en `POST /api/settings/logos` para insertar con `organizacion_id` correcto.
  - Ajuste de persistencia para evitar bloqueo RLS al cargar logos desde `settings/formato-cotizacion`.

### Base de datos
- Se aplicó migración de backfill para metadata de prospección en mensajes históricos (sin filas a corregir en entorno de prueba).

### Operación/Notas
- Se incorporaron badges/contexto de prospección y deep links de filtros en `/inbox`.
- `Whats-Prosp` ahora soporta `whatsapp.prospeccion.prompt_id` y `whatsapp.prospeccion.prompt_version` en `settings/tenants` y `settings/variables`.
- El runtime de WhatsApp enruta respuestas entrantes con contexto de prospección al prompt especializado (`whatsapp.prospeccion.prompt_id`).
- `GET /crm/prospeccion/whatsapp/readiness` ahora reporta si existe `whatsapp.prospeccion.prompt_id` en runtime.
- Ajustes de resolución de nombre de consulta para resultados DENUE.
- Normalización de correos a minúsculas en render de tabla de prospectos.

## 2026-02-25

### Backend
- Flujo de prospección WhatsApp:
  - Se reforzó la deduplicación de oportunidad por conversación/prospecto para evitar duplicados.
  - Se prioriza reutilizar contacto de la oportunidad de prospección durante el procesamiento de respuestas entrantes.
- Agenda:
  - Se añadió regla operativa para que, ante confirmación de horario, el asistente use tools de agenda (`list_demo_slots`/`schedule_demo`) en lugar de responder sin tool call.
  - Se activó `tool_choice=auto` en la llamada principal del assistant para facilitar ejecución de tools.
- Confirmación de demo:
  - Se sincroniza mejor el contexto sobre el contacto de la oportunidad (merge de nombre/correo/empresa cuando difieren contactos de conversación vs oportunidad).
  - Se completa contexto mínimo para prospección (`notes`, `necesidad_proposito`) tras booking confirmado.
  - Se incorporó guardado de insights (`upsert_conversation_insights`) y ajuste de título/descripcion cuando el título es genérico.
- Notificación comercial:
  - `booking_confirmed` en oportunidades de prospección ya no bloquea por perfilamiento completo; usa validación base de contacto/contexto.

### Operación/Notas
- Validación funcional: una sola oportunidad por conversación en escenarios de respuesta de campaña de prospección.
- Queda habilitado el camino para marcar etapa demo + notificación de asesor en la confirmación real de agenda.
- Correo prospección:
  - Confirmado envío vía Brevo (`/v3/smtp/email`) desde flujo de prospección.
  - Se acuerda estrategia por fases para plantillas:
    - fase inicial administradas en app (con/sin plantilla y variables),
    - fase evolutiva con integración de plantillas por API Brevo.
  - Se define implementación de mediciones/eventos Brevo en app (enviado, entregado, apertura, clic, rebote, bloqueo, spam, unsubscribe, error).
  - Nota de compatibilidad de cliente de correo:
    - SVG no es confiable en varios clientes; para logo se recomienda PNG/JPG.
    - Con imágenes remotas no se adjunta archivo; con inline CID algunos proveedores las muestran como adjunto.
- Decisión de arquitectura comercial:
  - Se reutiliza el embudo existente para medición de conversión (sin nueva pantalla de embudo de prospección).
  - La atribución por campaña se concentrará en envíos/lotes y metadata de oportunidad.

## 2026-02-26

### Frontend
- `prospeccion/prospectos`:
  - ejecución de contacto forzada a campaña + plantilla (sin flujo rápido).
  - modal de preparación ajustado a flujo final: selección de campaña, plantilla, programación, separación y ejecución.
- `prospeccion/campanas`:
  - campañas con canal único (sin multicanal).
  - modal de plantillas compactado y remaquetado para mejor operación.
  - plantillas WhatsApp con carga de imagen desde el modal y generación de URL media/CTA con tracking.
  - plantillas Correo con carga de imagen desde el modal.
  - eliminación de tarjeta “Salud por canal” (métrica in-memory global).

### Backend
- Contact sender WhatsApp:
  - resolución robusta de variables numéricas de plantilla (`{{1}}..{{5}}`) con fallback semántico.
- Settings/logos:
  - `POST /settings/logos` acepta contexto opcional de prospección (`campana_id`, `canal`, `template_id`, `template_slug`) y lo persiste en metadata para trazabilidad de assets.

### Base de datos
- Sin migraciones nuevas para este bloque.
- Persistencia usada en operación:
  - `campanas`,
  - `prospeccion_contacto_templates`,
  - `prospeccion_contacto_batch`,
  - `prospeccion_contacto_envio`,
  - `prospeccion_contactos_log`,
  - `eventos_entrega`,
  - `logos` (metadata con contexto de prospección).

### Operación/Notas
- Base URL para CTA de WhatsApp tomada automáticamente por tenant:
  - prioridad `sitio_web`,
  - fallback `dominio_principal`,
  - sin fallback a `talia.mx` para evitar mezcla de atribución entre tenants.
