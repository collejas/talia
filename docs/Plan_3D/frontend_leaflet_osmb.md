# Integración Leaflet → Mapbox para la experiencia inmobiliaria

Este documento complementa el plan maestro y describe cómo debe comportarse el frontend: Leaflet controla la navegación jerárquica México → estados → municipios → desarrollos, y Mapbox GL solo aparece al pedir el modelo 3D de un marcador o al cerrar la pantalla de creación.

## 1. Flujo nacional jerárquico
- Leaflet inicia centrado en México con un GeoJSON simplificado que representa el país completo. Solo México está coloreado (verde/amarillo/rojo según el consolidado global). El tooltip/hover muestra los totales (`disponibles`, `apartados`, `vendidos`) y un mensaje “haz clic para ver los estados con desarrollos”.
- Al hacer clic, Leaflet resalta únicamente los tres estados que tienen proyectos (Playa del Carmen, Guadalajara, Los Cabos). El hover por estado muestra los datos consolidados del estado y el tooltip debe avisar “haz clic para ver los municipios que tienen desarrollos”.
- Clicar un estado carga su GeoJSON municipal (reusando los JSONB del backend) y colorea únicamente los municipios con proyectos. El panel lateral actualiza la lista de desarrollos por estado y se habilita el botón “centrar todo”.
- Al seleccionar un municipio se agregan marcadores por desarrollo. Cada marcador tiene `bindTooltip` con nombre/estatus/precio y `bindPopup` con un botón “Ver en Mapbox”. El panel lateral muestra una card por desarrollo con acciones (“centrar marcador”, “ver en Mapbox”).
- Mantener un stack de niveles (México → Estado → Municipio → Desarrollo) con breadcrumb y control “volver” y “centrar todo” para no perder la navegación. Los estados/municipios sin desarrollos se muestran en gris o con baja opacidad.

## 2. Panel lateral, filtros y datos
- El panel lateral (o drawer) muestra:
  1. Totales globales y filtros (tipo de propiedad, rango de precio, nivel/altura).
  2. Lista de desarrollos del nivel activo con botones para centrar o abrir Mapbox.
  3. Indicadores de línea/familia/modelo (tomados de las propiedades asociadas).
- Los filtros aplican tanto a Leaflet como a Mapbox (cuando se abre). Si se filtra por tipo, el tooltip y la lista deben reflejar el color correcto.
- Los datos que alimentan la vista (totales por país, estado, municipio) provienen del RPC `crm_propiedades_geojson` y de los archivos JSONB del backend (`backend/app/data/geo`), garantizando que solo se coloreen las regiones con datos.
- El botón “centrar todo” vuelve México y borra los marcadores de niveles inferiores sin recargar la página.

## 3. Transición Mapbox 3D
- La versión 3D se abre únicamente cuando el usuario presiona “Ver en Mapbox” en un marcador o en la lista lateral. Leaflet se oculta y Mapbox GL se monta en el mismo contenedor.
- Configuración recomendada:
  ```ts
  const mapbox = new mapboxgl.Map({
    container: "mapbox-container",
    style: "mapbox://styles/mapbox/satellite-v9",
    center: [lng, lat],
    zoom: 18,
    pitch: 60,
    bearing: 0,
  });
  ```
- Agregar una fuente GeoJSON con `height`, `min_height`, `levels`, `status`, `linea_nombre` y usar una capa `fill-extrusion` con `color` según el `status`.
- Mostrar un panel con info extendida (precio, status, amenidades, niveles, referencia a línea/modelo) y un botón “volver al mapa nacional” que destruye la instancia Mapbox y reestablece Leaflet.
- Para no sobrepasar el límite de Mapbox, la instancia se crea bajo demanda y se destruye al salir, además de que solo se activa para los marcadores de los tres estados clave.

## 4. Vista de creación/edición (settings/propiedades)
- `/settings/propiedades` debe estar visible en el sidebar bajo la sección de `settings` como un botón “Propiedades”.
- El layout debe imitar un editor de capas: el formulario de “Datos generales” se ubica a la izquierda (Texto más compacto, márgenes reducidos) y el mapa con `leaflet-draw` a la derecha ocupando el alto completo del contenedor.
- El formulario incluye nombre, tipo, jerarquía geográfica (país/estado/municipio/código postal/colonia), precio, status, height, levels, metadata y referencias a `linea/familia/modelo`. El mapa permite dibujar y editar polígonos, realiza zoom a la geometría registrada y tiene botones para guardar, limpiar y centrar.
- Reutilizar los JSONB de país/estado/municipio en los selects para garantizar que la creación de propiedades se sincronice con la jerarquía del mapa nacional.
- El editor debe inicializar Leaflet en modo dibujo, mostrando los controles de `leaflet-draw` y el `featureGroup` actual para permitir re-edición. Si la geometría es demasiado pequeña, mostrar un warning y sugerir repetir la captura.

## 5. Consideraciones y extensiones
- Mantener separados los módulos de producto tradicional (`settings/productos`) y propiedades inmobiliarias, pero permitir que las propiedades lean información de líneas/familias/modelos para plantillas.
- Documentar la ruta completa (RPC → Leaflet → Mapbox) y capacitar al cliente con un mensaje que explique los colores, los filtros y qué ocurre al pasar de Leaflet a Mapbox.
- Preparar un mecanismo ligero de refresh (polling o WebSockets) para que los estados reflejen los cambios de ventas sin recargar todo el mapa. También preparar una caché de tiles Mapbox para reducir consumo si el tráfico aumenta.
