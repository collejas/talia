# Plan Maestro 3D Leaflet + OSMBuildings

## Objetivo
Construir una pantalla de propiedades inmobiliarias donde cada lote, casa o departamento se represente como un volumen geoespacial poligonal con escalas de color por estado (disponible/apartado/vendido) y niveles para edificios, usando Leaflet como base del mapa y OSMBuildings para la presentación 3D.

## Componentes principales
1. **Modelo espacial en Postgres/PostGIS**
   - Crear tablas `propiedades`, `niveles` y `departamentos` (o un solo catálogo donde cada unidad lleva `nivel` y `status`).
   - Cada fila mantiene `geom geometry(PolygonZ,4326)` o `geometry(MultiPolygon,4326)` para definir la huella del volumen.
   - Columnas adicionales: `status` (enum), `tipo` (lote/casa/departamento/local/oficina/consultorio), `precio`, `metadata`, `height`, `min_height`, `level` y `organizacion_id`.
   - Opcionalmente crear catálogo `propiedad_tipos` con `id`, `nombre`, `descripcion` y `color` predeterminado, y referenciarlo desde `propiedades.tipo_id`.
   - Triggers/funciones para mantener la `geom` sincronizada cuando se actualicen coordenadas.
   - Vista/RPC que retorna GeoJSON (FeatureCollection) con `properties.status`, `height`, `levels`, `nivel`, `color`.

2. **Endpoint / RPC**
   - Crear función RPC `crm_propiedades_geojson(p_organizacion uuid, p_level int DEFAULT NULL)` que retorna los volúmenes filtrados por tenant y/o nivel.
   - El endpoint debe calcular color basado en `status` y exportar `properties` relevantes (`status`, `precio`, `level`, `propiedad_id`).
   - Opcional: incluir resumen (por ejemplo, casas disponibles por nivel) para panel lateral.

3. **Frontend Leaflet**
   - Usar `L.map` tradicional con tile base (Mapbox, OSM, etc.).
   - Cargar GeoJSON desde el endpoint y alimentarlo a `OSMBuildings`.
   - Configurar `OSMBuildings` con `height`, `minHeight`, `color`, `levels` y `zoom`/`pitch` para obtener vista lateral.
   - Añadir controles: selector de niveles, leyenda de estado, tooltip/popup con detalles.
   - Incluir filtro por `tipo` (lote, casa, departamento, oficina, consultorio, local comercial) y actualizar leyenda del mapa de acuerdo al tipo seleccionado.

4. **Estado por color**
   - Mapa de colores (verde/disponible, amarillo/apartado, rojo/vendido).
   - Practicar con `OSMBuildings.setColor(feature, statusColor[status])` o en `properties` y un `style` global.
   - Actualizar colores sin recargar (p. ej., `osmb.refresh()` tras un cambio de estado).

5. **Interactividad y UX**
   - Panel lateral con lista de propiedades y filtros (tipo, nivel, rango de precios).
   - Al seleccionar una propiedad, centrar y mostrar popup/tooltip con detalles (precio, contacto, link a CRM).
   - Control para alternar la vista “en planta” vs “3D extruído” (mostrando los polígonos con Leaflet GeoJSON simple o la capa de OSMBuildings).
   - Destacar íconos/colores diferentes según el `tipo` para dar contexto inmediato (por ejemplo, icono de edificio para departamentos, de casa para residencias, etc.).

6. **Siguientes pasos**
 1. Definir tablas en SQL y migraciones necesarias con RLS y `organizacion_id`.
     - Incluir catálogo `propiedad_tipos` (o datos fijos si se prefiere) para referenciar cada tipo: lote, casa, departamento, local comercial, oficina, consultorio, etc.
 2. Crear función RPC/endpoint que devuelva GeoJSON con propiedades y niveles.
 3. Desarrollar componente Leaflet/OSMBuildings que consuma ese GeoJSON y permita cambiar niveles y estados.
 4. Probar con datos de muestra y validar desempeño (GIST, volúmenes, triggers).

## Riesgos y consideraciones
- Leaflet no inclina el mapa; OSMBuildings simula el volumen, pero considera usar Mapbox/Deck.gl para una experiencia más inmersiva si se requieren rotaciones múltiples.
- Controlar la cantidad de polígonos (usar `ST_Simplify` si hay mucha geometría) y mantener índices GIST actualizados.
- Asegurar que los colores reflejen siempre el `status`: sincronizar cambios de estado desde el CRM/ventas al mapa (WebSockets o polling mínimo).
