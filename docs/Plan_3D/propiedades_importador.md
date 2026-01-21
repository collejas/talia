# Importador de propiedades en CSV

La nueva ruta `POST /crm/propiedades/importar/csv` convierte un archivo CSV (subido desde el modal de `/settings/propiedades`) en la jerarquía de desarrollos → capas → unidades y registra sus polígonos. De esta forma el usuario no necesita construir JSON a mano: basta con exportar desde QGIS/ArcGIS/Excel, cumplir las columnas esperadas y subir el archivo.

## Columnas obligatorias

El CSV debe contener al menos las siguientes columnas. Las filas se agrupan por el valor de `grupo` (puede ser el nombre del desarrollo) y cada fila describe una entidad (`entidad`):

| Columna | Descripción |
| --- | --- |
| `entidad` | `desarrollo`, `capa` o `unidad`. |
| `grupo` | Identificador que agrupa capas y unidades al desarrollo correspondiente. |
| `nombre` | Nombre del desarrollo, capa o unidad (dependiendo de `entidad`). |
| `tipo` | Para desarrollos, `horizontal`/`vertical`/`mixto` (por defecto `horizontal`). |
| `status` | Estado (`disponible`, `apartado`, `vendido`, `reservado`). |
| `nivel` | Para filas de `capa`; número entero que identifica el nivel. |
| `capa_nivel` | Para filas de `unidad`; referencia al `nivel` de la capa padre. |
| `unidad` | Identificador de la unidad (solo en filas `unidad`). |
| `tipo_nombre` | Nombre del tipo de propiedad (coincidencia con `propiedad_tipos`). También se usa como alias para `tipo` cuando la fila describe un desarrollo y `tipo` viene vacío. |
| `poligono` | Geometría en GeoJSON o WKT; el backend la convierte a `SRID=4326`. |
| `metadata` | JSON válido (opcional) para metadata adicional (ej. `{}` o `{"sector":"norte"}`). |
| `linea_id`, `familia_id`, `modelo_id` | UUIDs opcionales para enlazar catálogos. |

Las columnas adicionales como `pais_codigo`, `estado_cve`, `municipio_cve`, `codigo_postal`, `colonia`, `descripcion`, `altura`, `precio`, `area_m2` o `area_m2` son bienvenidas y se transfieren directamente.

## Ejemplo simplificado

```csv
entidad,grupo,nombre,tipo,status,estado_cve,municipio_cve,nivel,poligono
desarrollo,Mirador,Mirador Azul,horizontal,disponible,09,004,,{"type":"MultiPolygon","coordinates":[[[[-109.7383,23.0022,0],[-109.7381,23.0023,0],[-109.7377,23.0018,0],[-109.7380,23.0016,0],[-109.7383,23.0022,0]]]]}
capa,Mirador,Planta baja,,disponible,,,"0","POLYGON((-109.7383 23.0022, -109.7380 23.0016, -109.7381 23.0018, -109.7383 23.0022))"
unidad,Mirador,LOTE-1,,disponible,,,"0",LOTE-1,lote,"POLYGON((-109.7383 23.0022, -109.7381 23.0018, -109.7382 23.0020, -109.7383 23.0022))"
```

### Notas

- La fila `desarrollo` crea el proyecto y registra su polígono en `propiedad_poligonos` con `target_type = desarrollo`.\
- Cada fila `capa` crea un nivel asociado mediante el `nivel` numérico y puede incluir un polígono (`target_type = capa`).\
- Las filas `unidad` vinculan la unidad al nivel correspondiente (`capa_nivel`) y permiten definir su tipo, precio y polígono (`target_type = unidad`).\
- Si necesitas mezclar horizontales y verticales en un mismo contenedor, puedes importar primero los desarrollos hijas y luego registrar sus relaciones manualmente (el importador CSV no crea registros `mixto` directamente).

## Uso del archivo `colo.csv`

El CSV `colo.csv` contiene geometrías exportadas (columna `geometry` con GeoJSON). Puedes renombrar esa columna a `poligono`, duplicar los valores de `nombre`/`grupo` y agregar el resto de columnas mínimas descritas arriba para cargar directamente esos polígonos en el importador. También puedes reutilizar la línea de comandos:

```bash
ogr2ogr -f CSV desarrollo.csv colo.csv -oo "GEOM_POSSIBLE_NAMES=geometry" -lco RFC7946=YES
```

Eso crea un CSV con la columna `geometry` que luego puedes renombrar o procesar con herramientas como `awk`/`python` antes de subirlo.

## Buenas prácticas

1. Descarga `GET /crm/propiedades/tipos` para reservar `tipo_nombre` coherentes.\
2. Mantén el archivo CSV limpio: agrupa filas por desarrollo y ordena las capas (`nivel`) antes de las unidades (`capa_nivel`).\
3. El modal de `/settings/propiedades` refresca la jerarquía una vez concluido el import; si necesitas ajustes, edita desde el árbol o vuelve a importar el CSV.

## Columnas de volumen amigables

Para evitar tener que escribir JSON, puedes añadir columnas independientes que definan el volumen que quieres para cada capa/unidad. El importador toma esas columnas y las coloca dentro de `propiedad_poligonos.metadata`, que luego lee `crm_propiedades_geojson` para calcular `height`, `min_height` y `levels`. Estas columnas son opcionales, pero si las llenas el volumen saldrá correcto en Mapbox:

| Nueva columna | Qué representa | Cómo se usa |
| --- | --- | --- |
| `height` | Altura total en metros que debe tener la extrusión del polígono. | Si existe, el importador copia ese número a `metadata.height`. |
| `min_height` | Altura desde la cual empieza el volumen (puede ser 0). | Se guarda como `metadata.min_height`. |
| `levels` | Cuántos niveles se deben dibujar (utiliza `1` para cada piso). | Se propaga a `metadata.levels`; si no la rellenas, el backend usa el `nivel` numérico como fallback. |
| `metadata_color` / `color` | Color del polígono en formato hex (`#RRGGBB`). | Se guarda en `metadata.color` y el mapa la usa para pintar la capa. |

Puedes mantener esos valores consistentes por piso (ej. `height=3`, `min_height=0`, `levels=1` para cada capa y unidad nueva). El importador los transforma automáticamente en JSON antes de llamar al repositorio, por lo que el usuario solo interactúa con columnas numéricas sencillas en el CSV.

> **Alias para el tipo de desarrollo**: cuando la fila describe un `desarrollo`, el importador busca primero la columna `tipo` y, si no existe o viene vacía, usa `tipo_nombre`. Esto te permite reutilizar CSVs antiguos donde ponías `vertical`/`horizontal` en `tipo_nombre` sin renombrar nada; el backend normaliza (trim + lowercase) antes de validar contra el enum `property_desarrollo_tipo`.
