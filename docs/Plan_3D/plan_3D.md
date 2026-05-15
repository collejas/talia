# Plan Maestro 3D Leaflet + Mapbox detalle

## Objetivo
Desplegar una experiencia geoespacial jerárquica donde Leaflet controle la navegación país → estado → municipio → desarrollo y Mapbox se active exclusivamente al seleccionar un marcador para mostrar el volumen 3D. Cada polígono debe reflejar el `status` (disponible/apartado/vendido) con una escala de colores consistente y los datos del cliente inmobiliario (10 desarrollos por ubicación, 30 en total) deben poder seguirse desde la vista nacional hasta el nivel de propiedad.

- ## Modelo de datos espacial
- * **Tabla `propiedad_desarrollos`**: representa cada desarrollo completo y almacena su nombre, tipo de desarrollo (`horizontal`/`vertical`), referencias jerárquicas (país/estado/municipio) y su geometría principal en PostGIS (`geom`).
- * **Tabla `propiedades`**: se mantiene como puente de compatibilidad histórica para el refactor, pero el inventario operativo del módulo inmobiliario ya vive en `propiedad_desarrollos`, `propiedad_capas` y, sobre todo, `propiedad_unidades`.
- * **Tabla `propiedad_capas`**: representa el plano intermedio (manzana o nivel) y se vincula a `propiedad_desarrollos` con su propia geometría en PostGIS (`geom`), `nivel`, `altura` y `status`; `metadata` queda solo para extensión no crítica.
- * **Tabla `propiedad_unidades`**: guarda cada lote/casa/departamento (plano 3) con su `status`, `precio`, `area_m2`, `oportunidad_id`, `catalog_item_id`, `metadata` de extensión y una referencia al nivel superior (`nivel_id`).
- **Catálogos auxiliares**: mantener las tablas de líneas, familias y modelos existentes para ofrecer plantillas a las propiedades, pero el módulo inmobiliario debe permanecer separado de `/settings/productos` para respetar una arquitectura multi-negocio (las propiedades son “productos” con atributos especiales, pero no se mezclan las tablas de inventario tradicionales con los mapas).
- **Estados y RLS**: crear `propiedad_status` enum (`disponible`, `apartado`, `vendido`, `reservado`) y políticas de RLS basadas en `organizacion_id` y `status`. El foco del tenant debe quedar en `propiedad_desarrollos`, `propiedad_capas` y `propiedad_unidades`; `propiedades` solo debe permanecer si sigue existiendo como puente temporal.
- **RPC/Endpoint GeoJSON**: `crm_propiedades_geojson(p_organizacion uuid, p_estado_cve text DEFAULT NULL, p_municipio_cve text DEFAULT NULL, p_tipo uuid DEFAULT NULL)` devuelve `FeatureCollection` con `properties` extendidas (`status`, `tipo_nombre`, `color`, `height`, `min_height`, `levels`, `linea_nombre`, `familia_nombre`, `modelo_nombre`, `resumen`). Solo expone las geometrías de los estados/municipios que tienen desarrollos activos.
- **Catálogo asociado**: cada unidad geoespacial se refleja automáticamente como un `catalog_item` (`tipo = producto`) cuyos metadatos incluyen `propiedad_id`, `unidad_id`, `catalog_item_id` y los atributos volumétricos liberados en `metadatos_extra`. `_ensure_catalog_item_for_unidad` se ejecuta tanto desde el importador CSV como desde `/crm/propiedades` y registra en `logs/mapbox-debug.log` cada sincronización para que el panel Mapbox pueda verificar qué `catalog_item_id` le toca a cada feature.

## Leaflet jerárquico (México → estados → municipios → marcadores)
- Leaflet arranca centrado en México y colorea el país con el consolidado global. Al pasar el cursor sobre México se muestran los totales (disponibles/apartados/vendidos) y un mensaje como “haz clic para ver los estados clave”.
- Hacer clic en México activa el siguiente nivel: se resalta únicamente los tres estados con desarrollos (Playa del Carmen, Guadalajara, Los Cabos), se vuelve a calcular el popup por hover, y se colorean los estados según el `status` consolidado por estado. Se apoya en los JSONB de `backend/app/data/geo` para obtener poligonos de los estados.
- Clicar un estado carga sus municipios coloreados únicamente si tienen desarrollos. Cada municipio habilitado muestra un tooltip con métricas propias y el panel lateral se actualiza para listar los proyectos del estado.
- Seleccionar un municipio agrega marcadores `L.marker` por desarrollo y muestra un panel de lista con acciones (“centrar marcador”, “ver en Mapbox”). Cada marcador usa `bindTooltip`/`bindPopup` para información inmediata del proyecto.
- El conjunto de países/estados/municipios coloreados ahora proviene directamente de las propiedades (`crm_propiedades_geojson` + sus codificaciones `pais_codigo`, `estado_cve`, `municipio_cve`), de modo que el mapa solo pinta regiones con desarrollos y centra la vista en ellas antes de mostrar las unidades del nivel inferior.
- El stack de navegación permite volver al nivel anterior y un control “centrar todo” restablece México sin perder filtros. Se debe conservar el color para los estados/municipios que no tienen desarrollos (grises o transparentes) para que no distraigan.

