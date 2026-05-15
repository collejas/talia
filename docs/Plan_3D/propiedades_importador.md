# Importador de propiedades en CSV

La nueva ruta `POST /crm/propiedades/importar/csv` convierte un archivo CSV (subido desde el modal de `/settings/propiedades`) en la jerarquía de desarrollos → capas → unidades y registra sus polígonos. De esta forma el usuario no necesita construir JSON a mano: basta con exportar desde QGIS/ArcGIS/Excel, cumplir las columnas esperadas y subir el archivo.

Desde el mismo modal también puedes descargar una plantilla y exportar la jerarquía actual con la misma estructura del CSV, para usarla como base o para rehacer la importación sin inventar columnas nuevas. La exportación intenta completar `height`, `min_height`, `levels` y `color` desde el `geojson` de propiedades cuando esos datos existen.

## Plantilla mínima recomendada

El CSV debe contener al menos estas columnas para que el usuario final no tenga que fabricar un archivo enorme. Las filas se agrupan por el valor de `grupo` (puede ser el nombre del desarrollo) y cada fila describe una entidad (`entidad`):

| Columna | Descripción |
| --- | --- |
| `entidad` | `desarrollo`, `capa` o `unidad`. |
| `grupo` | Agrupa capas y unidades al mismo desarrollo. |
| `nombre` | Nombre del desarrollo, capa o unidad. |
| `status` | Estado (`disponible`, `apartado`, `vendido`, `reservado`). |
| `poligono` | Geometría en GeoJSON o WKT. |

Con eso ya puedes importar una estructura básica. El resto de columnas son opcionales y sirven para enriquecer el inventario, pero no deberían ser obligatorias para el usuario final.

## Columnas opcionales útiles

| Columna | Descripción |
| --- | --- |
| `tipo_desarrollo` | Para filas de `desarrollo`, `horizontal`/`vertical`/`mixto` (por defecto `horizontal`). |
| `nivel` | Para filas de `capa`; número entero que identifica el nivel. |
| `capa_nivel` | Para filas de `unidad`; referencia al `nivel` de la capa padre. |
| `unidad` | Identificador de la unidad (solo en filas `unidad`). |
| `tipo_unidad_nombre` | Nombre del tipo de propiedad de la unidad (coincidencia con `propiedad_tipos`). |
| `precio` | Precio de la unidad. |
| `area_m2` | Superficie útil o construida de la unidad. |
| `descripcion` | Descripción genérica. |
| `descripcion_desarrollo` | Descripción específica del desarrollo. |
| `descripcion_capa` | Descripción específica de la capa. |
| `descripcion_unidad` | Descripción específica de la unidad. |
| `pais_codigo`, `estado_cve`, `municipio_cve`, `codigo_postal`, `colonia` | Datos geográficos del desarrollo. |
| `height`, `min_height`, `levels`, `color` | Contrato normalizado para el volumen 3D del polígono. |
| `metadata_*` | Columnas extra al final del CSV para atributos no operativos, por ejemplo `metadata_cuartos` o `metadata_patio_servicio`. Úsalas solo para datos que no vas a filtrar, ordenar ni convertir en regla de negocio. |
| `linea_id`, `familia_id`, `modelo_id`, `linea_nombre`, `familia_nombre`, `modelo_nombre` | UUIDs opcionales para enlazar catálogos; si el usuario no conoce los UUIDs puede enviar los nombres registrados en el CRM y el importador los resolverá (crea la línea/familia/modelo si es necesario). |

> Nota: `tipo_desarrollo` es el tipo del desarrollo. `tipo_unidad_nombre` es el nombre visible del tipo de la unidad y se resuelve contra la tabla `propiedad_tipos`. El importador sigue aceptando `tipo` y `tipo_nombre` como alias legados, pero la plantilla nueva ya no los usa.
>
> `familia_nombre` requiere que el CSV incluya también `linea_id` o `linea_nombre` para asociar la familia a la línea correcta, y `modelo_nombre` necesita `familia_id` o `familia_nombre` (con la línea inferida) para ubicar el catálogo completo.
>
> La metadata libre que no participe en consultas, filtros o reglas puede seguir llegando por compatibilidad en `metadata`, pero la plantilla nueva usa columnas `metadata_*` al final y no debe usar `metadata` como fuente principal de campos operativos.

