# Ordenes de compra locales e internacionales

## Propuesta de diseno

La app debe manejar una sola experiencia de ordenes de compra, no dos modulos separados.

La idea es:

- una sola tabla madre para la orden;
- un detalle de partidas por orden;
- campos comunes para compras locales y nacionales;
- campos opcionales adicionales cuando la orden sea internacional;
- snapshots historicos dentro de la orden para que el documento no cambie si despues se edita el proveedor o el producto.

Esto permite controlar compras locales, importaciones y exportaciones con el mismo flujo operativo.

## Principio base

La orden de compra es el documento maestro.

Todo lo demas cuelga de ella:

- proveedor;
- comprador/importador;
- partidas;
- condiciones comerciales;
- condiciones de pago;
- logistica y embarque;
- documentos;
- aprobaciones;
- bitacora.

## Modelo propuesto

### 1. `ordenes_compra`

Cabecera principal de la orden.

Campos comunes:

- `id` uuid
- `organizacion_id` uuid
- `folio` text
- `tipo_operacion` text
  - valores sugeridos: `nacional`, `internacional`
- `estado` text
  - valores sugeridos: `borrador`, `en_revision`, `autorizada`, `enviada`, `aceptada_por_proveedor`, `parcialmente_embarcada`, `embarcada`, `recibida`, `cancelada`, `cerrada`
- `fecha_emision` timestamptz
- `vigencia_hasta` date null
- `comprador_id` uuid null
- `proveedor_id` uuid
- `moneda` char(3)
- `tipo_cambio_referencia` numeric(14,6) null
- `subtotal` numeric(14,4)
- `descuento_total` numeric(14,4)
- `flete_total` numeric(14,4)
- `seguro_total` numeric(14,4)
- `otros_gastos_total` numeric(14,4)
- `impuestos_total` numeric(14,4)
- `total` numeric(14,4)
- `cotizacion_referencia` text null
- `proforma_referencia` text null
- `observaciones` text null
- `solicitado_por_usuario_id` uuid null
- `autorizado_por_usuario_id` uuid null
- `enviada_por_usuario_id` uuid null
- `aceptada_por_usuario_id` uuid null
- `creado_en` timestamptz
- `actualizado_en` timestamptz

Notas:

- `tipo_operacion` define si la orden activa campos extra internacionales.
- `folio` debe ser unico por organizacion.
- el subtotal y total deben recalcularse a partir de las partidas.

### 2. `ordenes_compra_items`

Detalle de partidas.

Campos:

- `id` uuid
- `organizacion_id` uuid
- `orden_compra_id` uuid
- `numero_partida` integer
- `catalog_item_id` uuid null
- `proveedor_item_id` uuid null
- `sku` text null
- `descripcion` text
- `marca` text null
- `modelo` text null
- `fabricante` text null
- `pais_origen` text null
- `pais_procedencia` text null
- `fraccion_arancelaria` text null
- `hs_code` text null
- `nico` text null
- `cantidad_solicitada` numeric(14,3)
- `cantidad_recibida` numeric(14,3)
- `unidad` text
- `precio_unitario` numeric(14,4)
- `descuento_porcentaje` numeric(5,2) null
- `subtotal` numeric(14,4)
- `impuestos` numeric(14,4)
- `total` numeric(14,4)
- `peso_neto` numeric(14,4) null
- `peso_bruto` numeric(14,4) null
- `volumen_cbm` numeric(14,4) null
- `lote` text null
- `numero_serie` text null
- `fecha_caducidad` date null
- `observaciones` text null
- `creado_en` timestamptz
- `actualizado_en` timestamptz

Notas:

- esta tabla debe guardar snapshot historico de la descripcion y precio;
- no depender solo del catalogo actual;
- si cambia el catalogo despues, la orden original no debe alterarse.

### 3. `ordenes_compra_condiciones_comerciales`

Snapshot de condiciones comerciales.

Campos:

