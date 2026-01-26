---
title: Ventas inmobiliarias ligadas a leads y clientes
created: true
author: sistema
---

# Venta de propiedades conectada a leads/clientes

## Idea
Cada unidad vendida debe cerrar ciclo comercial en el CRM: se genera una cotización aceptada con el `catalog_item` correspondiente y esa cotización se asocia directamente al lead/u cliente que ya trae contacto. De esta forma mantenemos trazabilidad (propiedad, unidad, catalog_item) y evitamos crear ventas huérfanas que no se puedan seguir en la pipeline.

El endpoint actual `POST /crm/ventas/propiedades` ya crea la cotización, añade el item y actualiza el inventario espacial/catalog_items. Ahora documentamos los pasos necesarios para que dicho endpoint reciba la referencia comercial adecuada (lead, oportunidad, cuenta, contacto) y registre la venta correctamente.

## Pasos recomendados

1. **Identificar el lead/oportunidad**  
   - La vista de propiedades (Mapbox o árbol) debe permitir seleccionar un lead existente que representa al prospecto interesado. El lead trae un `contacto_id`, `cuenta_id` y puede estar en alguna oportunidad activa (`oportunidad_id`).  
   - Si el lead ya ganó antes, ese prospecto puede haber evolucionado a cliente; en ese caso se mantiene el `contacto_id` original y se puede usar la oportunidad asociada como referencia de seguimiento.

2. **Construir payload completo para `POST /crm/ventas/propiedades`**  
   - El payload mínimo incluye `catalog_item_id`, `propiedad_id`, `unidad_id`, `precio_final`, y `moneda`.  
   - Para asociar la venta con un lead/cliente, también se deben enviar `oportunidad_id`, `cuenta_id` y `contacto_id`.  
   - Estos campos se copian tanto en `quote.metadata` como en `item.metadata`, lo que permite rastrear la venta en reportes y atribuirla a la entidad comercial correcta.

3. **Validar que el lead está en la etapa correcta**  
   - Antes de registrar la venta, el sistema debería verificar que la oportunidad/lead esté en etapa compatible con una venta (p. ej. etapa “negociación” o “oferta”). Si no, se puede mostrar un aviso para que el asesor confirme el avance del lead.  
   - Si se necesita se puede disparar un cambio automático de etapa después de generar la venta para reflejar que el lead pasó a “cliente”.

4. **Cerrar el inventario local**  
   - El endpoint actual ya marca la unidad como `vendido` y desactiva el `catalog_item`; asegurémonos de que esos updates se ejecutan después de crear la cotización y antes de confirmar el éxito al frontend, para evitar dobles ventas.  
   - El log sigue registrando la operación en `/var/www/talia/logs/propiedades-ventas.log` y `mapbox-debug.log`, lo que permite vincular la venta comercial con la operación espacial informada en Mapbox.

5. **Actualizar los reportes/paneles**  
   - La vista Mapbox debe refrescarse (ya lo hace con el polling de `logs/propiedades-ventas.log`). Si además se requiere, el panel comercial puede consultar `/crm/ventas/propiedades` o `/crm/ventas/logs` para mostrar un resumen del lead/cliente vinculado.  
   - Documentar en la guía del equipo comercial cómo buscar la venta registrada y relacionarla con el cliente en el módulo de leads/prospectos.

6. **Flujo inverso: cliente existente → venta inmobiliaria**  
   - Si el contacto ya es cliente (ya compró antes), reutilizar `contacto_id` y `cuenta_id` al construir el payload.  
   - Registrar la venta como una nueva cotización aceptada y, si se quiere, conservar un campo extra en `quote.metadata` como `cliente_previos` para rastrear repetición de ventas.

## Referencias técnicas

- `_ensure_catalog_item_for_unidad` (backend/app/api/routes/crm.py): crea/actualiza el `catalog_item` y deja los metadatos `propiedad_id`/`unidad_id`/`catalog_item_id` que el endpoint usa en la venta.  
- `_save_propiedad_sale_log` (misma ruta) y `/var/www/talia/logs/propiedades-ventas.log`: permiten cotejar qué unidad se vendió y contra qué catalog item.  
- `sendFeaturesToMapbox` (frontend/panel/.../property-map.jsx): asegura que Mapbox reciba `catalog_item_id` para habilitar el botón “Registrar venta”.  
- El log `mapbox-feature-selected` documenta qué feature se mostró y si tenía `catalog_item_id`, útil para depurar casos donde el botón no aparece.  

## Próximos pasos

1. Asegurar que la UI de ventas/panel permite seleccionar un lead u oportunidad antes de disparar la venta desde el mapa.  
2. Extender el handler del frontend para que visualice el lead/cliente vinculado (tal vez con un dropdown o selección rápida).  
3. Validar que cada venta crea un lead/cuenta si aún no existe (opcional), o bien mostrar error si falta la asociación.  
4. Documentar en la guía del equipo comercial cómo localizar las ventas en `propiedades-ventas.log` y cruzarlas con leads/clientes en CRM.
