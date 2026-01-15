# Integración Leaflet + OSMBuildings

Este documento describe paso a paso cómo consumir el RPC `crm_propiedades_geojson` y representar los volúmenes en el mapa con filtros por tipo/nivel, leyenda de estados y toggle planta/3D.

## 1. Configuración base
- Añadir los scripts/css de Leaflet y OSMBuildings en la página (o usar un bundle con `npm install leaflet osmbuildings`).
- Inicializar el mapa (`L.map('map')`) con tile base (Mapbox/OSM) y setear `view` al área del desarrollo.
- Crear capa de OSMBuildings:
  ```js
  const osmb = new OSMBuildings(map, {
    minZoom: 15,
    maxZoom: 21,
    position: 'bottomright',
  });
  ```

## 2. Consumir GeoJSON del backend
- Disparar `fetch('/api/crm/propiedades/geojson?nivel=&tipo_id=')` o directamente `fetch('/crm/propiedades/geojson?nivel=&tipo_id=')` desde el backend que invoque `crm_propiedades_geojson`.
- Parsear el `FeatureCollection` y aplicar `osmb.setData(data); osmb.show();`.
- Cada `feature` debe tener en `properties` el color y estado. Un ejemplo de transformador:
  ```js
  const statusColor = {
    disponible: '#2ECC71',
    apartado: '#F1C40F',
    vendido: '#E74C3C',
    reservado: '#9B59B6',
  };

  const data = response.features.map(feature => {
    feature.properties.wallColor = statusColor[feature.properties.status] ?? '#95A5A6';
    feature.properties.roofColor = feature.properties.wallColor;
    return feature;
  });
  osmb.setData({ type: 'FeatureCollection', features: data });
  ```

## 3. Controles de nivel/tipo
- Mantener selects o chips de `nivel`/`tipo`. Cada cambio debe reconsultar el RPC con parámetros (`?p_nivel=2&p_tipo=<uuid>`).
- Alternativamente filtrar el GeoJSON en el cliente usando `feature.properties.nivel === nivelSeleccionado`.
- Actualizar la leyenda y el panel lateral con el tipo y su color base (`propiedad_tipos.color`).

## 4. Toggle planta / 3D
- Crear una capa Leaflet `L.geoJSON` adicional con los polígonos planos.
- Controlar su visibilidad (mostrar solo cuando el toggle “planta” esté activo).
- Mantener OSMBuildings visible cuando la opción “3D” esté activa; al hacer toggle, ocultar/mostrar con `osmb.hide()` / `osmb.show()`.

## 5. Interactividad y UI
- Asociar `onEachFeature` en la capa plana para bind popups (nombre, precio, status, tipo).
- Al hacer click en un volumen de OSMBuildings, centrar el mapa y abrir el popup correspondiente.
- Panel lateral: mostrar lista de propiedades con su estado y un botón “centro en mapa”.

## 6. Actualización dinámica
- Implementar polling ligero (ej. cada 30 s) o eventos vía WebSocket para reconsultar `crm_propiedades_geojson` y refrescar el volumen.
- Si se recibe un cambio de estado, ejecutar `osmb.setColor(feature, newColor)` y `osmb.refresh()`.

## 7. Siguientes acciones
1. Crear endpoint Next.js/Backend que invoque el RPC y recorte los parámetros query.
2. Consumir ese endpoint desde el componente del mapa.
3. Agregar estilos y panel lateral en la UI del cliente inmobiliario (botones de filtro, leyenda, toggle).
