# Plan de implementación · Prospección Google

## Contexto conocido
- **Esquema actual**: `public.busquedas` guarda cada consulta con metadatos y `public.resultados` almacena los negocios obtenidos (campos como `phone`, `email`, `website`, `geom`, `raw`). Ambos ya tienen triggers para poblar `geography` y `tsvector`, más la función `upsert_resultados_lote` para hacer _upsert_ en lotes (`backups/postgres_20251115_002824_schema.sql`).
- **Fuentes soportadas**: el enum `public.fuente_resultado` incluye `google_places` y `denue`, por lo que solo debemos consumir Google Places y reutilizar la infraestructura existente.
- **Variables de entorno** (`variables.md` > `# GOOGLE OAUTH`): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `API_NEARBY_SEARCH`, `GOOGLE_PLACES_API_KEY`, `PLACES_LANGUAGE_CODE`, `PLACES_REGION_CODE`. Falta normalizar `API_NEARBY_SEARCH` a formato `KEY=value` y definir campos solicitados (ej. `PLACES_FIELDS`).
- **Vista frontend**: `frontend/panel/src/app/prospeccion/google-busqueda/page.tsx` solo invoca `<AppViewLayout title="Prospección · Google busqueda" />`. No hay lógica de formulario, mapa ni listado todavía.
- **Vistas existentes**: `public.v_resultados_mapa` (mapa) y `public.v_resultados_unificados` (reporte general) ya consumen `public.resultados`; cualquier incremento debe mantenerlas intactas.

## Objetivo general
Permitir búsquedas en Google (Places API) desde el panel, visualizar los resultados en un mapa y un listado, y persistirlos en `public.resultados` para posteriores campañas (correo, teléfono, sitio web o dirección).

## Entregables
- [x] Endpoint en backend (`POST /panel/prospeccion/google/busquedas`) que usa `GooglePlacesClient` para llamar a Places (Nearby/Text), crea el registro en `busquedas` vía `crear_busqueda` y guarda los resultados con `upsert_resultados_lote`. Incluye lecturas (`GET /panel/prospeccion/google/busquedas` y `GET /panel/prospeccion/google/resultados`) para alimentar el formulario, mapa y listado desde el panel (`backend/app/api/routes/panel.py`).
- [x] Vista SQL `public.v_google_places_contactables` que combina `busquedas` y `resultados` filtrados por `fuente = 'google_places'`, exponiendo teléfono, email (si existiera), website, dirección, rating, tipos y distancia al centro. Implementada en la migración `supabase/migrations/20260311_100000_google_prospeccion_view.sql` como vista adicional para no afectar `v_resultados_mapa` ni `v_resultados_unificados`.
- [ ] Documentación de variables de entorno y scopes necesarios para Places/OAuth.
- [x] UI en `frontend/panel/src/app/prospeccion/google-busqueda` con:
  - [x] Formulario de criterios (texto, tipo/clasificación, radio, coordenadas) y control del radio sincronizado con el mapa (`google-busqueda-view.tsx`).
  - [x] Botón “Buscar y guardar” conectado a `POST /api/prospeccion/google/busquedas` con feedback visual.
  - [x] Mapa Leaflet con círculo del radio y marcador central draggable + clic para fijar centro (`google-results-map.tsx`).
  - [x] Listado lateral con resumen, chips de tipos y enlaces a contacto, más selección múltiple para acciones (correo/WhatsApp/carta pendientes de automatizar).
  - [x] Controles de filtrado (texto, rating mínimo, solo contactables), selección global y mensajes de estado cuando no hay resultados.
- [ ] Métricas básicas: refresco de `mv_resultados_por_actividad` y contadores en la UI.

## Flujo propuesto
1. **Capturar parámetros**: formulario manda `query`, `radio_m`, `lat/lng` (o dirección geocodificada), `clasificaciones` y filtros opcionales (rating mínimo, apertura, etc.).
2. **Backend**:
   - `POST /panel/prospeccion/google/busquedas`: invoca `GooglePlacesClient` (estrategias `nearby` o `text`) con el `radio`, tipos y traducciones que mande el panel, registra la búsqueda con `crear_busqueda` y ejecuta `upsert_resultados_lote`.
   - `GET /panel/prospeccion/google/busquedas`: lista el historial (query, radio, metadatos) para reutilizar búsquedas anteriores y mostrar contexto al usuario.
   - `GET /panel/prospeccion/google/resultados`: consulta la vista `v_google_places_contactables` con filtros por texto, tipo, rating, distancia y ordenamientos (`recientes`, `rating`, `distancia`) para poblar el mapa/listado.
3. **Consulta/visualización**:
   - La nueva vista SQL sirve como “API read” para el panel (paginación, ordenamiento, filtros por actividad/tipo/rating/distancia).
   - El mapa usa `geom`/`lat,lng` ya almacenados; se puede reutilizar `v_resultados_mapa`.
   - El listado lateral obtiene datos enriquecidos (teléfono, web, meta) desde la misma vista.

## Consideraciones adicionales
- **Límites y costos de Places**: incluir throttling, almacenamiento de `nextPageToken`, y evitar duplicados apoyándonos en el `UNIQUE (busqueda_id, fuente, external_id)`.
- **Contactabilidad**: Google no expone correos directamente; si es requisito, se deberá hacer scraping del `website` (validar TOS) o complementar con otras fuentes (ej. `denue`).
- **Geocodificación**: si el usuario ingresa dirección, usar Places Autocomplete o Geocoding API para obtener `lat/lng` antes de buscar. Guardar esa info en `busquedas.meta`.
- **Privacidad/RLS**: asegurar que la vista nueva respete las políticas (`authenticated`), reutilizando RLS de `resultados`.
- **Mapa**: considerar librerías existentes en el proyecto (p.ej. Mapbox/Leaflet). Reutilizar componentes compartidos si hay un mapa para `denue-busqueda`.

---

Última actualización: _pendiente_. Ir marcando cada check al completar los entregables correspondientes.
