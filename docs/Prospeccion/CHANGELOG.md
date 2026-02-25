# Changelog · Prospección

Formato recomendado por entrada:
- `Frontend`
- `Backend`
- `Base de datos`
- `Operación/Notas`

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