### Campos específicos por entidad

Además de las columnas anteriores, puedes incluir campos adicionales para poblar los atributos propios de cada tabla espacial:

- **`propiedad_desarrollos`**: `descripcion_desarrollo`, `codigo_postal`, `colonia` (además de los campos jerárquicos como `pais_codigo`, `estado_cve` y `municipio_cve`). Estos valores se escriben directamente en el registro del desarrollo.
- **`propiedad_capas`**: `descripcion_capa`. La descripción se guarda en la capa y la jerarquía la define `nivel`; si necesitas guardar la altura del plano de capa, usa el campo real `altura` de la capa. El volumen 3D del polígono ya debe venir en columnas normalizadas de `propiedad_poligonos` y no depender de `metadata`.
- **`propiedad_unidades`**: `descripcion_unidad`, `precio` y `area_m2` acompañan al identificador `unidad`/`nombre`. `area_m2` es el área de la unidad; si no lo provees, la unidad se crea con valores en blanco pero el importador ya acepta esa columna para enriquecer el inventario.

Los nombres `descripcion_desarrollo`, `descripcion_capa` y `descripcion_unidad` se aplican únicamente cuando la fila es del tipo correspondiente; si usas la columna genérica `descripcion` también funcionará (se aplica según el valor de `entidad`), pero las columnas específicas ayudan a evitar confusiones cuando completas el archivo. Sólo escribe la descripción que corresponda al nivel del registro y deja las demás vacías.

Las columnas adicionales como `pais_codigo`, `estado_cve`, `municipio_cve`, `codigo_postal`, `colonia`, `descripcion`, `height`, `min_height`, `levels`, `color`, `precio`, `area_m2` y `metadata_*` son bienvenidas y se transfieren directamente. Mantén las columnas `metadata_*` juntas al final del archivo.

## Ejemplo simplificado

```csv
entidad,grupo,nombre,status,nivel,capa_nivel,unidad,tipo_desarrollo,tipo_unidad_nombre,descripcion,poligono,height,min_height,levels,color,precio,area_m2,pais_codigo,estado_cve,municipio_cve,codigo_postal,colonia,metadata_cuartos,metadata_patio_servicio,metadata_cocina,metadata_banos,metadata_m2_construccion,metadata_m2_terreno,metadata_frente,metadata_cisterna,metadata_terraza,metadata_roof_garden,metadata_vestidor_recamara_principal
desarrollo,Mirador,Mirador Azul,disponible,,,,horizontal,,Desarrollo base,"POLYGON((-109.7383 23.0022, -109.7381 23.0023, -109.7377 23.0018, -109.7380 23.0016, -109.7383 23.0022))",,,,#0F766E,,,MX,09,004,78398,Aguaje 2000,,,,,,,,,,,
capa,Mirador,Planta baja,disponible,0,,,,,Nivel principal,"POLYGON((-109.7383 23.0022, -109.7380 23.0016, -109.7381 23.0018, -109.7383 23.0022))",3,0,1,#0F766E,,,MX,09,004,78398,Aguaje 2000,,,,,,,,,,,
unidad,Mirador,LOTE-1,disponible,,0,LOTE-1,,Terreno Departamental,Unidad ejemplo,"POLYGON((-109.7383 23.0022, -109.7381 23.0018, -109.7382 23.0020, -109.7383 23.0022))",3,0,1,#0F766E,3119155,479.87,MX,09,004,78398,Aguaje 2000,2,1,1,2,85,120,8,1,1,0,1
```

### Notas

- La fila `desarrollo` crea el proyecto y registra su geometría en `propiedad_poligonos` con `target_type = desarrollo`.
- Cada fila `capa` crea un nivel asociado mediante el `nivel` numérico y puede incluir una geometría (`target_type = capa`).
- Las filas `unidad` vinculan la unidad al nivel correspondiente (`capa_nivel`) y permiten definir su tipo, precio y geometría (`target_type = unidad`).
- Si necesitas mezclar horizontales y verticales en un mismo contenedor, puedes importar primero los desarrollos hijos y luego registrar sus relaciones manualmente (el importador CSV no crea registros `mixto` directamente).

