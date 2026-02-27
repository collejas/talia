# Changelog · Prospección

Formato recomendado por entrada:
- `Frontend`
- `Backend`
- `Base de datos`
- `Operación/Notas`

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

### Base de datos
- Nueva tabla:
  - `public.prospeccion_user_preferences` (RLS + índices + triggers).
- Nueva tabla:
  - `public.prospeccion_contacto_suppressions` (RLS + índices + triggers).
- Nueva función SQL:
  - `public.prospeccion_conversion_fuente()` para agregación de conversión por fuente.
- Nueva función SQL:
  - `public.prospeccion_brevo_eventos_resumen()` para agregación de eventos Brevo por tipo.
- Normalización de correos:
  - trigger `BEFORE INSERT/UPDATE` en `public.prospeccion_prospectos`.
  - backfill para pasar correos existentes a minúsculas.

### Operación/Notas
- Se cierra pendiente de `siguiente_pasos.md` sobre persistencia backend de preferencias de tabla.
- Se cierra pendiente de normalización de email al persistir.
- Se cierra pendiente de vistas guardadas para la tabla de prospectos.

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
