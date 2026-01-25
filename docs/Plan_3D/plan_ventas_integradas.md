# Plan · Ventas de propiedades por catálogo

## Objetivo

- Vincular cada `propiedad_unidad` importada o creada con un `catalog_item`, de modo que la venta siga funcionando sobre el catálogo (cotizaciones/lead_cards) mientras guarda la referencia geoespacial (desarrollo/unidad).
- Registrar la venta unificada de una propiedad como una cotización que incluya el `catalog_item` (para la parte comercial) y los campos `propiedad_id`, `unidad_id`, `linea_id/familia_id/modelo_id` (para trazabilidad).

## Flujo propuesto

1. **Importación de CSV/desarrollo**  
   - El backend ya resuelve los IDs de línea/familia/modelo. Ahora el helper `_ensure_catalog_item_for_unidad` (ubicado en `backend/app/api/routes/crm.py`) crea o actualiza el `catalog_item` para cada unidad tomando nombre, slug, precio y metadata de la unidad y guardando `propiedad_id`/`unidad_id` en `catalog_item.metadatos`.  
   - El slug combina el nombre del desarrollo y la unidad (`_build_unidad_catalog_slug`) para que el ítem sea único por unidad, y la metadata enlaza geometría y catálogo sin romper la lógica actual.

2. **Ventas y cotizaciones**  
   - Habilitar un endpoint (p.ej. `POST /crm/ventas/propiedades`) que reciba `catalog_item_id`, `propiedad_id`, `unidad_id`, `precio_final`, `moneda`, `metadata.adicional` y cree la cotización/oportunidad correspondiente. El payload copia la unidad concreta al lead y guarda los IDs para que el pipeline (y funciones como `crm_contact_restart_stats`) puedan mostrar la propiedad en el tablero de ventas.  
   - La misma ruta debería actualizar `propiedad_unidades.status` a `vendido` y el catálogo a `activo`/`vendido` según el caso, manteniendo la consistencia.

3. **Consumo en frontend**  
   - El módulo de propiedades (importador o panel) debe mostrar un botón “Generar cotización” que construya el payload con `catalog_item_id`, `propiedad_id`, `unidad_id`.  
   - El panel de ventas debe sumar métricas usando la vista `crm_propiedades_geojson` y el helper `catalog_document_embeddings_search` para mostrar contexto espacial y el catálogo detrás de cada venta ganada.

4. **Monitoreo/QA**  
   - Asegurar que el log `logs/propiedades-import.log` documenta la creación del catálogo; si se detecta un catálogo duplicado, el helper actualiza el ítem existente.  
   - Probar exportando nuevamente `prueba_CSV.csv` y verificar que el campo `catalog_item_id` aparece en la tabla `catalog_items` y que `propiedad_unidades` conserva el slug/metadatos del catálogo.

Este plan documenta la integración CRM/catálogo que mencionamos en `docs/Plan_3D/plan_3D.md` y sirve como hoja de ruta para el endpoint de ventas unificado que sigue.  