## Transición a Mapbox 3D
- Cuando el usuario pulsa “ver en Mapbox” en un marcador, Leaflet se oculta y se instancia Mapbox GL con `mapbox://styles/mapbox/satellite-v9`, `pitch 60`, `bearing 0`, `zoom 18` y el centro en el desarrollo seleccionado, minimizando el uso de tiles cargando solo bajo demanda. La instancia se destruye al regresar a Leaflet para evitar gasto excesivo de tiles.
- Se agrega una capa `fill-extrusion` o similar con `height`, `min_height` y `levels`. El color sigue la misma escala (verde/amarillo/rojo) para mantener consistencia visual. Popup/panel muestra detalles (precio, status, amenities, niveles) y un botón “volver al mapa nacional”.
- Mapbox también puede usar los datos de `linea/familia/modelo` para contextualizar el desarrollo con la plantilla que le corresponde.
- Implementación actual: el drill-down en Mapbox respeta la jerarquía (desarrollo → solo capas → solo unidades), con extrusión sólida (`height = base + height`), sin gradiente vertical, iluminación frontal y hover en verde; antes de enviar a Mapbox se normalizan IDs y se eliminan coordenadas Z para evitar caras faltantes.
- **Notas de implementación (2026-01-22)**:
  - **Z en GeoJSON**: Mapbox `fill-extrusion` no usa coordenadas Z del polígono como base; la base/altura provienen de `min_height` y `height`. En el frontend se elimina la Z (`stripZGeometry`) antes de enviar a Mapbox para evitar artefactos.
  - **Aislar una unidad**: al hacer clic en una unidad se ocultan las demás unidades del set actual usando `feature-state.hidden` (sin reescribir el source), para que la unidad seleccionada permanezca visible.
  - **Limitación Mapbox**: `fill-extrusion-opacity` no admite expresiones en este stack; el ocultamiento se implementa con `fill-extrusion-color = rgba(0,0,0,0)` y `height/base = 0` cuando `hidden=true`.
  - **Cámara estable (sin “brinco” a 2D)**: para transiciones desarrollo→capa→unidad se usa `cameraForBounds` + `easeTo` (o fallback a `fitBounds` con `bearing/pitch`) para mantener `pitch/bearing` estables y animación smooth.

## Vista de creación/edición de propiedades (settings)
- En `/settings/propiedades` se añade una pantalla tipo “editor de capas”: formulario de datos generales (colapsado/compacto) a la izquierda y mapa de Leaflet + `leaflet-draw` a la derecha, ocupando toda la altura del contenedor (igual que en QGIS/ArcMap).
- El formulario incluye campos esenciales (nombre, tipo, matriz de país/estado/municipio/código postal/colonia, precio, status, altura, niveles, color, referencia a línea/familia/modelo) y controles para guardar, limpiar, centrar y validar la geometría. `metadata` queda como extensión opcional, no como campo operativo.
- El mapa muestra el polígono actual (si existe) y permite crear/editar con los controles de `leaflet-draw`. Al guardar, la geometría se guarda como GeoJSON en backend y se asocia al resto de atributos.
- Se reutilizan los archivos JSONB de país/estado/municipio para alimentar los selects y mantener la jerarquía, de modo que la creación de propiedades se vuelve guiada y visual.

## Flujo multi-negocio y separación de capas
- La solución inmobiliaria se mantiene como un módulo con su propia capa espacial, pero permite referenciar líneas/familias/modelos sin mezclar la lógica de `/settings/productos`. En paralelo, `/settings/productos` sigue manejando productos no espaciales.
- Documentar el flujo que conecta `settings/productos` con `settings/propiedades` si se decide compartir plantillas; pero dejar claro que la gestión de polígonos y mapas permanece en el módulo inmobiliario.
- Para soportar nuevas ubicaciones de desarrollos se puede extender el RPC y JSONB para cargar nuevos estados/municipios y el conjunto de 30 desarrollos (10 por cada ubicación) se mantiene limitado a esos territorios para reducir carga de Mapbox.

