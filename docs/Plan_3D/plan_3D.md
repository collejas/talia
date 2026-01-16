# Plan Maestro 3D Leaflet + Mapbox detalle

## Objetivo
Desplegar una experiencia geoespacial jerárquica donde Leaflet controle la navegación país → estado → municipio → desarrollo y Mapbox se active exclusivamente al seleccionar un marcados para mostrar el volumen 3D. Cada polígono debe reflejar el `status` (disponible/apartado/vendido) con una escala de colores consistente y los datos del cliente inmobiliario (10 desarrollos por ubicación, 30 en total) deben poder seguirse desde la vista nacional hasta el nivel de propiedad.

- ## Modelo de datos espacial
- * **Tabla `propiedad_desarrollos`**: representa cada desarrollo completo y almacena su nombre, tipo de desarrollo (`horizontal`/`vertical`), referencias jerárquicas (país/estado/municipio) y `geom` del plano general.
- * **Tabla `propiedades`**: ahora actúa como la ficha específica (inventario) que apunta al desarrollo, a la capa (nivel/manzana) y a la unidad correspondiente. Sigue guardando atributos como `tipo_id`, `status`, `precio`, `height`, `min_height`, `levels` y `geom`.
- * **Tabla `propiedad_capas`**: representa el plano intermedio (manzana o nivel) y se vincula a `propiedad_desarrollos` con su propio `geom`, `nivel`, `altura` y `metadata`.
- * **Tabla `propiedad_unidades`**: guarda cada lote/casa/departamento (plano 3) con su `status`, `precio`, `area_m2`, `metadata` y una referencia al nivel superior (`nivel_id`).
- **Catálogos auxiliares**: mantener las tablas de líneas, familias y modelos existentes para ofrecer plantillas a las propiedades, pero el módulo inmobiliario debe permanecer separado de `/settings/productos` para respetar una arquitectura multi-negocio (las propiedades son “productos” con atributos especiales, pero no se mezclan las tablas de inventario tradicionales con los mapas).
- **Estados y RLS**: crear `propiedad_status` enum (`disponible`, `apartado`, `vendido`, `reservado`) y políticas de RLS basadas en `organizacion_id` y `status`. `propiedades`, `propiedad_capas` y `propiedad_unidades` deben tener filtros activos por tenant.
- **RPC/Endpoint GeoJSON**: `crm_propiedades_geojson(p_organizacion uuid, p_estado_cve text DEFAULT NULL, p_municipio_cve text DEFAULT NULL, p_tipo uuid DEFAULT NULL)` devuelve `FeatureCollection` con `properties` extendidas (`status`, `tipo_nombre`, `color`, `height`, `min_height`, `levels`, `linea_nombre`, `familia_nombre`, `modelo_nombre`, `resumen`). Solo expone la geometría de los estados/municipios que tienen desarrollos activos.

## Leaflet jerárquico (México → estados → municipios → marcadores)
- Leaflet arranca centrado en México y colorea el país con el consolidado global. Al pasar el cursor sobre México se muestran los totales (disponibles/apartados/vendidos) y un mensaje como “haz clic para ver los estados clave”.
- Hacer clic en México activa el siguiente nivel: se resalta únicamente los tres estados con desarrollos (Playa del Carmen, Guadalajara, Los Cabos), se vuelve a calcular el popup por hover, y se colorean los estados según el `status` consolidado por estado. Se apoya en los JSONB de `backend/app/data/geo` para obtener poligonos de los estados.
- Clicar un estado carga sus municipios coloreados únicamente si tienen desarrollos. Cada municipio habilitado muestra un tooltip con métricas propias y el panel lateral se actualiza para listar los proyectos del estado.
- Seleccionar un municipio agrega marcadores `L.marker` por desarrollo y muestra un panel de lista con acciones (“centrar marcador”, “ver en Mapbox”). Cada marcador usa `bindTooltip`/`bindPopup` para información inmediata del proyecto.
- El stack de navegación permite volver al nivel anterior y un control “centrar todo” restablece México sin perder filtros. Se debe conservar el color para los estados/municipios que no tienen desarrollos (grises o transparentes) para que no distraigan.

## Transición a Mapbox 3D
- Cuando el usuario pulsa “ver en Mapbox” en un marcador, Leaflet se oculta y se instancia Mapbox GL con `mapbox://styles/mapbox/satellite-v9`, `pitch 60`, `bearing 0`, `zoom 18` y el centro en el desarrollo seleccionado, minimizando el uso de tiles cargando solo bajo demanda. La instancia se destruye al regresar a Leaflet para evitar gasto excesivo de tiles.
- Se agrega una capa `fill-extrusion` o similar con `height`, `min_height` y `levels`. El color sigue la misma escala (verde/amarillo/rojo) para mantener consistencia visual. Popup/panel muestra detalles (precio, status, amenities, niveles) y un botón “volver al mapa nacional”.
- Mapbox también puede usar los datos de `linea/familia/modelo` para contextualizar el desarrollo con la plantilla que le corresponde.

## Vista de creación/edición de propiedades (settings)
- En `/settings/propiedades` se añade una pantalla tipo “editor de capas”: formulario de datos generales (colapsado/compacto) a la izquierda y mapa de Leaflet + `leaflet-draw` a la derecha, ocupando toda la altura del contenedor (igual que en QGIS/ArcMap).
- El formulario incluye campos esenciales (nombre, tipo, matriz de país/estado/municipio/código postal/colonia, precio, status, altura, niveles, metadata, referencia a línea/familia/modelo) y controles para guardar, limpiar, centrar y validar la geometría.
- El mapa muestra el polígono actual (si existe) y permite crear/editar con los controles de `leaflet-draw`. Al guardar, la geometría se guarda como GeoJSON en backend y se asocia al resto de atributos.
- Se reutilizan los archivos JSONB de país/estado/municipio para alimentar los selects y mantener la jerarquía, de modo que la creación de propiedades se vuelve guiada y visual.

## Flujo multi-negocio y separación de capas
- La solución inmobiliaria se mantiene como un módulo con su propia capa espacial, pero permite referenciar líneas/familias/modelos sin mezclar la lógica de `/settings/productos`. En paralelo, `/settings/productos` sigue manejando productos no espaciales.
- Documentar el flujo que conecta `settings/productos` con `settings/propiedades` si se decide compartir plantillas; pero dejar claro que la gestión de polígonos y mapas permanece en el módulo inmobiliario.
- Para soportar nuevas ubicaciones de desarrollos se puede extender el RPC y JSONB para cargar nuevos estados/municipios y el conjunto de 30 desarrollos (10 por cada ubicación) se mantiene limitado a esos territorios para reducir carga de Mapbox.

## Riesgos y consideraciones
- Leaflet es la vista ortogonal nacional; la sensación 3D solo se logra con Mapbox así que debe haber indicadores (mensajes, loaders) que comuniquen la transición al usuario.
- Mapbox tiene límite gratuito de tiles, por lo tanto el uso debe concentrarse en las zonas con desarrollos y destruir la instancia cuando no se use. Considerar cache/capacidad de tiles si el tráfico aumenta.
- Validar los polígonos creados para evitar vertices innecesarios, mantener índices GiST actualizados y usar `ST_Simplify` cuando haya geometrías complejas.
- El módulo inmobiliario debe filtrar solo los estados/municipios con desarrollos; los demás se muestran en gris para evitar colorear países o estados sin datos, y se deben recalcular los totales al actualizar un estado.
