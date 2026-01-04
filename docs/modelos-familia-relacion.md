# Relación modelo → familia de productos

## Contexto

Actualmente `settings/productos/modelos` administra modelos que sólo poseen `nombre`, `descripción`, estado y metadatos. A diferencia de las familias (que exigen `linea_id`), los modelos no guardan ningún vínculo con familia o línea, por lo que el panel no puede filtrar o mostrar la jerarquía completa que ya existe a nivel de `catalog_items`.

Vincular cada modelo con una familia aporta trazabilidad porque:

- La relación línea→familia ya está normalizada en la tabla `familias_productos`.
- Asociar el modelo a una familia permite inferir su línea (vía la FK de `familias_productos`).
- Los productos eventualmente pueden enlazarse a un modelo y, gracias al nuevo vínculo, la lógica del catálogo y las referencias van a tener toda la jerarquía completa: línea → familia → modelo → producto.

## Objetivo

Permitir que al crear o editar un modelo se seleccione una familia existente (y por extensión su línea). Este campo puede ser opcional al principio, pero debe almacenarse en `modelos_productos` para mantener la coherencia de la jerarquía y permitir filtros más ricos en el panel y otras partes del sistema.

## Pasos propuestos

1. **Esquema**: Extender `modelos_productos` añadiendo una columna `familia_id` (`uuid`, nullable) con FK hacia `familias_productos`. Esto permite relacionar modelos existentes sin romper datos históricos.
2. **Backend**:
   - Actualizar los modelos y DTOs (`CRMModeloProducto`, `CRMModeloProductoCreate/Update`) para incluir `familia_id`.
   - Asegurarse de que los endpoints `/crm/productos/modelos` pasen ese atributo y que en el repositorio se incluya en los payloads.
   - Añadir validaciones opcionales si se quiere forzar la relación (por ejemplo, verificar que la familia esté activa o que pertenezca a la misma organización).
3. **Frontend**:
   - Extender `ModeloProducto` con `familiaId` (y probablemente `familiaNombre` para mostrarlo).
   - En `ModelosView`, cargar familias (`fetchFamiliasDeProductos`) y agregar selects al formulario de creación/edición que permitan elegir familia.
   - Incluir `familiaId` en las llamadas `createModeloProducto`/`updateModeloProducto`.
4. **Migración de datos (opcional)**: Si existen modelos ya creados, documentar cómo asignarlos a familias (puedes usar un script o hacerlo manualmente desde el panel una vez que el campo esté disponible).

## Beneficios

- El catálogo podrá mostrar la jerarquía completa sin depender sólo de los ítems.
- Facilita la trazabilidad cuando se construyen cotizaciones, se buscan modelos por línea/familia o se enlazan recursos multimedia.
- Mantiene la flexibilidad de modelos reutilizables porque `familia_id` puede seguir siendo opcional hasta que se decida hacer obligatorio.