- `id` uuid
- `organizacion_id` uuid
- `orden_compra_id` uuid
- `incoterm` text null
- `incoterm_version` text null
- `lugar_incoterm` text null
- `responsable_flete` text null
- `responsable_seguro` text null
- `responsable_despacho_exportacion` text null
- `responsable_despacho_importacion` text null
- `responsable_impuestos_importacion` text null
- `permite_embarques_parciales` boolean not null default true
- `permite_transbordos` boolean not null default true
- `gastos_bancarios` text null
- `observaciones` text null

Campos que deben aparecer solo cuando `tipo_operacion = internacional`:

- `incoterm`
- `incoterm_version`
- `lugar_incoterm`
- `responsable_flete`
- `responsable_seguro`
- `responsable_despacho_exportacion`
- `responsable_despacho_importacion`
- `responsable_impuestos_importacion`
- `gastos_bancarios`

### 4. `ordenes_compra_condiciones_pago`

Snapshot de condiciones de pago.

Campos:

- `id` uuid
- `organizacion_id` uuid
- `orden_compra_id` uuid
- `forma_pago` text
- `moneda_pago` char(3)
- `porcentaje_anticipo` numeric(5,2) null
- `monto_anticipo` numeric(14,4) null
- `porcentaje_saldo` numeric(5,2) null
- `monto_saldo` numeric(14,4) null
- `momento_pago_saldo` text null
- `dias_credito` integer null
- `comisiones_bancarias` text null
- `observaciones` text null

### 5. `ordenes_compra_logistica`

Snapshot logístico.

Campos:

- `id` uuid
- `organizacion_id` uuid
- `orden_compra_id` uuid
- `modo_transporte` text
- `fecha_requerida_embarque` date null
- `fecha_estimada_embarque` date null
- `fecha_estimada_arribo` date null
- `puerto_origen` text null
- `puerto_destino` text null
- `aeropuerto_origen` text null
- `aeropuerto_destino` text null
- `lugar_entrega_final` text null
- `direccion_entrega` text null
- `tipo_embarque` text null
- `tipo_contenedor` text null
- `forwarder_nombre` text null
- `numero_booking` text null
- `numero_bl_awb` text null
- `tracking` text null
- `peso_neto_total` numeric(14,4) null
- `peso_bruto_total` numeric(14,4) null
- `volumen_total_cbm` numeric(14,4) null
- `cantidad_bultos` integer null
- `tipo_empaque` text null
- `marcas_embarque` text null
- `requiere_seguro` boolean not null default false
- `monto_asegurado` numeric(14,4) null
- `observaciones` text null

### 6. `ordenes_compra_documentos`

Documentos y anexos requeridos.

Campos:

- `id` uuid
- `organizacion_id` uuid
- `orden_compra_id` uuid
- `tipo_documento` text
- `obligatorio` boolean not null default false
- `estado` text null
- `fecha_limite` date null
- `archivo_id` uuid null
- `observaciones` text null

Tipos sugeridos:

- `commercial_invoice`
- `packing_list`
- `bill_of_lading`
- `air_waybill`
- `certificate_of_origin`
- `ficha_tecnica`
- `msds`
- `certificado_calidad`
- `certificado_sanitario`
- `certificado_nom`
- `garantia`

### 7. `ordenes_compra_autorizaciones`

Flujo interno de aprobacion.

Campos:

- `id` uuid
- `organizacion_id` uuid
- `orden_compra_id` uuid
- `usuario_id` uuid
- `rol` text
- `estado` text
- `comentario` text null
- `fecha_autorizacion` timestamptz null

### 8. `ordenes_compra_eventos`

Bitacora auditada.

Campos:

- `id` uuid
- `organizacion_id` uuid
- `orden_compra_id` uuid
- `usuario_id` uuid null
- `evento` text
- `descripcion` text null
- `metadata` jsonb not null default '{}'::jsonb
- `creado_en` timestamptz

Eventos sugeridos:

- `orden_creada`
- `orden_editada`
- `orden_autorizada`
- `orden_enviada`
- `proveedor_acepto`
- `anticipo_registrado`
- `embarque_confirmado`
- `documentos_recibidos`
- `recepcion_parcial`
- `recepcion_completa`
- `orden_cerrada`
- `orden_cancelada`

## Tabla de soporte recomendada

### 9. `agentes_aduanales`

Solo necesaria para ordenes internacionales.

Campos:

- `id` uuid
- `organizacion_id` uuid
- `nombre` text
- `patente` text null
- `razon_social` text null
- `rfc` text null
- `contacto` text null
- `telefono` text null
- `email` text null
- `direccion` text null
- `activo` boolean not null default true

### 10. `incoterms`

Catalogo editable de Incoterms vigentes.

Campos:

- `id` uuid
- `codigo` text
- `nombre` text
- `version` text
- `tipo_transporte` text
- `descripcion` text null
- `activo` boolean not null default true
- `vigente_desde` date null
- `vigente_hasta` date null
- `creado_en` timestamptz
- `actualizado_en` timestamptz

Notas:

- `codigo` debe ser unico por version o por organizacion, segun la estrategia multitenant que se adopte;
- la orden de compra no debe depender solo del catalogo actual: debe guardar snapshot del incoterm pactado en `ordenes_compra_condiciones_comerciales`;
- si en el futuro cambia el catalogo, las ordenes historicas deben seguir mostrando el incoterm real que se pactó en su momento.

### 11. `monedas`

Catalogo de monedas para compras locales e internacionales.

Campos:

- `id` uuid
- `codigo` text
- `nombre` text
- `simbolo` text null
- `pais_principal` text null
- `activo` boolean not null default true
- `creado_en` timestamptz
- `actualizado_en` timestamptz

Notas:

- `codigo` debe ser el codigo ISO 4217, por ejemplo `MXN`, `USD`, `EUR`;
- la orden guarda la moneda usada en el snapshot para no depender del catalogo actual.

### 12. `geo_paises` existente

La base de datos ya cuenta con `public.geo_paises`, por lo que este plan debe reutilizarla como catalogo oficial de paises en lugar de crear otra tabla duplicada.

Campos esperados para consumo del modulo:

- `id` uuid
- `codigo_iso2` text
- `codigo_iso3` text
- `nombre` text
- `nombre_ingles` text null
- `activo` boolean not null default true
- `creado_en` timestamptz
- `actualizado_en` timestamptz

Notas:

- reutilizar `public.geo_paises` para `pais_origen`, `pais_procedencia`, `pais_destino` y cualquier selector de pais;
- si hace falta una vista o adaptador, el modulo debe leer desde `geo_paises` y no desde una tabla nueva;
- la UI puede mostrar el nombre del pais, pero guardar la referencia normalizada contra `geo_paises`.

### 13. `modos_transporte`

Catalogo de modos de transporte y embalses logísticos.

Campos:

- `id` uuid
- `codigo` text
- `nombre` text
- `descripcion` text null
- `activo` boolean not null default true
- `creado_en` timestamptz
- `actualizado_en` timestamptz

Valores sugeridos:

- `maritimo`
- `aereo`
- `terrestre`
- `courier`
- `multimodal`

Notas:

- este catalogo alimenta `ordenes_compra_logistica.modo_transporte`;
- en el UI permite mostrar opciones estandarizadas y evitar textos libres inconsistentes.

## Relacion con el modelo actual

El modulo actual de compras ya cubre:

- almacenes;
- proveedores;
- recepciones;
- existencias;
- movimientos;
- ordenes de compra;
- edicion operativa de ordenes;
- ajuste manual de inventario.

La evolucion recomendada es no rehacerlo desde cero, sino:

1. conservar el backend y frontend actuales de compras;
2. elevar `ordenes_compra` como documento formal;
3. ampliar las ordenes con campos internacionales opcionales;
4. conservar un solo flujo para ordenes locales e internacionales.

