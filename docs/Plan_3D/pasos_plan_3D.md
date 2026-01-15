# Pasos para ejecutar el plan 3D

1. [ ] **Definir catálogo de tipos de propiedad**
   - [ ] Crear tabla `propiedad_tipos` (nombre, descripción, color por defecto, metadata) si se requiere flexibilidad.
   - [ ] Registrar tipos iniciales: lote, casa, departamento, local comercial, oficina, consultorio.

2. [ ] **Diseñar las tablas espaciales**
   - [ ] Crear tabla principal `propiedades` con FK a `organizaciones`, `tipo_id`, `status`, `precio`, `metadata`, `height`, `min_height`, `nivel`, `geom geometry(PolygonZ,4326)` y timestamps.
   - [ ] Opcional: crear tablas auxiliares `niveles` y `departamentos` si los edificios requieren más detalle (cada nivel->varios departamentos).
   - [ ] Añadir índices GIST sobre `geom` y columnas clave (`organizacion_id`, `status`, `tipo_id`).

3. [ ] **Configurar estado y triggers**
   - [ ] Crear tipos enumerados o check constraints para `status` (disponible/apartado/vendido) y `nivel`.
   - [ ] Implementar triggers que actualicen `geom` cuando se cambien coordenadas o se inserten puntos aislados (lat/lng).
   - [ ] Registrar triggers que mantengan timestamps (`creado_en`, `actualizado_en`).

4. [ ] **Exponer GeoJSON a través de RPC / endpoint**
   - [ ] Crear función RPC `crm_propiedades_geojson(p_organizacion uuid, p_level int DEFAULT NULL, p_tipo uuid DEFAULT NULL)` que retorne `FeatureCollection`.
   - [ ] Incluir en cada feature `properties` con `status`, `tipo_nombre`, `color`, `height`, `levels`, `nivel`, `precio`.
   - [ ] Filtrar por tenant y por parámetros opcionales (nivel/tipo) para alimentar la vista.

5. [ ] **Construir la capa Leaflet + OSMBuildings**
   - [ ] Inicializar `L.map` con tiles base y centrar en zona del cliente.
   - [ ] Cargar GeoJSON desde la función/endpoint y pasar a `OSMBuildings` con `height`, `minHeight`, `wallColor`.
   - [ ] Crear controles para seleccionar nivel y tipo, filtrando la capa o recargando los features.
   - [ ] Añadir leyenda de colores y un panel lateral que liste propiedades con su status y precio.

6. [ ] **Sincronizar estados y UX**
   - [ ] Crear acción en UI/backend que actualice el `status` y los colores sin recargar (websocket/polling breve).
   - [ ] Ofrecer toggle entre vista “planta” (GeoJSON simple) y vista 3D (`OSMBuildings`).
   - [ ] Agregar filtros para rangos de precio/medida y resaltado al seleccionar un polígono (tooltip/popover).

7. [ ] **Pruebas y métricas**
   - [ ] Poblar la tabla con datos de muestra (varios lotes, casas y departamentos con diferentes estados y niveles).
   - [ ] Validar rendimiento de consultas espaciales (`ST_Distance`, `ST_Within`) y revisar índices GIST.
   - [ ] Ejecutar QA visual (Leaflet + OSMBuildings), validando colores, niveles y selección interactiva.

8. [ ] **Documentar y entregar**
   - [ ] Describir en el plan maestro cómo se conectan las piezas y documentar los endpoints y triggers generados.
   - [ ] Preparar guía de uso para el cliente (cómo cambiar estados, agregar nuevas propiedades, filtrar por nivel).
