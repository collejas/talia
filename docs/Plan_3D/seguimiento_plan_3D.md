# Seguimiento Plan 3D - Panel inmobiliario

## Contexto resumido
- Tuvimos que transformar `/settings/propiedades` de una vista con tarjetas a un árbol jerárquico (desarrollos → capas → unidades → polígonos) con iconos, texto mínimo, selectores limpios y botones de acción concentrados en la jerarquía. Esto implicó ajustar los modales (horizontal, vertical, mixto) y sus formularios para evitar texto redundante, corregir errores de `key` duplicadas y garantizar que cada nodo (desarrollo/capa/unidad/polígono) oculte o muestre su geometría al expandir/colapsar.
- Revisamos y extendimos el modelo de datos para admitir desarrollos mixtos, incluyendo la nueva tabla `propiedad_desarrollos_mix` con sus campos geométricos/tipo y las migraciones correspondientes; también se armonizó la información geoespacial (GeoJSON, funciones de exportación/importación) con la estructura existente (`propiedad_desarrollos`, `propiedad_capas`, `propiedad_unidades`).
- Se identificó el flujo ideal de datos: las geometrías se almacenan en la base de datos como campos `geometry` en PostGIS (GeoJSON/Multipolygon) desde el backend y se consumen por Leaflet, por lo que la ruta natural para importar geometrías externas es mediante un servicio en el backend que reciba GeoJSON/CSV y escriba en la tabla de geometrías.

## Tareas completadas (hasta ahora)
- [x] Ajustes visuales del árbol en la vista de propiedades, los botones y la lógica de expansión/contracción se han reimplemented con iconos y etiquetas mínimas, y se corrigió la referencia cruzada de `handleSelect*` y `availableChildDevelopments` para que compilara correctamente.
- [x] Documentamos la necesidad de agregar iconos pequeños (+/-/lapiz) que desplieguen prompts de polígono vs. característica en cada nivel y se reorganizó el modal de “Nuevo desarrollo” para contener los botones Horizontal/Vertical/Mixto alineados.
- [x] Ejecutamos y validamos las migraciones (`supabase/migrations/20280321_100000_propiedad_desarrollos_mix.sql`) para crear la tabla de desarrollos mixtos, incluyendo el manejo de enums (`property_desarrollo_tipo`) y sus ubicaciones, y confirmamos que la tabla ya está sincronizada con los triggers/RPC existentes.
- [x] Se evaluó la importación de geometrías desde CSV/GeoJSON (QGIS → GeoJSON → backend) y se constató que los datos geoespaciales se guardan en campos `geometry` de PostGIS (Multipolygon) vía funciones como `ST_GeomFromText` o `ST_GeomFromGeoJSON`.
- [x] Mapbox 3D ahora se inicializa centrado en el polígono/feature seleccionado, mantiene el pitch en 60° desde el primer frame, permite ajustar pitch/bearing dentro del drawer y registra los eventos en `logs/mapbox-debug.log` para depuración.
- [x] El proxy `/api/crm/demografia/mapa` ya atrapa fallos del CRM/Supabase, responde con un payload seguro (`ok:false` + dataset/geojson vacíos) y evita los 502 que rompían la jerarquía al recargar.
- [x] Documentamos la verificación manual del flujo país → estado → municipio para que el cliente compruebe que sólo las regiones con desarrollos se pintan y que cada nivel centra automáticamente los desarrollos antes de desplegar las unidades.
- [x] La jerarquía Leaflet ahora pinta y centra únicamente los países/estados/municipios con desarrollos (`crm_propiedades_geojson` + `pais_codigo`/`estado_cve`/`municipio_cve`) antes de desplegar las unidades, garantizando que los municipios visibles se puedan clicar.
- [x] Al llegar al nivel de municipio eliminamos las capas demográficas solo después de seleccionar un municipio (para que al hacer clic en un estado el mapa siga mostrando municipios con desarrollos) y dejamos el focus en los desarrollos limpias; el mapa sigue centrado en los desarrollos al limpiar las capas antes de renderizar.
- [x] Reordenamos `property-map.jsx` para que `getStatusCategory` se defina antes de `regionStatusCounts`, eliminando el ReferenceError y asegurando que los conteos (`vendidas`, `apartadas`, `disponibles`) estén listos para la próxima capa de tooltips.
- [x] Vista Mapbox ahora respeta el drill-down jerárquico: desarrollo → solo capas; capa → solo unidades. Se forzó `fill-extrusion-height = base + height` para volúmenes cerrados, se desactivó el gradiente vertical, se añadió luz frontal y hover verde para resaltar polígonos. IDs se normalizan y se eliminan las coordenadas Z antes de enviar a Mapbox para evitar caras faltantes.
- [x] (2026-01-22) Aislamiento de unidad en Mapbox: al clicar una unidad se ocultan las demás del set visible usando `feature-state.hidden` para conservar la unidad seleccionada sin reescribir el source.
- [x] (2026-01-22) Workaround de compatibilidad: `fill-extrusion-opacity` no soporta expresiones; el ocultamiento se hace con color transparente y `height/base` a cero cuando `hidden=true`.
- [x] (2026-01-22) Transiciones smooth sin “brinco” a vista 2D: la cámara usa `cameraForBounds + easeTo` (fallback a `fitBounds` con `bearing/pitch`) para mantener `pitch/bearing` estables al pasar desarrollo→capa→unidad.

## Próximos pasos sugeridos
- [ ] Continuar refinando la UI del árbol para que los polígonos se manejen como contenedores colapsables (con iconos de expansión y etiquetas “Polígono guardado” ocultas) y los botones de polígono estén anidados dentro del nodo correspondiente, garantizando una experiencia coherente con la jerarquía y el estado actual de los nodos.
- [ ] Agregar tooltips al pasar el cursor sobre países/estados/municipios que muestren los totales calculados por `regionStatusCounts` (unidades vendidas, apartadas y disponibles) para vincular la nueva capa de información con el flujo jerárquico actual.

## Referencias claves
- Documentación general del plan espacial: `docs/Plan_3D/plan_3D.md` y la bitácora `docs/Plan_3D/pasos_plan_3D.md`.
- Código de la vista: `frontend/panel/src/components/settings/propiedades/propiedad-form.tsx` (árbol, modales y control de geometrías).
- Migraciones de Supabase: `supabase/migrations/20280321_100000_propiedad_desarrollos_mix.sql` y la tabla `propiedad_desarrollos` para entender los campos de ubicación/geom.
- Archivo de ejemplo de importación: `colo.csv` (polígonos en formato `MULTIPOLYGON ZM`).

## Ideas abiertas
- Definir si la importación de CSV/GeoJSON se ejecuta en el servidor (mediante `ogr2ogr` o librerías en Python) o si debe haber un wizard en la UI que envíe el archivo al backend y procese las geometrías con `ST_GeomFromGeoJSON`.
- Ajustar los triggers/RPC actuales para dar soporte completo a desarrollos mixtos y asegurar que cada nivel (desarrollo, capa, unidad) puede registrar su propia geometría con un único árbol de propiedades.
