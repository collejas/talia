# Pasos para ejecutar el plan 3D

1. [x] **Definir catálogo de tipos de propiedad**
   - [x] Crear tabla `propiedad_tipos` (nombre, descripción, color por defecto, metadata) si se requiere flexibilidad.
   - [x] Registrar tipos iniciales: lote, casa, departamento, local comercial, oficina, consultorio.

2. [x] **Diseñar las tablas espaciales**
   - [x] Crear tabla principal `propiedades` con FK a `organizaciones`, `tipo_id`, `status`, `precio`, `metadata`, `height`, `min_height`, `nivel`, `geom geometry(PolygonZ,4326)` y timestamps.
   - [x] Opcional: crear tablas auxiliares `niveles` y `departamentos` para modelar edificios con múltiples niveles y unidades.
   - [x] Añadir índices GIST sobre `geom` y columnas clave (`organizacion_id`, `status`, `tipo_id`) para acelerar filtros espaciales y por estatus.

3. [x] **Configurar estado y triggers**
   - [x] Crear el enum `propiedad_status` y los check constraints necesarios (`disponible`, `apartado`, `vendido`, `reservado`).
   - [x] Implementar triggers que mantengan `actualizado_en` y `geom` sincronizados cuando cambian coordenadas o atributos espaciales.
   - [x] Crear políticas RLS por organización/estado y habilitar `propiedades`, `propiedad_niveles` y `propiedad_departamentos`.

4. [x] **Exponer GeoJSON a través de RPC / endpoint**
   - [x] Crear la función `crm_propiedades_geojson(p_organizacion uuid, p_nivel integer DEFAULT NULL, p_tipo uuid DEFAULT NULL)` que retorna un `FeatureCollection`.
   - [x] Asegurar que cada feature aporte `properties` con `status`, `tipo_nombre`, `color`, `height`, `min_height`, `levels`, `precio` y metadata útil.
   - [x] Crear el proxy Next.js `/api/crm/propiedades/geojson` que invoque dicho RPC y maneje filtros por nivel/tipo.

5. [ ] **Implementar flujo Leaflet jerárquico + transición Mapbox**
   - [ ] Inicializar Leaflet centrado en México y colorear el país entero según el consolidado nacional; el hover sobre el país debe mostrar los totales globales de disponibles/apartados/vendidos.
   - [ ] Al clicar México, resaltar los tres estados clave y cambiar el hover para presentar los datos consolidados del estado bajo el cursor.
   - [ ] Cuando se selecciona un estado, pintar sus municipios con desarrollos; el hover por municipio debe mostrar sus métricas particulares.
   - [ ] Al escoger un municipio, dibujar marcadores por desarrollo; el hover debe mostrar la info de ventas/estado para ese punto.
   - [ ] Añadir un panel lateral que liste los desarrollos del municipio, con botones “centrar marcador” y “ver en detalle Mapbox”.
   - [ ] Al hacer clic en un marcador, activar la vista Mapbox con `mapbox://styles/mapbox/satellite-v9`, pitch/bearing elevados y `fill-extrusion-height` alimentado por `height/min_height/levels`.

6. [ ] **Sincronizar estados y UX**
   - [ ] Ofrecer filtros de precio, tipo y nivel en el panel y reflejarlos tanto en Leaflet como en la vista Mapbox.
   - [ ] Implementar un mecanismo ligero de refresco (polling o WebSockets) para mantener actualizados los estados.
   - [ ] Asegurar que la transición Leaflet → Mapbox comunica al usuario el cambio de vista (mensajes, loaders, breadcrumbs).

7. [ ] **Pruebas y métricas**
   - [ ] Poblar la base con datos de muestra (30 desarrollos distribuidos en los tres estados) y validar que la vista Mapbox muestra correctamente los volúmenes.
   - [ ] Probar consultas espaciales críticas (`ST_Intersects`, `ST_DWithin`) y los filtros por estado/tipo para evitar regressiones.
   - [ ] Ejecutar QA visual: México coloreado → estado → municipio → marcador → Mapbox; verificar colores/alturas y el tiempo de transición.

8. [ ] **Documentar y entregar**
   - [ ] Registrar en el plan maestro cada salto (país, estado, municipio, marcador, Mapbox) y los endpoints usados.
   - [ ] Generar la guía para el cliente explicando cómo leer los colores, filtrar desarrollos y abrir la vista 3D.
