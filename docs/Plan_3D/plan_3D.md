# Plan Maestro 3D Leaflet + Mapbox detalle

## Objetivo
Construir una pantalla de propiedades inmobiliarias que combine un mapa nacional con Leaflet y una vista de detalle en Mapbox (con pitch/tilt y estilo satélite) para cada desarrollo, de manera que cada lote, casa o departamento se represente como un volumen geoespacial poligonal con escalas de color por estado (disponible/apartado/vendido) y niveles para edificios.

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

3. **Frontend Leaflet + Mapbox**
   - Iniciar con Leaflet mostrando todo México coloreado por el estado general de ventas (disponibles/apartados/vendidos) con popups que resumen los tres estados cuando se pasa el cursor por el país; considera reutilizar los JSONB/servicios que ya alimentan `/mapa-de-conversion` para los datos por nivel.
   - Al hacer clic en México se resaltan los tres estados (Playa del Carmen, Guadalajara, Los Cabos) y el hover cambia para mostrar datos consolidados de cada estado.
   - Cuando se hace clic en un estado, Leaflet muestra los municipios coloreados donde hay desarrollos; el hover brinda los datos consolidados del municipio correspondiente.
   - Al clicar un municipio, se muestran marcadores puntuales con la ubicación de cada desarrollo; el hover en el marcador revela la información de ese proyecto.
   - Al seleccionar un marcador se dispara la transición a Mapbox: el viewer satélite (`mapbox://styles/mapbox/satellite-v9`) con pitch/bearing y `fill-extrusion-height` muestra el modelo 3D del desarrollo, usando los mismos datos de altura (`height`, `min_height`, `levels`).
   - Mantener un botón “volver al mapa nacional” y un panel secundario con la lista de desarrollos disponibles para facilitar la navegación entre Leaflet y Mapbox.

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
 3. Desarrollar componente híbrido donde Leaflet controla país/estado/municipio y Mapbox GL renderiza el detalle satélite/3D al seleccionar un desarrollo.
 4. Probar con datos de muestra y validar desempeño (GIST, volúmenes, triggers) así como el plan de cache o uso de tiles Mapbox antes de subirlo a producción.

## Riesgos y consideraciones
- Leaflet será la vista ortogonal nacional (país/estado/municipio); la sensación 3D solo se obtiene dentro de Mapbox, así que hay que indicar claramente la transición cuando se toca un marcador.
- Mapbox tiene límite de tiles gratuito, por eso la vista satélite debe limitarse a zonas específicas y usar cache/proxy si hay necesidad de reducir consumo.
- Controlar la cantidad de polígonos (usar `ST_Simplify` si hay mucha geometría) y mantener índices GIST actualizados.
- Asegurar que los colores reflejen siempre el `status`: sincronizar cambios de estado desde el CRM/ventas al mapa (WebSockets o polling mínimo).
- Mantener separado el módulo inmobiliario del catálogo general de `/settings/productos`: las propiedades usan sus propios campos geo y opcionalmente hacen referencia a líneas/familias/modelos como plantillas, pero no deben forzar que productos tradicionales dependan de la lógica de mapas o geocodificación.
