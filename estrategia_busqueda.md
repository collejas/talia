• Pipeline Google Places

  - Las búsquedas pueden operar en modo texto o nearby; ambos normalizan los parámetros (query, radio, idioma, pageSize, tipos) antes
    de lanzar la ingesta.
  - El radio pedido se convierte en una cuadrícula (1×1, 3×3 o 5×5 según el tamaño) con pasos en metros y radios por tile. Cada
    centro se consulta con un círculo (locationBias/locationRestriction) para cubrir todo el radio sin huecos; la cobertura final es
    por radio, pero segmentada en tiles solapados para eludir los límites de la API.

  Paginación, deduplicación y enriquecimiento

  - Cada tile se recorre por páginas (hasta 20 resultados por página) siguiendo nextPageToken mientras haya datos nuevos.
  - Los resultados básicos se van deduplicando por place_id conforme llegan, de modo que un negocio repetido en distintos tiles/
    páginas solo se procesa una vez.
  - Tras sumar los basics, se filtran de nuevo usando distancia Haversine respecto al centro original para mantener únicamente los
    que caen dentro del radio exacto solicitado; si la UI pidió un límite, se recorta en este punto.
  - Luego se hace un lote de llamadas de detalles (places/{id}) para obtener teléfono, website, rating, etc., y se combinan basics +
    details en un formato homogéneo antes de insertarlos en la base.

  Conteo y almacenamiento

  - Una tarea en segundo plano ejecuta toda la ingesta, inserta los resultados mediante un RPC batch y usa el conteo devuelto (o el
    número de items normalizados) para actualizar el total de la búsqueda junto con el estado (processing, done, error).
  - En la tabla de búsquedas se conservan radio, centro, totales y metadatos; la tabla de resultados almacena cada prospecto
    normalizado para consultas posteriores.

  Presentación en el dashboard

  - La vista de resultados (/busquedas/:id) consume una vista agregada con paginación server-side y filtros por texto, actividad,
    fuente, rango de fechas y “dentro de radio”, lo que permite navegar decenas de miles de filas sin degradación.
  - El mapa se alimenta de otra vista optimizada y aplica ST_DWithin para mostrar exactamente el mismo radio/centro usado en la
    ingesta, sincronizado con la tabla. Exportaciones y acciones CRM siempre operan sobre el subconjunto filtrado vigente.