## Campos comunes para cualquier orden

Estos deben existir siempre:

- numero de orden;
- fecha;
- estado;
- proveedor;
- comprador;
- partidas;
- cantidades;
- precios;
- totales;
- aprobaciones;
- anexos;
- recepcion;
- bitacora.

## Campos que solo aplican a ordenes internacionales

Estos deben mostrarse solo cuando `tipo_operacion = internacional`:

- `incoterm`;
- `lugar_incoterm`;
- `moneda`;
- `tipo_cambio`;
- `pais_origen`;
- `pais_procedencia`;
- `fraccion_arancelaria`;
- `hs_code`;
- `nico`;
- `agente_aduanal`;
- `documentos aduanales`;
- `condiciones bancarias`;
- `flete`;
- `seguro`;
- `aduana`;
- `embarque`.

## Esquema SQL propuesto

La idea es extender el modulo actual sin duplicar catalogos que ya existen.

### Catalogos reutilizados

- `public.geo_paises` para paises;
- `public.proveedores` para proveedores;
- `public.catalog_items` para productos base, si ya se esta usando el catalogo actual;
- `public.proveedor_items` para el cruce proveedor-producto cuando aplique.

### Tablas nuevas o a formalizar

#### `ordenes_compra`

Cabecera de la orden.

Campos clave:

- `id` uuid primary key;
- `organizacion_id` uuid not null;
- `folio` text not null;
- `tipo_operacion` text not null;
- `estado` text not null;
- `fecha_emision` timestamptz not null;
- `vigencia_hasta` date null;
- `comprador_id` uuid null;
- `proveedor_id` uuid not null;
- `moneda_codigo` char(3) not null;
- `tipo_cambio_referencia` numeric(14,6) null;
- `subtotal` numeric(14,4) not null default 0;
- `descuento_total` numeric(14,4) not null default 0;
- `flete_total` numeric(14,4) not null default 0;
- `seguro_total` numeric(14,4) not null default 0;
- `otros_gastos_total` numeric(14,4) not null default 0;
- `impuestos_total` numeric(14,4) not null default 0;
- `total` numeric(14,4) not null default 0;
- `cotizacion_referencia` text null;
- `proforma_referencia` text null;
- `observaciones` text null;
- `solicitado_por_usuario_id` uuid null;
- `autorizado_por_usuario_id` uuid null;
- `enviada_por_usuario_id` uuid null;
- `aceptada_por_usuario_id` uuid null;
- `creado_en` timestamptz not null;
- `actualizado_en` timestamptz not null;

Reglas recomendadas:

- unique por `organizacion_id + folio`;
- check de `tipo_operacion` en `nacional` / `internacional`;
- check de `estado` con valores controlados.

#### `ordenes_compra_items`

Detalle de partidas con snapshot historico.

Campos clave:

- `id` uuid primary key;
- `organizacion_id` uuid not null;
- `orden_compra_id` uuid not null;
- `numero_partida` integer not null;
- `catalog_item_id` uuid null;
- `proveedor_item_id` uuid null;
- `sku` text null;
- `descripcion` text not null;
- `marca` text null;
- `modelo` text null;
- `fabricante` text null;
- `pais_origen_codigo_iso2` text null;
- `pais_procedencia_codigo_iso2` text null;
- `fraccion_arancelaria` text null;
- `hs_code` text null;
- `nico` text null;
- `cantidad_solicitada` numeric(14,3) not null;
- `cantidad_recibida` numeric(14,3) not null default 0;
- `unidad` text not null;
- `precio_unitario` numeric(14,4) not null;
- `descuento_porcentaje` numeric(5,2) null;
- `subtotal` numeric(14,4) not null;
- `impuestos` numeric(14,4) not null default 0;
- `total` numeric(14,4) not null;
- `peso_neto` numeric(14,4) null;
- `peso_bruto` numeric(14,4) null;
- `volumen_cbm` numeric(14,4) null;
- `lote` text null;
- `numero_serie` text null;
- `fecha_caducidad` date null;
- `observaciones` text null;
- `creado_en` timestamptz not null;
- `actualizado_en` timestamptz not null;

