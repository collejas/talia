# Pasos para ejecutar el plan 3D

1. [x] **Catalogar tipos y estados**
   - [x] Crear el enum `propiedad_status` (disponible/apartado/vendido/reservado) y registrar los tipos (`lote`, `casa`, `departamento`, `local comercial`, `oficina`, `consultorio`, etc.).
   - [x] Definir la tabla `propiedad_tipos` (si se desea flexibilidad) y los colores base por `status`.

2. [x] **Diseñar la base espacial**
   - [x] Crear `propiedades` con `organizacion_id`, `tipo_id`, `status`, `precio`, `height`, `min_height`, `levels`, `metadata` y `geom geometry(PolygonZ,4326)`.
   - [x] Añadir índices GiST y RLS por organización.
   - [x] Crear `propiedad_desarrollos` y asegurar que `propiedad_capas`/`propiedad_unidades` se relacionan a este desarrollo para reflejar los planos jerárquicos.

3. [x] **Exponer GeoJSON**
   - [x] Crear RPC/endpoint `crm_propiedades_geojson(...)` que filtre por organización, estado, municipio y tipo, devolviendo `FeatureCollection` con todos los `properties` necesarios (color, alturas, referencias a línea/familia/modelo).
   - [x] Añadir proxy Next.js `/api/crm/propiedades/geojson` para consumir esa función y manejar filtros de UI.

4. [ ] **Enriquecer propiedades con jerarquía geográfica**
   - [ ] Extender `propiedades` con `pais_codigo`, `estado_cve`, `municipio_cve`, `codigo_postal`, `colonia`.
   - [ ] Crear selects que reutilicen los JSONB/servicios existentes (`backend/app/data/geo`, `leads_geo`) para popular estados/municipios.
   - [ ] Verificar que `propiedades` pueda referenciar `linea_id`, `familia_id`, `modelo_id` sin acoplarse a `settings/productos`.
   - [x] Confirmar que el RPC `crm_propiedades_geojson` (ver `supabase/migrations/20280205_100000_propiedades_geojson_extended.sql` y `supabase/migrations/20280214_130000_propiedades_geojson_3d_metadata.sql`) expone los nuevos atributos geográficos y los nombres de `linea`, `familia` y `modelo` para que Leaflet/Mapbox puedan colorear y filtrar por plantilla.
   - [ ] Ajustar `frontend/panel/src/components/settings/propiedades/propiedad-form.tsx` y el payload de `/crm/propiedades` para que el formulario capture/normalice `pais_codigo`, `estado_cve`, `municipio_cve`, `codigo_postal`, `colonia` y que conserve el vínculo con los catálogos (`linea_id`, `familia_id`, `modelo_id`) sin mezclar lógica del módulo `settings/productos`.

5. [ ] **Implementar flujo Leaflet jerárquico + Mapbox**
   - [ ] Leaflet inicia con México coloreado por el consolidado global; el hover muestra totales y el clic abre el nivel de estados restringidos a los tres con desarrollos.
   - [ ] Clicar un estado muestra municipios activos coloreados y actualiza el panel lateral con desarrollos disponibles.
   - [ ] En el nivel de municipios se agregan marcadores y tooltips; cada click agrega el botón “ver en Mapbox” y mantiene el stack de navegación con “centrar todo”.
   - [ ] Al seleccionar un marcador, se instancia Mapbox GL con `satellite-v9`, `pitch`, `fill-extrusion` y se destruye al regresar.
   - [ ] Implementar el control jerárquico y la navegación (México → estado → municipio) usando el mapa actual (`frontend/panel/src/components/mapa-de-propiedades/property-map.jsx`), alimentando los niveles con `crm_propiedades_geojson` y los geoJSON base de `backend/app/data/geo`; documentar los filtros de nivel/estatus que ya existen en ese componente para reutilizar.
   - [ ] Añadir una barra lateral/drawer (más allá de lo que ya muestra `property-map.jsx`) con indicadores de color/status, el listado de desarrollos y botones “centrar marcador” / “ver en Mapbox” que sincronizan con los filtros y la información del tooltip descrita en `docs/Plan_3D/frontend_leaflet_osmb.md`.
   - [ ] Crear el módulo Mapbox que se monta/desmonta con cada “Ver en Mapbox”, reutiliza los datos de `crm_propiedades_geojson` y pinta el `fill-extrusion` con las alturas/status del desarrollo, y muestra el panel de detalles con precio, niveles, amenities y el botón “volver al mapa nacional” como en el documento.

