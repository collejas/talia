# Flujo integrado: propiedades, catalog items y ventas

## Contexto
- Cada `propiedad_unidad` representa una entidad geoespacial única (volúmen/lote). No puede replicarse ni venderse más de una vez.
- Para poder usar el motor de ventas del CRM (productos, cotizaciones, oportunidades) cada unidad se refleja como un `catalog_item` con `tipo = "producto"` y `activo = true`.
- El importador y los endpoints administrativos crean/actualizan ese `catalog_item` y guardan `propiedad_id`, `unidad_id` y `catalog_item_id` dentro de `catalog_items.metadatos` y `metadatos` (ya que la columna `metadata` es generada a partir de `metadatos`).

## Inventario y trazabilidad
1. El católogo almacena la unidad como un producto individual; no hay stock numérico, solo `activo = true/false`.
2. Cuando se realiza una venta (cotización ganada), el backend debe:
   - Utilizar el `catalog_item_id` vinculado para montar la cotización/oportunidad. Se puede usar un endpoint dedicado como `POST /crm/ventas/propiedades` que reciba `catalog_item_id`, `propiedad_id`, `unidad_id`, `precio_final`, `moneda`, metadata adicional, etc.
   - Dentro del mismo flujo (o mediante triggers), marcar `catalog_items.activo = false` para evitar nuevas cotizaciones sobre ese ítem.
   - Actualizar `propiedad_unidades.status` a `vendido`/`apartado` para que la jerarquía espacial refleje el cambio y el mapa se pinte en el color correcto.

## Importador y metadata
- El CSV puede enviar columnas con prefijos `metadata_` o `metadata_unidad_` para poblar libremente `catalog_items.metadatos`; el backend ya absorbe esos campos y solo quita los atributos volumétricos/visuales (`height`, `min_height`, `levels`, `color`) antes de guardar.
- `propiedad_id` y `unidad_id` deben permanecer en `metadatos` porque garantizan que la venta se enlace con su geometría original.

## Próximos pasos
1. Crear y documentar el endpoint de ventas unificado (`/crm/ventas/propiedades`) y definir qué entidades actualiza (catalog_item, propiedad_unidad, cotización/oportunidad). 
2. Asegurar que cada venta marque la unidad como `activo = false` y `status = vendido` para que el inventario se reduzca automáticamente.
3. Extender los reportes / vistas de ventas para incluir la información geoespacial (ver `docs/Plan_3D/plan_ventas_integradas.md`) y evitar que productos vendidos vuelvan a aparecer como disponibles.

## Implementación actual
- Ya existe `POST /crm/ventas/propiedades`: recibe `catalog_item_id`, `propiedad_id`, `unidad_id`, `precio_final` (y opcionalmente `oportunidad_id`, `cuenta_id`, `contacto_id` y metadata adicional).  
- El endpoint crea una cotización aceptada (`estatus = "aceptada"`) con un solo item que apunta al `catalog_item` de la unidad y guarda los IDs espaciales dentro de `metadata`.  
- Posteriormente actualiza la unidad (`propiedad_unidades.status = "vendido"`) y el catálogo (`catalog_items.activo = false` y `metadatos.venta_registrada_en = ...`) para evitar que se vuelva a cotizar la misma geometría.
