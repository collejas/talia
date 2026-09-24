# Plan de desarrollo: compras, inventarios y proveedores

## Objetivo

Construir un modulo simple pero muy util para:

- gestionar productos con inventario real,
- controlar almacenes,
- registrar movimientos de stock,
- administrar proveedores,
- generar ordenes de compra,
- registrar recepciones,
- descontar o reservar inventario al vender.

## Siguiente fase documental

- `2026-05-27_pedimentos_importacion.md`
- Define la capa de pedimentos de importacion encima de las ordenes de compra internacionales.
- Incluye la regla de prorrateo global de gastos del pedimento y gastos asociados a las ordenes ligadas.
- Incluye tambien el catalogo y la vista de `agentes_aduanales`.

## Principios de diseno

- Usar columnas reales para los datos operativos mas importantes.
- Evitar depender de `metadata` para consultas frecuentes.
- Mantener una tabla de estado actual y otra de historial.
- Reutilizar el catalogo existente como fuente de verdad comercial.
- Diseñar la primera version para que sea facil de consultar desde la app y desde SQL.

## Fuente de verdad

La base del modulo sera `catalog_items`.

Motivo:

- la app ya trabaja con `catalog_items`,
- `productos` existe como tabla legado,
- el inventario y las compras deben colgar del mismo identificador de producto para no duplicar informacion.

## Regla de separacion con propiedades

El modulo de compras e inventario solo aplica a articulos stockables. Las propiedades inmobiliarias viven en su propio dominio y no deben entrar al flujo de almacenes, recepciones, compras ni ajustes de stock.

Reglas practicas:

- si el item maneja inventario, puede entrar a compras e inventario;
- si el item es una propiedad o unidad inmobiliaria, debe quedar fuera del flujo de compras, almacenes y existencias cuantitativas;
- una unidad puede tener una representacion en `catalog_items` para cotizarla y venderla, pero esa fila es un articulo de catalogo comercial, no inventario operativo;
- los `catalog_items` ligados a propiedades deben tener `maneja_inventario = false` y `activo_compra = false`; `activo` representa si se ofrece comercialmente y debe seguir la disponibilidad de la unidad;
- la disponibilidad patrimonial se controla en `propiedad_unidades.status`, no mediante `inventario_existencias` ni movimientos de almacen.

## Politica acordada para reservas de venta

La aceptacion de una cotizacion y el cambio de una oportunidad a ganada no
reservan existencias. La reserva nace cuando se confirma un pedido del cliente,
normalmente respaldado por su orden de compra recibida y validada. Para el
alcance inicial, esa confirmacion es la politica predeterminada B2B. La
configuracion por tenant para reservar al recibir anticipo/pago, al aceptar la
cotizacion, reservar manualmente o no reservar queda como evolucion posterior.

El pedido puede formalizar la venta y su cuenta por cobrar, pero la reserva y
la cobranza conservan estados propios. Un pago, una factura o una proforma no
descuentan por si mismos las existencias fisicas. Los servicios y productos
con `maneja_inventario = false` no generan reservas ni movimientos de almacen.

| Evento | Stock fisico | Stock reservado | Stock disponible |
| --- | --- | --- | --- |
| Cotizacion creada/enviada/aceptada | Sin cambio | Sin cambio | Sin cambio |
| Pedido del cliente confirmado | Sin cambio | Aumenta | Disminuye |
| Pedido cancelado antes de surtir | Sin cambio | Se libera | Aumenta |
| Entrega/embarque | Disminuye | Se libera la cantidad surtida | Se mantiene respecto a la cantidad surtida |

`stock_disponible = stock_actual - stock_reservado`. Por ejemplo, con 100 en
existencia y 30 reservadas quedan 70 disponibles; al entregar esas 30, la
existencia pasa a 70 y la reserva a cero, por lo que siguen disponibles 70.

La identidad comercial del producto debe mantenerse desde el renglon de
cotizacion hasta el de venta mediante `catalog_item_id` explicito y tenant-safe.
No se usara `metadata` para este vinculo. La reserva debe referenciar el pedido
y sus renglones; la salida debe referenciar la venta y el renglon surtido.

