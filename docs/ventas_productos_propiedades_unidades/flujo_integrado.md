# Flujo integrado: propiedades, catalog items y ventas

## Contexto
- Cada `propiedad_unidad` representa una entidad geoespacial única (volúmen/lote). No puede replicarse ni venderse más de una vez.
- Para poder usar el motor de ventas del CRM (productos, cotizaciones, oportunidades) cada unidad se refleja como un `catalog_item` con `tipo = "producto"` y `activo = true`.
- El importador y los endpoints administrativos crean/actualizan ese `catalog_item` y guardan `propiedad_id`, `unidad_id` y `catalog_item_id` dentro de `catalog_items.metadatos` y `metadatos` (ya que la columna `metadata` es generada a partir de `metadatos`).

## Pedido confirmado, reserva patrimonial e inventario

Una unidad inmobiliaria es un bien individual y no participa en existencias,
almacenes, recepciones ni movimientos cuantitativos de inventario. Su
disponibilidad se controla con `propiedad_unidades.status`. La fila vinculada
en `catalog_items` sirve para cotizar/vender; debe tener
`maneja_inventario = false` y `activo_compra = false`. Su campo `activo`
indica si se ofrece comercialmente y debe sincronizarse con la disponibilidad.

Aceptar una cotizacion o ganar una oportunidad no reserva productos ni
propiedades. La reserva comienza cuando se confirma el pedido del cliente,
normalmente al recibir y validar su orden de compra. Para unidades inmobiliarias
eso cambia el estado a `apartado` o `reservado`; no crea un movimiento de
almacen. La unidad pasa a `vendido` al completarse el hito contractual que
defina la organizacion, no por aceptar la cotizacion.

Para productos stockables, esa misma confirmacion aumenta el stock reservado y
reduce el disponible, sin modificar el stock fisico. La entrega/embarque registra
la salida y libera la reserva. Para propiedades no hay salida de inventario:
se actualiza el estado de la unidad. Pago, factura y proforma son eventos
financieros/documentales y no cambian por si mismos disponibilidad ni stock.

La relacion del producto debe guardarse con `catalog_item_id` explicito en
`cotizacion_items` y propagarse por `pedido_venta_items` hasta `venta_items`.
Para propiedades, la relacion a `propiedad_id` y `unidad_id` debe conservarse
de forma consultable y trazable; no se debe depender exclusivamente de
metadata para relaciones centrales.

La configuracion por tenant para reservar al recibir anticipo/pago, al aceptar
cotizacion, reservar manualmente o no reservar queda como fase futura. La
politica inicial recomendada para productos B2B es confirmar el pedido con la
orden de compra del cliente. Esa orden del cliente no es una fila de
`ordenes_compra`, que corresponde a compras de la organizacion a proveedores.

**Decision de arquitectura:** la confirmacion se gestionara mediante una
entidad propia `pedidos_venta` con partidas `pedido_venta_items`. Una cotizacion
aceptada puede originar un pedido pendiente de confirmacion; al confirmar el
compromiso del cliente, el sistema formaliza de forma coordinada la venta y la
cuenta por cobrar. En productos stockables reserva las cantidades; en
propiedades actualiza la disponibilidad de la unidad a `apartado` o
`reservado`, sin movimientos de almacen. En v1 cada pedido confirmado genera
una venta y una cuenta por cobrar. Los documentos de cobro y pagos siguen
siendo pasos separados. Este flujo y sus tablas se desplegaron el 2026-09-24;
la validacion funcional autenticada sigue pendiente.

La confirmacion del cliente acepta evidencia con OC o sin OC. Si el cliente
entrega una OC, el usuario puede capturar su numero y subir el archivo al
pedido; correo, WhatsApp, cotizacion aceptada, contrato, confirmacion verbal u
otro tambien pueden respaldar el compromiso. El archivo tiene acceso por
organizacion y trazabilidad de carga; queda pendiente validar autenticadamente
el flujo.

## Responsabilidades y traspaso operativo

El vendedor registra la aceptacion y evidencia y envia el pedido a
formalizacion. Operaciones/Administracion revisa el expediente y confirma el
pedido; ahi se formalizan venta/cuenta por cobrar y se reserva la unidad
inmobiliaria en su estado patrimonial o el stock fisico para partidas
stockables. La unidad inmobiliaria no entra a la cola de almacen.

Las bandejas comunes de Operaciones y Surtidos estan desplegadas con permisos
RBAC especificos. Las migraciones `20260924185828_sales_order_handoff_permissions.sql`
y `20260924195100_sales_order_handoff_fk_indexes.sql` se aplicaron en Supabase y el release `20260924_191718` esta activo. Las
propiedades solo aparecen en la primera bandeja, nunca en Surtidos. Falta
validar con usuarios autenticados de cada area y tenant.

Almacen recibe solo productos fisicos reservados y registra surtidos parciales
o totales desde su cola. Finanzas gestiona cobranza/documentos de forma
independiente. La oportunidad muestra el avance de cada proceso y un enlace al
pedido para consulta, pero no permite al vendedor registrar entregas. Las
responsabilidades se autorizan mediante el RBAC existente configurable por
tenant; no se codifican por nombre de puesto. Las capacidades especificas de
envio, confirmacion y surtido ya estan en el catalogo RBAC y se asignan por
codigo a los roles definidos.

### Transicion desde el comportamiento anterior

El flujo anterior podia crear una cotizacion aceptada y marcar la unidad como
vendida y el `catalog_item` como inactivo. Desde el despliegue del 2026-09-24,
preparar/aceptar la cotizacion ya no vende ni aparta la unidad: confirmar el
pedido la aparta, y un hito contractual posterior debera marcarla vendida. Ese
hito aun no esta implementado.