## Uso del archivo `colo.csv`

El CSV `colo.csv` contiene geometrías exportadas (columna `geometry` con GeoJSON). Puedes renombrar esa columna a `poligono`, duplicar los valores de `nombre`/`grupo` y agregar el resto de columnas mínimas descritas arriba para cargar directamente esas geometrías en el importador. También puedes reutilizar la línea de comandos:

```bash
ogr2ogr -f CSV desarrollo.csv colo.csv -oo "GEOM_POSSIBLE_NAMES=geometry" -lco RFC7946=YES
```

Eso crea un CSV con la columna `geometry` que luego puedes renombrar o procesar con herramientas como `awk`/`python` antes de subirlo.

## Buenas prácticas

1. Descarga `GET /crm/propiedades/tipos` para reservar `tipo_nombre` coherentes.\
2. Mantén el archivo CSV limpio: agrupa filas por desarrollo y ordena las capas (`nivel`) antes de las unidades (`capa_nivel`).\
3. Si el archivo contiene **varios desarrollos**, mantén el orden `desarrollo → capas → unidades` por cada desarrollo y evita mezclar grupos; si reutilizas el mismo `grupo`, recuerda que se toma como referencia el **último desarrollo** con ese `grupo`.\
4. El modal de `/settings/propiedades` refresca la jerarquía una vez concluido el import; si necesitas ajustes, edita desde el árbol o vuelve a importar el CSV.

## Columnas de volumen amigables

Para evitar tener que escribir JSON, puedes añadir columnas independientes que definan el volumen que quieres para cada capa/unidad. El importador y el backend ya guardan esos valores en columnas reales de `propiedad_poligonos` y el mapa los lee directamente desde ahí. Estas columnas son opcionales, pero si las llenas el volumen saldrá correcto en Mapbox:

| Nueva columna | Qué representa | Cómo se usa |
| --- | --- | --- |
| `height` | Altura total en metros que debe tener la extrusión del polígono. | Se guarda en `propiedad_poligonos.height`. |
| `min_height` | Altura desde la cual empieza el volumen (puede ser 0). | Se guarda en `propiedad_poligonos.min_height`. |
| `levels` | Cuántos niveles se deben dibujar (utiliza `1` para cada piso). | Se guarda en `propiedad_poligonos.levels`. |
| `color` | Color del polígono en formato hex (`#RRGGBB`). | Se guarda en `propiedad_poligonos.color`. |

Puedes mantener esos valores consistentes por piso (ej. `height=3`, `min_height=0`, `levels=1` para cada capa y unidad nueva). El importador los normaliza hacia columnas reales antes de llamar al repositorio, por lo que el usuario solo interactúa con columnas numéricas sencillas en el CSV.

### Nota importante sobre coordenadas Z (2026-01-22)
- Aunque exportes polígonos con coordenadas `[lng, lat, z]` (QGIS/ArcGIS), la vista 3D en Mapbox **no usa esa Z** para la base del volumen.
- El frontend normaliza la geometría a 2D (elimina Z) y la extrusión depende de `propiedad_poligonos.min_height` (base) y `propiedad_poligonos.height` (altura).
- Por lo tanto, si quieres que un polígono se “apile” en un piso superior, debes llenar `min_height` en el CSV (en metros) o calcularlo antes de importar.

> **Alias para el tipo de desarrollo**: cuando la fila describe un `desarrollo`, el importador busca primero `tipo_desarrollo` y, si no existe o viene vacía, sigue aceptando `tipo` y `tipo_nombre` como compatibilidad con CSVs viejos. El backend normaliza (trim + lowercase) antes de validar contra el enum `property_desarrollo_tipo`.
>
> **Alias para el tipo de unidad**: cuando la fila describe una `unidad`, el importador busca primero `tipo_unidad_nombre` y sigue aceptando `tipo_nombre`, `tipo_unidad` o `tipo_unidad_id` según corresponda.