**Decision de arquitectura:** el pedido del cliente sera una entidad propia:
`pedidos_venta` y `pedido_venta_items`. Una cotizacion aceptada puede crear un
pedido `pendiente_confirmacion`; la confirmacion explicita del compromiso del
cliente (por ejemplo, recibir y validar su orden de compra) formaliza la venta
y la cuenta por cobrar y reserva stock dentro de una operacion coordinada. En
v1 cada pedido confirmado genera una venta y una cuenta por cobrar. La venta
referencia de forma unica al pedido. La orden de compra del cliente no se
confunde con `ordenes_compra`, que registra compras de la organizacion a sus
proveedores.

Los estados iniciales del pedido son `borrador`, `pendiente_confirmacion`,
`confirmado` y `cancelado`. No se mezclaran estados comerciales/logisticos con
`ventas.estatus`, el estado de cobranza ni metadata. Solo un pedido no
confirmado o no surtido puede cancelarse y liberar su reserva; los cambios a
partidas confirmadas requieren una operacion controlada. Las partidas del
pedido mantendran referencias explicitas a cotizacion, `catalog_item_id` y,
cuando aplique, propiedad y unidad. Esta decision no significa que las tablas
o el flujo ya esten implementados.
Antes de implementar expiracion de reservas o surtidos parciales se definira si
requieren una entidad `reservas_inventario` explicita; sus vencimientos y
estados no deben esconderse en JSON.

## Tablas propuestas

### 1. `catalog_items`

Uso:

- catalogo principal de productos y servicios.

Campos a agregar:

- `codigo` text
- `maneja_inventario` boolean not null default false
- `unidad_inventario` text not null default 'unidad'
- `stock_minimo` numeric(14,3) null
- `stock_objetivo` numeric(14,3) null
- `costo_ultimo` numeric(14,4) null
- `costo_promedio` numeric(14,4) null
- `requiere_lote` boolean not null default false
- `requiere_serie` boolean not null default false
- `proveedor_principal_id` uuid null
- `activo_compra` boolean not null default true

Notas:

- `codigo` debe ser unico por organizacion.
- `metadata` debe quedar solo para excepciones.

### 2. `almacenes`

Uso:

- almacenes fisicos o logicos.

Campos:

- `id` uuid
- `organizacion_id` uuid
- `codigo` text
- `nombre` text
- `tipo` text
- `activo` boolean
- `es_principal` boolean
- `direccion_id` uuid null
- `responsable_usuario_id` uuid null
- `telefono` text null
- `email` text null
- `creado_en` timestamptz
- `actualizado_en` timestamptz

Restriccion:

- unique `(organizacion_id, codigo)`

### 3. `inventario_existencias`

Uso:

- estado actual del stock por producto y almacen.

Campos:

- `id` uuid
- `organizacion_id` uuid
- `catalog_item_id` uuid
- `almacen_id` uuid
- `stock_actual` numeric(14,3) not null default 0
- `stock_reservado` numeric(14,3) not null default 0
- `stock_disponible` numeric(14,3) generated stored
- `stock_minimo` numeric(14,3) null
- `stock_objetivo` numeric(14,3) null
- `costo_ultimo` numeric(14,4) null
- `costo_promedio` numeric(14,4) null
- `actualizado_en` timestamptz

Restriccion:

- unique `(organizacion_id, catalog_item_id, almacen_id)`

### 4. `inventario_movimientos`

Uso:

- historial auditabile e inmutable de entradas, salidas, reservas y ajustes.

Campos:

- `id` uuid
- `organizacion_id` uuid
- `catalog_item_id` uuid
- `almacen_id` uuid
- `tipo` text
- `cantidad_entrada` numeric(14,3) not null default 0
- `cantidad_salida` numeric(14,3) not null default 0
- `costo_unitario` numeric(14,4) null
- `costo_total` numeric(14,4) null
- `referencia_tipo` text null
- `referencia_id` uuid null
- `motivo` text null
- `creado_por` uuid null
- `creado_en` timestamptz
- `numero_documento` text null
- `folio_documento` text null

Tipos sugeridos:

- `entrada_compra`
- `salida_venta`
- `ajuste_positivo`
- `ajuste_negativo`
- `transferencia_salida`
- `transferencia_entrada`
- `reserva`
- `liberacion_reserva`
- `devolucion_compra`
- `devolucion_venta`

### 5. `proveedores`

Uso:

- perfil de compras asociado a `cuentas`.

Campos:

- `id` uuid
- `organizacion_id` uuid
- `cuenta_id` uuid null
- `codigo_proveedor` text
- `razon_social` text
- `rfc` text null
- `nombre_comercial` text null
- `correo` text null
- `telefono` text null
- `contacto_principal_persona_id` uuid null
- `plazo_pago_dias` integer null
- `plazo_entrega_dias` integer null
- `limite_credito` numeric(14,2) null
- `moneda_preferida` char(3) not null default 'MXN'
- `activo` boolean not null default true
- `creado_en` timestamptz
- `actualizado_en` timestamptz

Restriccion:

- unique `(organizacion_id, codigo_proveedor)`

### 6. `proveedor_items`

Uso:

- relacion entre proveedor y producto.

Campos:

- `id` uuid
- `organizacion_id` uuid
- `proveedor_id` uuid
- `catalog_item_id` uuid
- `sku_proveedor` text null
- `nombre_proveedor` text null
- `costo_ultimo` numeric(14,4) null
- `costo_referencial` numeric(14,4) null
- `moneda` char(3) not null default 'MXN'
- `compra_minima` numeric(14,3) null
- `lead_time_dias` integer null
- `es_principal` boolean not null default false
- `vigente_desde` date null
- `vigente_hasta` date null
- `activo` boolean not null default true

Restriccion:

- unique `(organizacion_id, proveedor_id, catalog_item_id)`

### 7. `ordenes_compra`

Uso:

- encabezado de la orden de compra.

Campos:

- `id` uuid
- `organizacion_id` uuid
- `folio` text
- `proveedor_id` uuid
- `almacen_destino_id` uuid
- `estado` text
- `fecha_emision` date o timestamptz
- `fecha_entrega_estimada` date null
- `moneda` char(3) not null default 'MXN'
- `subtotal` numeric(14,4) not null default 0
- `descuento_total` numeric(14,4) not null default 0
- `impuestos_total` numeric(14,4) not null default 0
- `total` numeric(14,4) not null default 0
- `solicitado_por_usuario_id` uuid null
- `aprobado_por_usuario_id` uuid null
- `creado_en` timestamptz
- `actualizado_en` timestamptz

Estados sugeridos:

- `borrador`
- `enviada`
- `aprobada`
- `parcial`
- `recibida`
- `cerrada`
- `cancelada`

Restriccion:

- unique `(organizacion_id, folio)`

### 8. `ordenes_compra_items`

Uso:

- detalle de los productos comprados.

Campos:

- `id` uuid
- `organizacion_id` uuid
- `orden_compra_id` uuid
- `catalog_item_id` uuid
- `cantidad_solicitada` numeric(14,3) not null
- `cantidad_recibida` numeric(14,3) not null default 0
- `costo_unitario` numeric(14,4) not null
- `descuento_porcentaje` numeric(5,2) null
- `subtotal` numeric(14,4) not null
- `impuestos` numeric(14,4) not null default 0
- `total` numeric(14,4) not null
- `unidad` text not null default 'unidad'

### 9. `recepciones_compra`

Uso:

- cabecera de la recepcion fisica de mercancia.

Campos:

- `id` uuid
- `organizacion_id` uuid
- `orden_compra_id` uuid
- `almacen_id` uuid
- `numero_recepcion` text
- `estado` text
- `recibido_por_usuario_id` uuid null
- `recibido_en` timestamptz
- `creado_en` timestamptz

Estados sugeridos:

- `parcial`
- `completa`
- `rechazada`

Restriccion:

- unique `(organizacion_id, numero_recepcion)`

### 10. `recepciones_compra_items`

Uso:

- detalle de lo recibido por producto.

Campos:

- `id` uuid
- `organizacion_id` uuid
- `recepcion_id` uuid
- `orden_compra_item_id` uuid
- `catalog_item_id` uuid
- `cantidad_recibida` numeric(14,3) not null
- `costo_unitario_real` numeric(14,4) not null
- `subtotal` numeric(14,4) not null
- `lote_codigo` text null
- `fecha_caducidad` date null
- `serie` text null
- `observaciones` text null

## Orden de implementacion

### Fase 1: base minima operativa

Objetivo:

- tener catalogo, almacenes, stock actual y movimientos.

Tablas:

- `catalog_items`
- `almacenes`
- `inventario_existencias`
- `inventario_movimientos`

Resultado esperado:

- se puede dar de alta un producto,
- crear un almacen,
- cargar stock inicial,
- descontar stock por una venta o ajuste,
- consultar existencias por almacen.

### Fase 2: compras basicas

Objetivo:

- registrar proveedores y ordenes de compra.

Tablas:

- `proveedores`
- `proveedor_items`
- `ordenes_compra`
- `ordenes_compra_items`

Resultado esperado:

- se puede asignar un proveedor a un producto,
- crear una OC,
- calcular importes por linea,
- revisar historico de compras por proveedor y por producto.

### Fase 3: recepcion de mercancia

Objetivo:

- convertir compras en entradas reales de inventario.

Tablas:

- `recepciones_compra`
- `recepciones_compra_items`

Resultado esperado:

- se puede registrar una recepcion parcial o completa,
- incrementar stock,
- actualizar cantidades recibidas en la OC,
- dejar evidencia auditable del ingreso.

Estado:

- aplicada en `supabase/migrations/20260521_150000_inventory_purchases_phase3.sql`.

### Fase 4: refinamiento operativo

Objetivo:

- consolidar reglas de negocio.

Tareas:

- reservar stock al confirmar el pedido del cliente, nunca por aceptar una cotizacion solamente,
- liberar reservas cuando se cancele un pedido no surtido,
- descontar existencia fisica al entregar/embarcar y liberar la reserva en la misma operacion,
- ajuste de costo promedio,
- validaciones de stock minimo,
- reportes de rotacion, faltantes y compras sugeridas.
- ajuste manual de inventario con movimiento auditado.
- reemplazar la reserva actual al aceptar cotizaciones por reserva al confirmar pedidos de cliente.

### Fase 5: edicion operativa de ordenes de compra

Objetivo:

- permitir corregir una orden de compra antes de su recepcion.

Tareas:

- editar cabecera de la orden,
- reemplazar las lineas de la orden de forma transaccional,
- bloquear edicion en estados `recibida`, `cerrada` y `cancelada`,
- recalcular importes al guardar cambios,
- mantener la recepcion posterior consistente con las lineas actualizadas.

## Reglas de negocio recomendadas

- No actualizar directamente `inventario_existencias` sin generar un movimiento.
- Toda compra debe pasar por `ordenes_compra` y, si aplica, por `recepciones_compra`.
- Toda salida de inventario debe registrar `referencia_tipo` y `referencia_id`.
- El stock disponible debe salir de calculo, no de captura manual.
- Los costos historicos deben quedar en movimientos y lineas de compra, no en JSON.

## Indices recomendados

- `catalog_items`: index por `(organizacion_id, codigo)`, `(organizacion_id, activo_compra)`, `(organizacion_id, maneja_inventario)`.
- `almacenes`: unique `(organizacion_id, codigo)`.
- `inventario_existencias`: unique `(organizacion_id, catalog_item_id, almacen_id)`.
- `inventario_movimientos`: index por `(organizacion_id, catalog_item_id, creado_en desc)`, `(organizacion_id, almacen_id, creado_en desc)`.
- `proveedores`: unique `(organizacion_id, codigo_proveedor)`.
- `proveedor_items`: unique `(organizacion_id, proveedor_id, catalog_item_id)`.
- `ordenes_compra`: unique `(organizacion_id, folio)`, index por `(organizacion_id, proveedor_id, creado_en desc)`.
- `ordenes_compra_items`: index por `(organizacion_id, orden_compra_id)`, `(organizacion_id, catalog_item_id)`.
- `recepciones_compra`: unique `(organizacion_id, numero_recepcion)`, index por `(organizacion_id, orden_compra_id)`.
- `recepciones_compra_items`: index por `(organizacion_id, recepcion_id)`, `(organizacion_id, catalog_item_id)`.