## Importador y metadata
- El CSV puede enviar columnas con prefijos `metadata_` o `metadata_unidad_` para poblar libremente `catalog_items.metadatos`; el backend ya absorbe esos campos y solo quita los atributos volumétricos/visuales (`height`, `min_height`, `levels`, `color`) antes de guardar.
- Las columnas `height`, `min_height`, `levels`, `metadata_color` y los campos `metadata_unidad_*` se copian ahora a la columna adicional `catalog_items.metadatos_extra`, que es la que consume Mapbox (evita el error 428C9 de la columna generada `metadata`) y también se replica en el log `logs/mapbox-debug.log` bajo la etiqueta `catalog_item_sync` para verificar qué metadata extra se está sincronizando.
- El pedido conserva referencias consultables a `propiedad_id` y `unidad_id` en sus partidas. Los atributos visuales variables pueden seguir en `metadatos_extra`.

## Próximos pasos
El flujo inmobiliario se apoyara en el traspaso general Comercial → Operaciones →
Finanzas. La unidad no usa la cola de Almacen. Sus pendientes especificos son:

1. Integrar el registro de venta de propiedades con `pedidos_venta` y el envio a
   formalizacion, evitando que aceptar una cotizacion marque la unidad como
   vendida o evite la revision operativa.
2. Al confirmar Operaciones el pedido inmobiliario, apartar/reservar la unidad
   actualizando `propiedad_unidades.status`; no crear movimientos de almacen.
3. Definir el hito contractual que marca la unidad como `vendido` y desactiva
   su oferta comercial; venta y cuenta por cobrar ya se habran creado al
   confirmar el pedido.
4. Verificar que `catalog_item_id`, `propiedad_id` y `unidad_id` se conserven
   entre cotizacion, partida del pedido y venta.
5. Extender reportes/vistas con progreso comercial, financiero y patrimonial
   sin mezclar sus estados.

## Implementación actual
- Ya existe `POST /crm/ventas/propiedades`: recibe `catalog_item_id`, `propiedad_id`, `unidad_id`, `precio_final` (y opcionalmente `oportunidad_id`, `cuenta_id`, `contacto_id` y metadata adicional).  
- El endpoint crea una cotización aceptada (`estatus = "aceptada"`) con un solo item que apunta al `catalog_item` de la unidad y guarda los IDs espaciales dentro de `metadata`.  
- Comportamiento actual a migrar: posteriormente actualiza la unidad (`propiedad_unidades.status = "vendido"`) y el catálogo (`catalog_items.activo = false` y `metadatos.venta_registrada_en = ...`). El objetivo es diferir el apartado hasta confirmar el pedido y marcar vendido al completar el hito contractual.
- El backend no solo lo hace desde el importador: la ruta `/crm/propiedades` ahora también dispara `_ensure_catalog_item_for_unidad`, obtiene el desarrollo que contiene a la unidad y agrega los metadatos `catalog_item_id`, `propiedad_id` y `unidad_id` cada vez que se crea una unidad manualmente. Así la vista Mapbox ya puede mostrar el botón “Registrar venta” incluso cuando la unidad se registra por la UI del panel.
- Ese mismo log se puede usar para depurar por qué el botón no aparece (registra el `catalog_item_id`, el `status` y las claves de metadata/metadata_extra de cada unidad). Lo emitimos cada vez que `_ensure_catalog_item_for_unidad` corre y permite checar que `catalog_item_id` no se pierda entre el inventario espacial y el catálogo comercial.
- El front de propiedades consulta `/api/crm/ventas/propiedades` (ruta que a su vez consume el backend) y muestra un botón en el panel 3D para registrar una venta con el precio final; el mapa se refresca inmediatamente tras cada venta gracias a un trigger de re-fetch de `/api/crm/propiedades/geojson` y a un polling que consume `/api/crm/ventas/logs`, que ahora delega en el endpoint FastAPI `/crm/ventas/logs` para dar el historial ya parseado.
- Gracias al log, el panel detecta nuevas ventas y actualiza los polígonos vendidos sin necesidad de un refresh manual; también se mantiene un pequeño historial de la última venta registrada dentro del panel Mapbox.

## Ventas asociadas a leads/comentarios nuevos
- Para evitar ventas huérfanas, `POST /crm/ventas/propiedades` ahora exige elegir una oportunidad cuyo contacto principal tenga `captura_estado = 'completo'`. El backend expone `/crm/oportunidades/ventas/lista`, que filtra primero los contactos completos y luego devuelve todas las oportunidades ligadas a esos contactos, incluyendo la descripción/código de etapa, contacto y cuenta. El frontend consume ese endpoint y presenta un `<select>` con título + contacto + descripción para que sepas qué oportunidad seleccionar cuando un contacto tiene varias opciones abiertas.
- El modal registra el `oportunidad_id`, `cuenta_id` y `contacto_id` elegidos dentro de la cotización y el ítem; además copia el `catalog_item_id`, `propiedad_id` y `unidad_id` en los metadatos del quote/item para mantener trazabilidad espaciogeográfica.
- Antes de crear el item de cotización se asegura que exista una fila en `productos` con el mismo `id` que el `catalog_item`. Si no hay (porque el catálogo de Mapbox se mantuvo separado del catálogo de ventas), el backend genera el producto en caliente usando el slug/nombre/moneda del `catalog_item` y lo reutiliza en el `cotizacion_items`. Esto evita que la FK `(organizacion_id, producto_id)` falle cuando se insertan items.
- Comportamiento actual a migrar: el mismo flujo marca la unidad como `vendido` y desactiva el `catalog_item` al registrar la cotizacion; el objetivo es apartar al confirmar el pedido y marcar vendido en el hito contractual, manteniendo el estado CRM de oportunidad por separado.
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
