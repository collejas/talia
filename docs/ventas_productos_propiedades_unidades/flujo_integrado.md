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
- Las columnas `height`, `min_height`, `levels`, `metadata_color` y los campos `metadata_unidad_*` se copian ahora a la columna adicional `catalog_items.metadatos_extra`, que es la que consume Mapbox (evita el error 428C9 de la columna generada `metadata`) y también se replica en el log `logs/mapbox-debug.log` bajo la etiqueta `catalog_item_sync` para verificar qué metadata extra se está sincronizando.
- `propiedad_id` y `unidad_id` deben permanecer en `metadatos` porque garantizan que la venta se enlace con su geometría original.

## Próximos pasos
1. Crear y documentar el endpoint de ventas unificado (`/crm/ventas/propiedades`) y definir qué entidades actualiza (catalog_item, propiedad_unidad, cotización/oportunidad). 
2. Asegurar que cada venta marque la unidad como `activo = false` y `status = vendido` para que el inventario se reduzca automáticamente.
3. Extender los reportes / vistas de ventas para incluir la información geoespacial (ver `docs/Plan_3D/plan_ventas_integradas.md`) y evitar que productos vendidos vuelvan a aparecer como disponibles.

## Implementación actual
- Ya existe `POST /crm/ventas/propiedades`: recibe `catalog_item_id`, `propiedad_id`, `unidad_id`, `precio_final` (y opcionalmente `oportunidad_id`, `cuenta_id`, `contacto_id` y metadata adicional).  
- El endpoint crea una cotización aceptada (`estatus = "aceptada"`) con un solo item que apunta al `catalog_item` de la unidad y guarda los IDs espaciales dentro de `metadata`.  
- Posteriormente actualiza la unidad (`propiedad_unidades.status = "vendido"`) y el catálogo (`catalog_items.activo = false` y `metadatos.venta_registrada_en = ...`) para evitar que se vuelva a cotizar la misma geometría.
- El backend no solo lo hace desde el importador: la ruta `/crm/propiedades` ahora también dispara `_ensure_catalog_item_for_unidad`, obtiene el desarrollo que contiene a la unidad y agrega los metadatos `catalog_item_id`, `propiedad_id` y `unidad_id` cada vez que se crea una unidad manualmente. Así la vista Mapbox ya puede mostrar el botón “Registrar venta” incluso cuando la unidad se registra por la UI del panel.
- Ese mismo log se puede usar para depurar por qué el botón no aparece (registra el `catalog_item_id`, el `status` y las claves de metadata/metadata_extra de cada unidad). Lo emitimos cada vez que `_ensure_catalog_item_for_unidad` corre y permite checar que `catalog_item_id` no se pierda entre el inventario espacial y el catálogo comercial.
- El front de propiedades consulta `/api/crm/ventas/propiedades` (ruta que a su vez consume el backend) y muestra un botón en el panel 3D para registrar una venta con el precio final; el mapa se refresca inmediatamente tras cada venta gracias a un trigger de re-fetch de `/api/crm/propiedades/geojson` y a un polling que consume `/api/crm/ventas/logs`, que ahora delega en el endpoint FastAPI `/crm/ventas/logs` para dar el historial ya parseado.
- Gracias al log, el panel detecta nuevas ventas y actualiza los polígonos vendidos sin necesidad de un refresh manual; también se mantiene un pequeño historial de la última venta registrada dentro del panel Mapbox.

## Ventas asociadas a leads/comentarios nuevos
- Para evitar ventas huérfanas, `POST /crm/ventas/propiedades` ahora exige elegir una oportunidad cuyo contacto principal tenga `captura_estado = 'completo'`. El backend expone `/crm/oportunidades/ventas/lista`, que filtra primero los contactos completos y luego devuelve todas las oportunidades ligadas a esos contactos, incluyendo la descripción/código de etapa, contacto y cuenta. El frontend consume ese endpoint y presenta un `<select>` con título + contacto + descripción para que sepas qué oportunidad seleccionar cuando un contacto tiene varias opciones abiertas.
- El modal registra el `oportunidad_id`, `cuenta_id` y `contacto_id` elegidos dentro de la cotización y el ítem; además copia el `catalog_item_id`, `propiedad_id` y `unidad_id` en los metadatos del quote/item para mantener trazabilidad espaciogeográfica.
- Antes de crear el item de cotización se asegura que exista una fila en `productos` con el mismo `id` que el `catalog_item`. Si no hay (porque el catálogo de Mapbox se mantuvo separado del catálogo de ventas), el backend genera el producto en caliente usando el slug/nombre/moneda del `catalog_item` y lo reutiliza en el `cotizacion_items`. Esto evita que la FK `(organizacion_id, producto_id)` falle cuando se insertan items.
- El mismo flujo marca la unidad como `vendido`, desactiva el `catalog_item` y escribe en los logs (propiedades y `mapbox-debug`) que la compra se cerró; así el mapa y los reportes siempre reflejan el inventario real.
- Además, el backend ahora mueve automáticamente la oportunidad asociada a la etapa “Cerrado (Ganado)” una vez que la venta se registra desde Mapbox, registrando también el cambio en el historial (`oportunidad_etapas_historial`). No hace falta que el equipo haga ese paso manualmente: la etapa se actualiza en el mismo flujo que crea la cotización y el ítem.

