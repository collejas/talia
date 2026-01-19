# Seguimiento Plan 3D - Panel inmobiliario

## Contexto resumido
- Tuvimos que transformar `/settings/propiedades` de una vista con tarjetas a un árbol jerárquico (desarrollos → capas → unidades → polígonos) con iconos, texto mínimo, selectores limpios y botones de acción concentrados en la jerarquía. Esto implicó ajustar los modales (horizontal, vertical, mixto) y sus formularios para evitar texto redundante, corregir errores de `key` duplicadas y garantizar que cada nodo (desarrollo/capa/unidad/polígono) oculte o muestre su geometría al expandir/colapsar.
- Revisamos y extendimos el modelo de datos para admitir desarrollos mixtos, incluyendo la nueva tabla `propiedad_desarrollos_mix` con sus campos geométricos/tipo y las migraciones correspondientes; también se armonizó la información geoespacial (GeoJSON, funciones de exportación/importación) con la estructura existente (`propiedad_desarrollos`, `propiedad_capas`, `propiedad_unidades`).
- Se identificó el flujo ideal de datos: los polígonos se almacenan en la base de datos como geometrías (GeoJSON/Multipolygon) desde el backend y se consumen por Leaflet, por lo que la ruta natural para importar geometrías externas es mediante un servicio en el backend que reciba GeoJSON/CSV y escriba en la tabla de polígonos.

## Tareas completadas (hasta ahora)
1. Ajustes visuales del árbol en la vista de propiedades, los botones y la lógica de expansión/contracción se han reimplemented con iconos y etiquetas mínimas, y se corrigió la referencia cruzada de `handleSelect*` y `availableChildDevelopments` para que compilara correctamente.
2. Documentamos la necesidad de agregar iconos pequeños (+/-/lapiz) que desplieguen prompts de polígono vs. característica en cada nivel y se reorganizó el modal de “Nuevo desarrollo” para contener los botones Horizontal/Vertical/Mixto alineados.
3. Ejecutamos y validamos las migraciones (`supabase/migrations/20280321_100000_propiedad_desarrollos_mix.sql`) para crear la tabla de desarrollos mixtos, incluyendo el manejo de enums (`property_desarrollo_tipo`) y sus ubicaciones, y confirmamos que la tabla ya está sincronizada con los triggers/RPC existentes.
4. Se evaluó la importación de polígonos desde CSV/GeoJSON (QGIS → GeoJSON → backend) y se constató que los datos geoespaciales se guardan como `geometry` en PostGIS (Multipolygon) vía funciones como `ST_GeomFromText` o `ST_GeomFromGeoJSON`.

## Próximos pasos sugeridos
1. Implementar un endpoint backend (FastAPI/Supabase RPC) que reciba GeoJSON/CSV y cree/actualice desarrollos horizontales, verticales y mixtos, incluyendo sus características y polígonos jerárquicos. El endpoint debe respetar `organizacion_id` y reutilizar los catálogos existentes (`propiedad_lineas`, `propiedad_modelos`, etc.).
2. Crear un importador asistido en el backend (y, si se requiere más adelante, en el frontend) que transforme el formato del archivo `colo.csv` en registros espaciales, reutilizando herramientas como `ogr2ogr` o librerías que lean CSV/GeoJSON y los escriban en las tablas (`propiedad_capas`, `propiedad_poligonos`). Este importador debe documentarse en la carpeta `docs/Plan_3D` para que el equipo pueda replicar el proceso.
3. Continuar refinando la UI del árbol para que los polígonos se manejen como contenedores colapsables (con iconos de expansión y etiquetas “Polígono guardado” ocultas) y los botones de polígono estén anidados dentro del nodo correspondiente, garantizando una experiencia coherente con la jerarquía y el estado actual de los nodos.

## Referencias claves
- Documentación general del plan espacial: `docs/Plan_3D/plan_3D.md` y la bitácora `docs/Plan_3D/pasos_plan_3D.md`.
- Código de la vista: `frontend/panel/src/components/settings/propiedades/propiedad-form.tsx` (árbol, modales y control de geometrías).
- Migraciones de Supabase: `supabase/migrations/20280321_100000_propiedad_desarrollos_mix.sql` y la tabla `propiedad_desarrollos` para entender los campos de ubicación/geom.
- Archivo de ejemplo de importación: `colo.csv` (polígonos en formato `MULTIPOLYGON ZM`).

## Ideas abiertas
- Definir si la importación de CSV/GeoJSON se ejecuta en el servidor (mediante `ogr2ogr` o librerías en Python) o si debe haber un wizard en la UI que envíe el archivo al backend y procese `geometry` con `ST_GeomFromGeoJSON`.
- Ajustar los triggers/RPC actuales para dar soporte completo a desarrollos mixtos y asegurar que cada nivel (desarrollo, capa, unidad) puede registrar su propia geometría con un único árbol de propiedades.

