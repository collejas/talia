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

### Backend
- Se agregó `GET /crm/prospeccion/whatsapp/readiness` para validar configuración runtime (Twilio + plantilla por tenant).
- Se reforzó `POST /crm/prospeccion/prospectos/contactar` para operación multi-tenant con `X-Organizacion-Id`.
- Se habilitó fallback de plantilla WhatsApp por tenant (`whatsapp.templates.sales`) cuando aplica.
- Se extendieron filtros de `/crm/inbox/threads` por `source`, `channel`, `batch_id`, `campana_id`.
- Se agregó endpoint `GET /crm/inbox/filter-options`.
- `GET /crm/prospeccion/contacto/templates` incorpora plantillas runtime desde `whatsapp.templates.prospeccion`.
- Enriquecimiento runtime con Twilio Content API (nombre/cuerpo/variables de plantilla).
- Ajuste de envío en frío para evitar omisión por `whatsapp_no_permitido` en lotes de prospección.

### Base de datos
- Se aplicó migración de backfill para metadata de prospección en mensajes históricos (sin filas a corregir en entorno de prueba).

### Operación/Notas
- Se incorporaron badges/contexto de prospección y deep links de filtros en `/inbox`.
- `Whats-Prosp` ahora soporta `whatsapp.prospeccion.prompt_id` y `whatsapp.prospeccion.prompt_version` en `settings/tenants` y `settings/variables`.
- El runtime de WhatsApp enruta respuestas entrantes con contexto de prospección al prompt especializado (`whatsapp.prospeccion.prompt_id`).
- `GET /crm/prospeccion/whatsapp/readiness` ahora reporta si existe `whatsapp.prospeccion.prompt_id` en runtime.
- Ajustes de resolución de nombre de consulta para resultados DENUE.
- Normalización de correos a minúsculas en render de tabla de prospectos.