## Migracion y compatibilidad

- Mantener `productos` solo como legado mientras se migra el uso a `catalog_items`.
- Revisar las vistas y consultas que aun lean `productos`.
- Si existe codigo que usa `producto_id`, adaptar primero las consultas o crear una capa de compatibilidad temporal.

## Criterios de aceptacion

- Un producto puede tener control de inventario activo o inactivo.
- Se puede crear uno o varios almacenes por organizacion.
- Se puede consultar stock actual por producto y almacen.
- Cada cambio de stock genera un movimiento.
- Se puede crear un proveedor y relacionarlo con productos.
- Se puede generar una orden de compra y calcular sus totales.
- Se puede registrar la recepcion y entrar stock al inventario.

## Siguientes pasos tecnicos

1. Crear `pedidos_venta` y `pedido_venta_items`, con estados y relaciones tenant-safe a cotizacion, cliente, catalogo y venta.
2. Reemplazar la reserva al aceptar cotizacion por la confirmacion explicita del pedido del cliente.
3. Agregar `catalog_item_id` como relacion explicita de `cotizacion_items` y propagarlo a partidas del pedido y `venta_items` al formalizar.
4. Confirmar pedido, formalizar venta/cuenta por cobrar y reservar cantidades disponibles de forma transaccional e idempotente por tenant y almacen.
5. Registrar surtidos/entregas como movimientos de salida y liberar la reserva en la misma operacion; liberar tambien las cantidades no surtidas al cancelar.
6. Integrar la venta inmobiliaria con el nucleo financiero y el pedido sin generar movimientos de almacen para propiedades.
7. Validar el ciclo de pedido, reserva, cancelacion y entrega parcial/completa antes de ampliar reportes o reglas configurables por tenant.

## Estado actual

- Fase 1 iniciada con migracion base en `supabase/migrations/20260521_120000_inventory_purchases_phase1.sql`.
- El enfoque ya quedo definido alrededor de `catalog_items` como catalogo canonicamente operable.
- Fase 2 preparada para proveedores y compras en `supabase/migrations/20260521_140000_inventory_purchases_phase2.sql`.
- Fase 3 aplicada para recepciones de compra y entrada a inventario en `supabase/migrations/20260521_150000_inventory_purchases_phase3.sql`.
- Existe una primera pantalla operativa en `frontend/panel/src/app/settings/compras/page.tsx` con alta de almacenes y recepción de mercancía.
- Ya existe alta simple de proveedores y creación de órdenes de compra en la misma vista de compras.
- Ya existe una vista simple de existencias por almacén dentro de `frontend/panel/src/app/settings/compras/compras-workspace.client.tsx`.
- Ya se puede editar una orden de compra en borrador o estado abierto desde la misma vista de compras.
- Ya se puede mover una orden por el flujo operativo basico: `borrador` -> `enviada` -> `aprobada` -> `cerrada`.
- Ya se registra quien envia y quien aprueba una orden, y se muestra en la tabla de ordenes.
- `Cerrar` solo se habilita cuando la orden ya tiene recepcion completa.
- El catálogo ya muestra y guarda campos operativos de inventario desde `frontend/panel/src/components/settings/catalog-items-panel.tsx`.
- Ya existe un maestro editable de unidades de medida en `settings/productos/unidades-medida` y el catálogo usa ese maestro para `unidad_inventario`.
- Ya existe un ajuste manual de inventario en la vista de compras, con movimiento auditable.
- El flujo actualmente documentado reserva/libera inventario al aceptar/cancelar cotizaciones; esa conducta queda supersedida por la politica acordada el 2026-09-24. La reserva por pedido confirmado y la salida fisica por entrega estan pendientes de implementacion y validacion.
- La siguiente entrega debe implementar y validar la reserva por pedido confirmado, el surtido/entrega con salida auditada y la liberacion de reservas pendientes; despues se ampliaran reportes y politicas por tenant.