## Acciones rápidas desde Mapbox
- La tarjeta de unidad en `frontend/panel/src/components/mapa-de-propiedades/property-map.jsx:3280-3335` ahora muestra tres botones (`Vender`, `Apartar`, `Reservar`) en la misma línea cuando el `status` es `disponible`. `Vender` abre el modal para registrar la venta, mientras que `Apartar`/`Reservar` ejecutan un `PATCH /crm/propiedad-unidades/{unidad_id}/status` con el nuevo payload `{"status": "apartado"}` o `"reservado"` (ver `backend/app/api/routes/crm.py:12513-12522`). Las acciones solo actualizan `propiedad_unidades.status`, refrescan el geojson para que el mapa cambie de color y repiten un pequeño mensaje de confirmación.
- El nuevo endpoint `/crm/propiedad-unidades/{unidad_id}/status` solo requiere el `organizacion_id` (cabecera) y el `status` válido (`apartado` o `reservado`); registra el cambio con `_write_propiedad_sale_event`/`sale_logger` y devuelve la fila actualizada, de modo que los botones no necesitan forzar una cotización ni tocar otras tablas por ahora.

# Detalles técnicos adicionales
- La tabla `etapas_pipeline` define el mapa completo: desde `prospeccion_primer_contacto` hasta `cerrado_perdido`. Los códigos relevantes para la vista de Mapbox son `general_precalificado`, `general_negociacion` y las etapas de cierre (`general_cerrado_ganado`, `general_cerrado_perdido`). El error `opportunity_stage_not_ready` ocurre cuando el backend recibe una oportunidad que todavía sigue en `general_precalificado`, así que la etapa debe adelantarse a `general_negociacion` o superior antes de validar la venta automática.
- `captura_estado` se calcula mediante el trigger `tg_contactos_captura_estado`, que llama a `_contacto_captura_estado`. El `CASE` devuelve `completo` únicamente cuando nombre completo, correo, teléfono, notas y necesidad están todos presentes y no están vacíos; de lo contrario sigue siendo `incompleto`. Eso explica por qué solo tres contactos cumplen el criterio y por qué el filtro debe limitarse estrictamente a esa condición.
- Para el modal de “Registrar venta” se debe mantener un `<select>` en lugar de un campo libre y mostrar tanto la nota de la oportunidad como el `nombre_completo`/`contacto_id`, ya que un mismo contacto puede tener múltiples oportunidades. Así se evita seleccionar el contacto equivocado aunque el nombre se repita o aparezcan “Visitante webchat”.
- Mientras el flujo de ventas de Mapbox no genere cotizaciones previas, el backend debe derivar el producto desde `catalog_items` y crear el `cotizacion_items` antes de insertar la cotización final. Si falta el producto se reproduce el error 23503/409 por la FK `(organizacion_id, producto_id)`, y el backend debe reconstruirlo usando el `catalog_item_id` antes de avanzar etapas.

## Registro de los cambios implementados durante la iteración actual
- El endpoint `POST /crm/ventas/propiedades` ahora crea la cotización, añade los ítems, genera el PDF y marca la cotización como aceptada (`estatus = "aceptada"`, `canal_envio = "mapbox"`) antes de mover la oportunidad a `general_cerrado_ganado`. El flujo reproduce automáticamente lo mismo que el botón “Marcar como aceptada” del embudo para evitar inconsistencias de estado y montos en las vistas de leads.
- Se añadieron logs detallados en `/var/www/talia/logs/propiedades-ventas.log` para cada paso del proceso (`sale_started`, `quote_created`, `product_ensured`, `quote_item_added`, `opportunity_stage_advanced`, etc.), de forma que el frontend Mapbox pueda empujar el refresco de los polígonos sin depender de un reload completo.
- El backend ahora valida en `LeadQuote` que `canal_envio` pueda tomar el valor `mapbox`, por eso no aparece el `Internal Server Error` al confirmar una venta desde el modal de Mapbox; este cambio se encuentra en `backend/app/api/routes/crm.py` alrededor de las clases `LeadQuoteMarkPayload` y `LeadQuote`.
- Se documentó en este archivo el criterio de `captura_estado = 'completo'` (trigger sobre `contactos`) y la necesidad de usar `<select>` en el modal para no sumar oportunidades duplicadas al filtro.
- La API `/crm/ventas/logs` (limit: 1-200) expone el mismo archivo `logs/propiedades-ventas.log`, de modo que `/api/crm/ventas/logs` y cualquier otro cliente pueden obtener el historial sin acceder directamente a los logs del servidor; además se agregó el evento `quote_marked_from_mapbox` para indicar cuándo el backend marcó la cotización como aceptada en nombre del frontend.
