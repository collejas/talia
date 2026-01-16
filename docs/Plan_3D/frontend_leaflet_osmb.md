# Integración Leaflet → Mapbox para el cliente inmobiliario

Este documento describe cómo implementar el flujo jerárquico descrito en el plan maestro: Leaflet gestiona la navegación México → estado → municipio → desarrollos, y Mapbox GL solo arranca cuando se solicita el modelo 3D de un marcador.

## 1. Hoja de ruta general
- Leaflet debe cargar un GeoJSON simplificado de México con `status` agregado (totales de disponibles/apartados/vendidos). El hover sobre el país muestra el consolidado global en un popup o tooltip.
- Hacer clic en México colorea los tres estados (Playa del Carmen, Guadalajara, Los Cabos) y habilita el hover específico de cada uno.
- Cuando el usuario selecciona un estado, Leaflet carga el GeoJSON de municipios, colorea los que tienen proyectos y cambia los popups para mostrar los datos consolidados del municipio.
- Al hacer clic en un municipio se muestran marcadores por desarrollo; cada marcador muestra su información al pasar el cursor y el panel lateral lista las ubicaciones.
- El click en un marcador dispara la transición a Mapbox (satélite + extrusiones) para mostrar el modelo 3D y las métricas detalladas del desarrollo.

## 2. Leaflet nacional / estados / municipios
- Inicializar `L.map` centrado en México con tiles libres (OpenStreetMap) y una capa base `L.geoJSON` con los polígonos del país.
- Agregar una `L.control` para la leyenda y un `popup` global que se actualice con `mouseover`.
- Manejar niveles (`nivel`, `estado`, `municipio`) guardando el estado actual en un stack para poder navegar hacia atrás.
- Para cada nivel, recalcular el GeoJSON (filtros por estado/municipio) y llamar a `layer.setStyle` para aplicar los colores del `status`.

## 3. Transición a municipios y desarrollos
- Cuando se selecciona un estado, cargar su archivo municipal y usar `setStyle` para resaltar los municipios con desarrollos (`feature.properties.tiene_proyectos`).
- Añadir `mouseover` para mostrar un popup con los totales del municipio y `click` para filtrar la capa de desarrollos.
- Mostrar marcadores `L.marker` por cada desarrollo (`punto_geometrico`) y usar `bindTooltip`/`bindPopup` con la información relevante. Cada marcador debe almacenar el ID de la propiedad para poder luego invocar Mapbox.
- Mantener un panel lateral (o drawer) que liste los desarrollos del municipio con links “Ver en detalle Mapbox”.

## 4. Mapbox de detalle 3D
- El momento en que el usuario pulsa un marcador se activa Mapbox GL:
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
- Agregar la fuente GeoJSON con el desarrollo seleccionado y configurar una capa `fill-extrusion` con `height`, `base` y `color` usando los atributos del RPC.
- Mostrar un popup/en sidebar con los detalles exactos (precio, status, amenidades) y un botón “Volver al mapa nacional” que destruya Mapbox y restaure Leaflet.
- Controlar el consumo de tiles: Mapbox solo carga cuando el usuario entra al detalle; una vez terminado, la instancia se destruye o se oculta para no consumir recursos adicionales.

## 5. Comunicación y UX
- Mostrar indicadores de navegación (“Selecciona un estado”, “Elige un municipio”, “Sigue al desarrollo”) y breadcrumbs.
- El hover en Lidaflet y el panel lateral debe mostrar el mismo color/estado que se pase a Mapbox para mantener consistencia.
- Incluir un control “Centrar todo” en Leaflet/Toggles para reiniciar el stack de navegación sin perder filtros aplicados.

## 6. Extensiones futuras
1. Guardar el historial de clicks (estado/municipio/desarrollo) para análitica interna.
2. Usar un proxy/caché de tiles Mapbox si el volumen de tráfico aumenta.