Notas:

- la partida debe guardar snapshot de descripcion, precio, marca, modelo y origen;
- `pais_origen_codigo_iso2` y `pais_procedencia_codigo_iso2` deben resolverse contra `geo_paises`;
- si despues cambia el producto base, la orden historica no debe cambiar.

#### `ordenes_compra_condiciones_comerciales`

Snapshot de condiciones comerciales y de transporte.

Campos clave:

- `id` uuid primary key;
- `organizacion_id` uuid not null;
- `orden_compra_id` uuid not null;
- `incoterm_codigo` text null;
- `incoterm_version` text null;
- `lugar_incoterm` text null;
- `responsable_flete` text null;
- `responsable_seguro` text null;
- `responsable_despacho_exportacion` text null;
- `responsable_despacho_importacion` text null;
- `responsable_impuestos_importacion` text null;
- `permite_embarques_parciales` boolean not null default true;
- `permite_transbordos` boolean not null default true;
- `gastos_bancarios` text null;
- `observaciones` text null;

#### `ordenes_compra_condiciones_pago`

Snapshot de pagos.

Campos clave:

- `id` uuid primary key;
- `organizacion_id` uuid not null;
- `orden_compra_id` uuid not null;
- `forma_pago` text not null;
- `moneda_pago` char(3) not null;
- `porcentaje_anticipo` numeric(5,2) null;
- `monto_anticipo` numeric(14,4) null;
- `porcentaje_saldo` numeric(5,2) null;
- `monto_saldo` numeric(14,4) null;
- `momento_pago_saldo` text null;
- `dias_credito` integer null;
- `comisiones_bancarias` text null;
- `observaciones` text null;

#### `ordenes_compra_logistica`

Snapshot logistica.

Campos clave:

- `id` uuid primary key;
- `organizacion_id` uuid not null;
- `orden_compra_id` uuid not null;
- `modo_transporte_codigo` text not null;
- `fecha_requerida_embarque` date null;
- `fecha_estimada_embarque` date null;
- `fecha_estimada_arribo` date null;
- `puerto_origen` text null;
- `puerto_destino` text null;
- `aeropuerto_origen` text null;
- `aeropuerto_destino` text null;
- `lugar_entrega_final` text null;
- `direccion_entrega` text null;
- `tipo_embarque` text null;
- `tipo_contenedor` text null;
- `forwarder_nombre` text null;
- `numero_booking` text null;
- `numero_bl_awb` text null;
- `tracking` text null;
- `peso_neto_total` numeric(14,4) null;
- `peso_bruto_total` numeric(14,4) null;
- `volumen_total_cbm` numeric(14,4) null;
- `cantidad_bultos` integer null;
- `tipo_empaque` text null;
- `marcas_embarque` text null;
- `requiere_seguro` boolean not null default false;
- `monto_asegurado` numeric(14,4) null;
- `observaciones` text null;

#### `ordenes_compra_documentos`

Documentos obligatorios y anexos.

Campos clave:

- `id` uuid primary key;
- `organizacion_id` uuid not null;
- `orden_compra_id` uuid not null;
- `tipo_documento` text not null;
- `obligatorio` boolean not null default false;
- `estado` text null;
- `fecha_limite` date null;
- `archivo_id` uuid null;
- `observaciones` text null;

#### `ordenes_compra_autorizaciones`

Flujo de aprobacion.

Campos clave:

- `id` uuid primary key;
- `organizacion_id` uuid not null;
- `orden_compra_id` uuid not null;
- `usuario_id` uuid not null;
- `rol` text not null;
- `estado` text not null;
- `comentario` text null;
- `fecha_autorizacion` timestamptz null;

#### `ordenes_compra_eventos`

Bitacora de auditoria.

Campos clave:

