# Pais
Se mostrara dibujado para que al pasar el curson por el se muestra informcion general de todos los desarrollos que estan dentro del pais.
Al dar clic al pais se mostraran los estados dibujados donde hay desarrollos.

## Estado
Se mostraran los estados dibujados que tengan informacion y al pasar el curson por ellos se muestra informcion general de todos los desarrollos que estan dentro del estado or el cual pasa el cursor.
Al dar clic al estado se mostraran los municipios dibujados donde hay desarrollos.

### Municipio
Se mostraran los municipios dibujados que tengan informacion, y al pasar el cursor por ellos se muestra informcion general de todos los desarrollos que estan dentro del municipio.
Al dar clic al municipio se mostraran los desarrollos dibujados donde hay desarrollos.

#### Desarrollos
Se mostraran los desarrollos dibujados que tengan informacion.

Estos desarrollos pueden ser:

* Horizontal			
    - Desarrollos de Vivienda y comercio Horizontal (sera el marcador)			
      - 1. Plano del poligono de lotificación general	(y que a su vez que contiene los dos que estan abajo)	
        - 2. Plano del poligono de manzanas de la lotificacion general	(y que a su vez contiene el que esta abajo)
          - 3. Plano del poligono del lote o casa dentro de una manzana

          
          
* Vertical			
    - Desarrollos de Vivienda y comercio vertical  (sera el marcador)			
      - 1. Plano de planta del poligono general (y que a su vez que contiene los dos que estan abajo)	
        - 2. Plano de planta de Niveles (que es una copia del plano del poligono general pero ubicada a diferente altura respecto al suelo), (y que a su vez contiene el que esta abajo)
          - 3. Planoo de planta del poligono de cada departamento (ubicada dentro del plano del poligono general de niveles)



plano 1 tabla: propiedad_desarrollos
plano 2 tabla: propiedad_capas
plano 3 tabla: propiedad_unidades


─ Worked for 1m 13s ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Estado actual de las tablas

  - propiedad_desarrollos contiene los metadatos del plano maestro (nombre, tipo vertical/horizontal, ubicaciones geográficas, estado y
    un geom MultiPolygonZ). Lo define la migración supabase/migrations/20280208_100000_propiedad_desarrollos.sql:15-57.
  - propiedad_capas (antes propiedad_niveles) es la capa intermedia con nivel, altura, geom, metadata y enlace al desarrollo
    (desarrollo_id); sus columnas están en supabase/migrations/20280201_120000_propiedades_3d.sql:103-150 y en la consulta del catálogo
    (information_schema.columns para propiedad_capas).
  - propiedad_unidades (antes propiedad_departamentos) almacena cada unidad física con unidad, status, precio, area_m2, geom y
    metadatos, pero no contiene campos como tipo_id, linea_id, familia_id, modelo_id ni nombre que sí tiene propiedades (ver
    information_schema.columns para ambas tablas y la definición en supabase/migrations/20280201_120000_propiedades_3d.sql:51-212).
  - propiedades funciona como la ficha comercial final: tiene tipo_id, nombre, descripción, status, precio, niveles, alturas, linea_id/
    familia_id/modelo_id, referencias (desarrollo_id, capa_id, unidad_id) y todavía un campo geom heredado.

  Dependencias que impiden eliminar propiedades hoy

  - El backend expone /crm/propiedades y /crm/propiedades/geojson (ver backend/app/api/routes/crm.py:10613-10690) y, internamente, esos
    endpoints llaman a crm_propiedades_geojson definido en supabase/migrations/20280201_120000_propiedades_3d.sql:220-264, el cual
    junta public.propiedades y propiedad_tipos para entregar el geojson que usa la vista del mapa (frontend/panel/src/components/mapa-
    de-propiedades/property-map.jsx:516-546).
  - También existe POST /crm/propiedades en backend/app/api/routes/crm.py:10640-10690 y su repositorio (backend/app/repositories/
    crm.py:226-247), así que cualquier forma futura de guardar inventario comercial todavía pisa public.propiedades.
  - El árbol jerárquico sólo lee propiedad_desarrollos/capas/unidades (ver frontend/panel/src/components/settings/propiedades/
    propiedad-form.tsx:134-145 y el RPC supabase/migrations/20280209_100000_propiedad_hierarquia_rpc.sql:1-62), pero el mapa y la API
    pública aún dependen de propiedades.

  Qué hay que hacer para eliminar propiedades sin romper apps

  1. Extender propiedad_unidades para que almacene los campos que hoy viven en propiedades (tipo_id, nombre, descripcion, status,
     precio, area_m2, linea_id, familia_id, modelo_id, metadata, referencias a desarrollo/capa, etc.) y mantener su geom (y status/
     precio) como el verdadero inventario.
  2. Actualizar el RPC crm_propiedades_geojson (y cualquier otra consulta que lea public.propiedades.geom) para que tome los datos
     directamente de propiedad_unidades (únicamente se necesita unir con propiedad_tipos para obtener nombre/color del tipo). Luego
     cambiar el backend (get_propiedades_geojson) y el proxy /api/crm/propiedades/geojson para apuntar al nuevo RPC.
  3. Cambiar el backend y los proxies de creación/consulta para que escriban/leen en propiedad_unidades en lugar de propiedades. Eso
     implica agregar funciones al repositorio (similares a create_propiedad_desarrollo) y actualizar el frontend cuando sea necesario.
  4. Una vez que todos los consumidores apunten a propiedad_unidades, se puede eliminar la tabla propiedades (o al menos dejarla vacía)
     y retirar su geom. Antes de borrar, hay que revisar migraciones, triggers/policies y cualquier consulta SQL que aún la mencione.
  5. Revisar dependencias externas (reportes, slack, etc.) que puedan acceder directamente a public.propiedades; si existen, deben
     reapuntarse a propiedad_unidades.

  ¿Quieres que empiece diseñando la extensión de propiedad_unidades y la nueva versión del RPC para que podamos empezar a migrar el
  mapa/inventario?

