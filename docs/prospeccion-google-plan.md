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
- [ ] Endpoint o job que toma criterios de búsqueda, llama a Google Places (Nearby/Text + Details) y usa `crear_busqueda` + `upsert_resultados_lote` para guardar resultados.
- [ ] Vista SQL `public.v_google_places_contactables` (o similar) que combine `busquedas` y `resultados` filtrados por `fuente = 'google_places'`, exponiendo teléfono, email (si existiera), website, dirección, rating, tipos y distancia al centro. Debe ser una vista adicional, sin modificar `v_resultados_mapa` ni `v_resultados_unificados`, para no afectar a los consumidores actuales.
- [ ] Documentación de variables de entorno y scopes necesarios para Places/OAuth.
- [ ] UI en `frontend/panel/src/app/prospeccion/google-busqueda` con:
  - [ ] Formulario de criterios (texto, tipo/clasificación, radio, coordenadas o mapa interactivo) y selector de fuente `google_places`, con un control explícito para ajustar el radio de búsqueda que sincronice tanto los filtros como el círculo dibujado en el mapa.
  - [ ] Botón “Buscar y guardar” que llama al backend y muestra estado de ejecución.
  - [ ] Mapa centrado en la búsqueda con círculo del radio y marcadores por resultado, implementado con Leaflet (alineado con el stack actual), incluyendo la posibilidad de mover el marcador central y actualizar el radio desde el control del formulario.
  - [ ] Panel lateral/lista con resumen (nombre, tipo, rating, teléfono, correo/web) y acciones (guardar lead, copiar datos, abrir Maps).
  - [ ] Controles para seleccionar uno o varios prospectos (checkbox/row selection) y lanzar acciones rápidas: enviar correo, WhatsApp, generar carta o crear lead.
  - [ ] Vacíos/errores amigables (sin resultados, quota excedida, etc.).
- [ ] Métricas básicas: refresco de `mv_resultados_por_actividad` y contadores en la UI.

## Flujo propuesto
1. **Capturar parámetros**: formulario manda `query`, `radio_m`, `lat/lng` (o dirección geocodificada), `clasificaciones` y filtros opcionales (rating mínimo, apertura, etc.).
2. **Backend**:
   - `crear_busqueda('google_places', …)` para persistir contexto y obtener `busqueda_id`.
   - Consumir `places:searchNearby` o `places:searchText` con `includedTypes/primaryType` según las clasificaciones que permita Google.
   - Para cada `place_id`, llamar `places:details` solicitando `id`, `displayName`, `formattedAddress`, `internationalPhoneNumber`, `websiteUri`, `primaryType`, `types`, `rating`, `reviews`, `location`, etc.
   - Construir arreglo JSON normalizado y ejecutar `upsert_resultados_lote(busqueda_id, 'google_places', items_json)`.
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