- `id` uuid primary key;
- `organizacion_id` uuid not null;
- `orden_compra_id` uuid not null;
- `usuario_id` uuid null;
- `evento` text not null;
- `descripcion` text null;
- `metadata` jsonb not null default '{}'::jsonb;
- `creado_en` timestamptz not null;

### Catalogos de soporte

#### `incoterms`

Catalogo editable de Incoterms vigentes.

- `codigo`
- `nombre`
- `version`
- `tipo_transporte`
- `activo`
- `vigente_desde`
- `vigente_hasta`

#### `monedas`

Catalogo ISO 4217.

- `codigo`
- `nombre`
- `simbolo`
- `activo`

#### `modos_transporte`

Catalogo de medios de transporte.

- `codigo`
- `nombre`
- `descripcion`
- `activo`

### Reglas de integridad recomendadas

- las ordenes deben tener folio unico por organizacion;
- las partidas deben recalcular total en backend;
- los snapshots historicos no deben depender de cambios futuros en catalogos;
- lo internacional debe activar campos extra solo cuando `tipo_operacion = internacional`;
- `geo_paises` debe ser la fuente unica de paises;
- `incoterms`, `monedas` y `modos_transporte` deben poder administrarse como catalogos de soporte.

## Frontend propuesto

### Vista principal

Crear una sola vista de ordenes de compra que permita:

- crear orden nacional;
- crear orden internacional;
- editar borrador;
- aprobar;
- enviar;
- registrar recepcion;
- cerrar;
- cancelar.

### Formulario de alta

Secciones sugeridas:

1. datos generales;
2. proveedor;
3. partidas;
4. condiciones comerciales;
5. condiciones de pago;
6. logistica;
7. documentos;
8. autorizacion;
9. resumen.

### Comportamiento de la UI

- Si la orden es `nacional`, ocultar campos internacionales.
- Si la orden es `internacional`, mostrar campos extra.
- Las partidas deben permitir snapshot de:
  - descripcion;
  - precio unitario;
  - pais de origen;
  - fraccion arancelaria;
  - unidad;
  - peso y volumen.
- El formulario debe validar que:
  - el folio no se repita;
  - las partidas tengan cantidad y precio;
  - la orden no se cierre sin recepcion completa;
  - los campos internacionales solo sean obligatorios cuando aplique.

## Backend propuesto

### Endpoints sugeridos

- `GET /crm/compras/ordenes`
- `POST /crm/compras/ordenes`
- `PATCH /crm/compras/ordenes/{orden_id}`
- `DELETE /crm/compras/ordenes/{orden_id}`
- `POST /crm/compras/ordenes/{orden_id}/enviar`
- `POST /crm/compras/ordenes/{orden_id}/aprobar`
- `POST /crm/compras/ordenes/{orden_id}/cerrar`
- `POST /crm/compras/ordenes/{orden_id}/cancelar`
- `POST /crm/compras/ordenes/{orden_id}/recepciones`

### Reglas de backend

- no permitir editar partidas si la orden ya fue recibida o cerrada;
- recalcular totales en backend, no en frontend;
- persistir snapshot historico de condiciones y partidas;
- registrar eventos en bitacora;
- validar que lo internacional solo aplique cuando corresponde.

## Estrategia de implementacion

### Fase 1

- formalizar la tabla madre de ordenes;
- consolidar partidas;
- guardar condiciones comerciales y de pago;
- guardar logistica.

### Fase 2

- agregar modo internacional;
- mostrar/ocultar campos por tipo de orden;
- agregar agente aduanal y documentos.

### Fase 3

- flujo de aprobacion;
- bitacora;
- reportes de ordenes abiertas, aprobadas y recibidas.

## Recomendacion final

No conviene crear dos sistemas separados para local e internacional.

Conviene una sola orden de compra con:

- base comun;
- extensiones internacionales opcionales;
- snapshots historicos;
- control operativo desde backend;
- UI condicional por tipo de operacion.

Eso mantiene el modulo simple, util y escalable.
