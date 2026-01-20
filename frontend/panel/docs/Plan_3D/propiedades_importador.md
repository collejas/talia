# Importador de propiedades 3D

Este documento describe el formato que espera el endpoint `/crm/propiedades/importar/csv` y cómo preparar el archivo que alimenta la jerarquía de desarrollos, capas, unidades y polígonos desde la UI (`settings/propiedades`). Los datos van a parar a las tablas `propiedad_desarrollos`, `propiedad_capas`, `propiedad_unidades`, `propiedad_poligonos` y la nueva sección de desarrollos mixtos (`propiedad_desarrollos_mix*`).

## Estructura obligatoria del CSV

El importador lee cada fila y decide qué entidad crear según la combinación de columnas. Estas columnas deben existir y tener valores coherentes:

| Columna | Descripción | Obligatoria para |
| --- | --- | --- |
| `entidad` | Nomenclatura que indica si la fila representa un `desarrollo`, una `capa`, una `unidad` o un registro `mix` de un desarrollo mixto. | Todas las filas. |
| `grupo` | Identificador libre (slug, clave, nombre corto) que agrupa filas pertenecientes a la misma jerarquía. Por ejemplo, todos los registros asociados al mismo desarrollo horizontal/capa deben compartir este valor. | Todas las filas. |
| `nombre` | Etiqueta visible que se guardará en `propiedad_desarrollos.nombre`, `propiedad_capas.nombre` o `propiedad_unidades.unidad`. | Todas las filas. |
| `nivel` | Número entero que indica el nivel o piso para una capa (`propiedad_capas.nivel`). Dejar vacío para desarrollos y unidades. | Solo para `entidad=capa` o para filas de `mix` que representan capa dentro del mixto. |
| `unidad` | Nombre de la unidad (ej. `A101`, `Depto 2B`). Solo en filas con `entidad=unidad`. | Solo para unidades. |
| `tipo_nombre` | Define el tipo interno que el backend usará para `propiedad_desarrollos.tipo` (horizontal, vertical, mixto) o `propiedad_desarrollos_mix_items.modo` (horizontal/vertical). **No almacena geometría.** | Todas las filas que crean desarrollos o mix items. |
| `poligono` | Geometría en texto WKT (recomendado `MULTIPOLYGON ZM` o `POLYGON` con SRID 4326). Se usa para poblar `propiedad_poligonos.geom`. | Recomendado para todas las filas que generan una forma visible (desarrollos, capas, unidades, mix). |
| `metadata` | JSON opcional para pasar pares clave/valor adicionales (ej. `{"altura":35}`). | Opcional, ayuda a alimentar campos extra en las tablas destino. |
| `codigo_postal`, `estado_cve`, `municipio_cve`, `colonia` | Valores que terminan en la tabla `propiedad_desarrollos`. | Opcionales, pero útiles para filtros posteriores. |

> El backend valida que `tipo_nombre` sea uno de los literales que entiende (`horizontal`, `vertical`, `mixto`, `capa`), por lo que poner el WKT dentro de ese campo provocará un error 500. Usa `poligono` para las geometrías y `tipo_nombre` para indicar el modo/tipo del desarrollo o mix item.

## Ejemplo mínimo

```csv
entidad,grupo,nombre,tipo_nombre,nivel,unidad,poligono
desarrollo,clo10,Colonia Skyline,horizontal,,,,MULTIPOLYGON ZM (((-109.73834 23.00223 0 0,...)))
capa,clo10,Planta Baja,,1,,,MULTIPOLYGON ZM (((-109.73834 23.00223 0 0,...)))
unidad,clo10,Depto 101,,1,A101,MULTIPOLYGON ZM (((-109.73834 23.00223 0 0,...)))
```

Para un desarrollo mixto se puede insertar una fila con `entidad=desarrollo` y `tipo_nombre=mixto`, seguida de filas `entidad=mix` que describen cada componente horizontal/vertical (con su correspondiente `tipo_nombre` indicando `horizontal` o `vertical`).

## Geometrías: formato y herramientas

1. **Formato**: debe ser WKT (ej. `MULTIPOLYGON ZM (...)`). El sistema asume EPSG:4326 y no transforma coordenadas; si el archivo solo trae `POLYGON` o coordenadas XY, el backend las convierte automáticamente a `MULTIPOLYGON Z (...)` y rellena la dimensión Z con ceros antes de guardar.
   - Si por accidente subes `POLYGON(...)`, el backend lo convertirá automáticamente a `MULTIPOLYGON`.
2. **QGIS**: 
   - Agrega la capa con los polígonos.
   - Haz clic derecho → *Exportar* → *Guardar entidades como* → formato `Comma Separated Value [CSV]`.
   - En *Opciones* establece `GEOMETRY=AS_WKT`, `CRS=EPSG:4326` y marca `Layer Options` para incluir encabezados.
   - Abre el CSV exportado y copia las geometrías en la columna `poligono`.
3. **ogr2ogr** (si prefieres CLI): 
   ```bash
   ogr2ogr -f CSV output.csv input.shp -lco GEOMETRY=AS_WKT -t_srs EPSG:4326
   ```
   El binario `ogr2ogr` forma parte de GDAL (`gdal-bin`). Puedes comprobar si existe con `which ogr2ogr` y, si no está, instalarlo (`sudo apt install gdal-bin` o usar tu estación de trabajo local). No está garantizado que el servidor ya lo tenga.

## Cómo evitar errores 500

- Verifica en la consola del navegador la respuesta JSON del POST a `/api/crm/propiedades/importar/csv`: suele devolver un `error` con la validación que falló. Si no, mira los logs del CRM (requiere acceso al backend).
- Asegúrate de que cada fila tenga `entidad` + `grupo` + `nombre`. Sin `entidad` el importador no sabe qué tabla crear.
- Mantén `tipo_nombre` en los literales esperados (`horizontal`, `vertical`, `mixto`, `capa`, `unidad`). Si necesitas más granularidad para capas/mesas puedes rellenar `metadata`.
- Si una fila describe un polígono, completa `poligono` con WKT válido. El backend fallará si el texto no empieza por `POLYGON`/`MULTIPOLYGON` o si no cierra el paréntesis.
- Divide el CSV en bloques por desarrollo/mixto (reagrupa por `grupo`). Cada bloque puede tener múltiples capas y unidades y al final se crea la jerarquía completa.

## Flujo sugerido antes de importar

1. Diseña el árbol en QGIS (una capa por tipo de entidad).
2. Exporta cada capa con geometría como WKT o usa `ogr2ogr`.
3. Une los CSV con un script (Python/Excel) y agrega los campos `entidad`, `grupo`, `tipo_nombre` manualmente.
4. Abre el modal de `Importar propiedades`, carga el archivo y confirma que el botón ya no muestre el mensaje `Selecciona un archivo...`.
5. Si aparece un 500, copia la respuesta error y revisa si menciona `tipo_nombre`/`poligono`. Corrige el CSV e intenta de nuevo.

Con este procedimiento podrás cargar desarrollos horizontales, verticales o mixtos con su jerarquía completa directamente desde la UI. Documenta cada CSV para replicar la importación en otras organizaciones.