6. [ ] **Diseñar la vista de creación/edición en settings**
   - [ ] Añadir `/settings/propiedades` en el sidebar (al lado de `settings/productos`) con el botón “Propiedades”.
   - [ ] Diseñar layout tipo editor de capas: formulario compacto a la izquierda y mapa Leaflet + `leaflet-draw` a la derecha, misma altura.
   - [ ] El formulario incluye datos generales, jerarquía país/estado/municipio/código postal/colonia, referencias a línea/familia/modelo, altura/levels/status y controles guardar/limpiar/centrar.
   - [ ] El mapa permite dibujar/editar polígonos, mantiene el `featureGroup`, y si ya existe la geometría la carga para seguir editando.
   - [ ] Revisar `frontend/panel/src/app/settings/propiedades/page.tsx` y `PropiedadForm` para asegurar que el layout coincide con el editor de capas descrito en `docs/Plan_3D/frontend_leaflet_osmb.md`, que `PropiedadGeomEditor` expone los controles de `leaflet-draw` y que las acciones de guardar/centrar limpian el `featureGroup` antes de subir la geometría.

7. [ ] **UX, filtros y documentación**
   - [ ] Añadir panel lateral con lista de desarrollos (por municipio/estado) que permita centrar y saltar a Mapbox.
   - [ ] Incluir filtros por tipo, nivel y rango de precio que afecten Leaflet y el detalle Mapbox.
   - [ ] Preparar mensaje o loader para comunicar al usuario cuándo el mapa pasa de Leaflet a Mapbox.
   - [ ] Documentar el plan maestro, los endpoints usados y el flujo de navegación para el cliente.
   - [ ] Registrar en `docs/Plan_3D/frontend_leaflet_osmb.md` y/o en otro documento qué datos de `crm_propiedades_geojson` se usan para cada color/status y cómo se garantiza la consistencia con `propiedad_unidades`/`propiedad_capas`, incluyendo qué filtro se aplica en cada nivel.

8. [ ] **Validación y pruebas**
   - [ ] Población de muestra (30 polígonos) con datos exagerados (polígonos grandes) para comprobar colores y visibilidad.
   - [ ] Probar queries espaciales (`ST_Intersects`, `ST_Buffer`, `ST_Simplify`) y filtros por `status`/`tipo`.
   - [ ] Verificar que `settings/productos` pueda seguir funcionando con productos tradicionales mientras el módulo inmobiliario opera por separado.
   - [ ] Automatizar pruebas manuales sobre `frontend/panel` para asegurarse de que los filtros (tipo, nivel, rango de precio) actualizan tanto el marcado en Leaflet como los datos de Mapbox y que el botón “volver al mapa nacional” elimina la instancia Mapbox sin corrupción de estados.

# Registro de avances

- Marcamos como completados los pasos 1 a 3 del plan porque ya existen `propiedad_tipos`, las tablas espaciales jerárquicas (`propiedad_desarrollos`, `propiedad_capas`, `propiedad_unidades`), y el RPC/API `/api/crm/propiedades/geojson` que alimenta el mapa.
- Rediseñamos el flujo de `settings/propiedades` para manejar la creación jerárquica (desarrollo → capa → unidad) primero en atributos y luego en geometrías, reflejándolo en la vista tipo árbol y en el backend (nuevos endpoints/migraciones).
- Actualizamos los catálogos, migraciones y políticas para que `organizacion_id`, `status`, `nivel`, `altura` y `geom` de la jerarquía final (propiedad_unidades) estén alineados con la experiencia inmobiliaria y podamos mostrar inventario reactivo sin depender de la tabla `propiedades`.
- Reescribimos `crm_propiedades_geojson` (ver migración `20280214_130000_propiedades_geojson_3d_metadata.sql`), el proxy `/api/crm/propiedades/geojson` y el componente `frontend/panel/src/components/mapa-de-propiedades/property-map.jsx` para consumir los nuevos campos (`color`, `status_color`, `linea_nombre`, `familia_nombre`, `modelo_nombre`, `desarrollo_*`, `pais/estado/municipio`) y asegurar tooltips, marcadores y navegación coherentes con el plan 3D.