## Riesgos y consideraciones
- Leaflet es la vista ortogonal nacional; la sensación 3D solo se logra con Mapbox así que debe haber indicadores (mensajes, loaders) que comuniquen la transición al usuario.
- Mapbox tiene límite gratuito de tiles, por lo tanto el uso debe concentrarse en las zonas con desarrollos y destruir la instancia cuando no se use. Considerar cache/capacidad de tiles si el tráfico aumenta.
- Validar los polígonos creados para evitar vértices innecesarios, mantener índices GiST actualizados y usar `ST_Simplify` cuando haya geometrías complejas.
- El módulo inmobiliario debe filtrar solo los estados/municipios con desarrollos; los demás se muestran en gris para evitar colorear países o estados sin datos, y se deben recalcular los totales al actualizar un estado.

## Validación del flujo jerárquico

- Documentar para el cliente que el mapa nacional → estatal → municipal sólo pinta regiones que contienen desarrollos (los códigos `pais_codigo`, `estado_cve` y `municipio_cve` en `crm_propiedades_geojson`) y que al hacer clic en un municipio válido el mapa se centra, colorea y expone los desarrollos que pertenecen a ese municipio.
- Registrar los pasos manuales que deben seguirse (abrir `/crm/propiedades`, seleccionar país → estado → municipio) para comprobar que cada nivel se centra antes de mostrar el siguiente y que el botón “ver en Mapbox” se activa al seleccionar una unidad.

## Registro de avances

- Reescribimos la jerarquía espacial para que `propiedad_desarrollos`, `propiedad_capas` y `propiedad_unidades` representen los niveles maestros del plan 3D; la operación diaria ya se concentra en `propiedad_unidades` y `propiedades` queda como soporte de transición o compatibilidad, no como fuente principal.
- Ajustamos la vista de `/settings/propiedades` para forzar la creación de características antes de los polígonos y para visualizar la jerarquía como árbol desplegable, con APIs que crean o editan cada nodo y asociaciones geométricas separadas.
- Ejecutamos las migraciones necesarias (renombrado de tablas, eliminación de columnas geom, nuevas políticas, RPC de jerarquía) y alineamos el backend/frontend para que usen los nuevos nombres (`propiedad_desarrollos`, `propiedad_capas`, `propiedad_unidades`) y respeten el multitenant (`organizacion_id`).
- Ajustamos la carga de Mapbox 3D para que arranque con la unidad seleccionada, mantenga el pitch en 60°, exponga sliders de pitch/bearing y registre los eventos iniciales/`set-data` en `logs/mapbox-debug.log` para depurar los `FeatureCollection` enviados.
- El proxy `/api/crm/demografia/mapa` ahora captura errores del CRM/Supabase, responde con un payload seguro (`ok:false`, dataset y geojson vacíos) y evita los 502 que rompían la jerarquía al recargar la vista.
- Documentamos el flujo CSV → backend en `/docs/Plan_3D`: el formulario de `/settings/propiedades` envía el archivo a `POST /api/crm/propiedades/importar/csv`, que a su vez llama al endpoint del CRM definido en `backend/app/api/routes/crm.py`. Ese endpoint lee el CSV línea por línea, agrupa desarrollos/capas/unidades, usa `_csv_to_import_request` para validar cada fila (campos obligatorios como `entidad`, `grupo`, `poligono`, y opcionales como `altura`, `nivel`, `metadata`), y luego `_process_import_request` crea o actualiza cada desarrollo usando los repositorios (`CRMRepository`). El volumen 3D ya se normaliza a columnas reales en `propiedad_poligonos`, y `crm_propiedades_geojson` lee esas columnas primero para renderizar el volumen sin depender de `metadata`.
- El registro de avances documenta que el disparador `_ensure_catalog_item_for_unidad` se integra ahora dentro de la ruta `/crm/propiedades`: cada vez que se crea una unidad manualmente el backend sincroniza el `catalog_item`, guarda los IDs de propiedad/unidad como columnas relacionadas cuando aplican y usa `metadata` solo para trazabilidad auxiliar. Gracias a esto la ficha Mapbox recibe el `catalog_item_id`, muestra el botón “Registrar venta” y permite disparar la venta sin tener que reconstruir manualmente el enlace entre inventario espacial y catálogo comercial.
- Documentar el próximo paso: aún cuando el importador crea `propiedad_unidades` con `linea_id/familia_id/modelo_id`, el flujo de ventas trabaja sobre `catalog_items`. Por eso el plan es que cada unidad (lote/depa) cree también su `catalog_item` en el backend (repositorio + helper del importador) y guarde ese enlace en columnas y no en `metadata`. Así durante la venta se puede usar el catálogo directamente y se mantiene la trazabilidad con la geometría original. Esta idea debe quedar registrada en `docs/Plan_3D` para coordinar backend/ventas e iniciar el nuevo endpoint de registro de ventas integrado.

## Documentos relacionados

- `docs/Plan_3D/plan_normalizacion_inventario_ventas_personas.md`
- `docs/Plan_3D/plan_migracion_tecnica_inventario_ventas_personas.md`
- `docs/Plan_3D/checklist_prs_inventario_ventas_personas.md`
