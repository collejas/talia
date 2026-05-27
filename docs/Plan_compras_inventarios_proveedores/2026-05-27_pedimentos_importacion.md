# Pedimentos de importacion

## Objetivo

Extender el modulo de compras para manejar el nivel aduanal de importacion, de forma que un `pedimento` pueda agrupar varias ordenes de compra internacionales y repartir todos los costos asociados entre todos los items incluidos en ese pedimento.

La idea es resolver tres problemas en un solo flujo:

- identificar el numero de pedimento que entrega el agente aduanal;
- vincular varias ordenes de compra internacionales a ese pedimento;
- calcular el costo real de cada item considerando todos los gastos compartidos.

## Regla de negocio principal

El costo total que debe prorratearse por item no es solo el gasto del pedimento.

Debe incluir:

- los gastos inherentes del pedimento de importacion;
- los gastos tipo `gasto` de cada orden de compra ligada a ese pedimento.

No deben entrar en ese prorrateo:

- `anticipo`;
- `saldo`;
- pagos de cumplimiento de la orden;
- movimientos que no representen costo de importacion.

### Formula base

```text
costo_total_prorrateable =
  suma(gastos_del_pedimento)
  + suma(gastos_tipo_gasto_de_ordenes_asignadas)
```

Luego:

```text
peso_item = base_item / base_total_items
costo_asignado_item = costo_total_prorrateable * peso_item
```

La base de reparto debe ser configurable, pero la recomendacion es:

- por defecto, usar `valor del item` como base principal;
- opcionalmente permitir prorrateo por `peso`, `volumen` o una regla mixta si el negocio lo requiere.

## Alcance funcional

### Lo que debe resolver el modulo

- crear un pedimento con su numero oficial;
- ligar uno o varios pedidos internacionales a ese pedimento;
- registrar gastos del pedimento;
- identificar gastos propios de cada orden que tambien deban absorberse en el costo global;
- calcular el total acumulado del pedimento;
- prorratear el costo global entre todos los items del pedimento;
- entregar costo unitario real final por item para analisis de precio de venta.

### Lo que no debe hacer

- no debe mezclar el pedimento dentro de la orden como si fuera un gasto interno de la orden;
- no debe reemplazar el flujo de `anticipo` y `saldo` de la orden;
- no debe perder trazabilidad por ordenar los costos solo en una columna total.

## Base de datos

### 1. `pedimentos_importacion`

Cabecera del pedimento.

Campos sugeridos:

- `id` uuid
- `organizacion_id` uuid
- `numero_pedimento` text not null
- `agente_aduanal_id` uuid null
- `estado` text
  - valores sugeridos: `borrador`, `en_integracion`, `presentado`, `pagado`, `cerrado`, `cancelado`
- `fecha_pedimento` date null
- `fecha_presentacion` date null
- `fecha_liberacion` date null
- `moneda` char(3) not null default `MXN`
- `tipo_cambio` numeric(14,6) null
- `subtotal_aduanal` numeric(14,4) not null default 0
- `gastos_pedimento_total` numeric(14,4) not null default 0
- `gastos_ordenes_total` numeric(14,4) not null default 0
- `costo_total_prorrateable` numeric(14,4) not null default 0
- `observaciones` text null
- `creado_en` timestamptz
- `actualizado_en` timestamptz

Reglas:

- `numero_pedimento` debe ser obligatorio y capturado manualmente.
- debe ser unico por organizacion.
- el agente aduanal puede ser catalogo o texto libre, pero lo ideal es normalizarlo.

### 2. `agentes_aduanales`

Catalogo opcional para agentes aduanales.

Campos sugeridos:

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

## Vista de agentes aduanales

### Objetivo de la vista

Permitir dar de alta, editar, consultar y desactivar agentes aduanales sin salir del modulo de compras.

La vista debe existir porque:

- evita capturas repetidas;
- normaliza el dato del agente;
- acelera el alta de pedimentos;
- permite reutilizar informacion historica.

### Ubicacion sugerida

La vista puede vivir en cualquiera de estas dos rutas:

- como subvista dentro de `Pedimentos de importacion`;
- como seccion secundaria dentro de `Compras`.

La recomendacion es que quede dentro de `Compras`, pero agrupada visualmente con `Pedimentos de importacion`.

### Acciones de la vista

Debe permitir:

- listar agentes aduanales activos e inactivos;
- crear agente aduanal;
- editar agente aduanal;
- desactivar o reactivar agente aduanal;
- buscar por nombre, patente o RFC;
- seleccionar un agente desde el formulario de pedimento.

### Campos de la pantalla

Campos recomendados para alta y edicion:

- nombre;
- patente;
- razon social;
- RFC;
- contacto;
- telefono;
- email;
- direccion;
- activo.

### Comportamiento esperado

- si el usuario esta creando un pedimento, debe poder abrir la vista de agentes aduanales en modal o panel lateral;
- al guardar un agente aduanal nuevo, debe quedar disponible inmediatamente para seleccionarlo en el pedimento;
- al desactivar un agente, no debe borrarse el historial de pedimentos ligados;
- el selector del pedimento debe mostrar el nombre comercial y la patente si existe.

### 3. `pedimentos_importacion_ordenes_compra`

Tabla puente para ligar pedimentos con ordenes de compra internacionales.

Campos sugeridos:

- `id` uuid
- `organizacion_id` uuid
- `pedimento_id` uuid
- `orden_compra_id` uuid
- `rol` text null
  - valores sugeridos: `principal`, `complementaria`, `parcial`
- `observaciones` text null
- `creado_en` timestamptz

Reglas:

- el pedimento puede agrupar varias ordenes de compra internacionales.
- la UI debe impedir ligar ordenes no internacionales.
- si el negocio requiere una separacion mas fina, esta tabla permite futuro soporte de parciales.

### 4. `pedimentos_importacion_gastos`

Gastos propios del pedimento.

Campos sugeridos:

- `id` uuid
- `organizacion_id` uuid
- `pedimento_id` uuid
- `tipo_gasto` text
- `descripcion` text
- `monto` numeric(14,4) not null
- `moneda` char(3) not null default `MXN`
- `tipo_cambio` numeric(14,6) null
- `monto_mxn` numeric(14,4) not null
- `fecha_gasto` date null
- `referencia_factura` text null
- `archivo_id` uuid null
- `estado` text
  - valores sugeridos: `pendiente`, `registrado`, `pagado`, `cancelado`
- `observaciones` text null
- `creado_en` timestamptz
- `actualizado_en` timestamptz

Ejemplos de gasto:

- honorarios del agente aduanal;
- prevalidacion;
- DTA;
- maniobras;
- almacenaje;
- derechos;
- flete aduanal;
- gastos de liberacion;
- otros cargos vinculados al pedimento.

### 5. `pedimentos_importacion_prorrateos`

Detalle calculado del reparto del costo del pedimento por item.

Campos sugeridos:

- `id` uuid
- `organizacion_id` uuid
- `pedimento_id` uuid
- `orden_compra_id` uuid
- `orden_compra_item_id` uuid
- `base_prorrateo` text
  - valores sugeridos: `valor`, `peso`, `volumen`, `mixto`
- `base_item` numeric(14,6) not null default 0
- `base_total` numeric(14,6) not null default 0
- `porcentaje_prorrateo` numeric(14,8) not null default 0
- `costo_pedimento_asignado` numeric(14,4) not null default 0
- `costo_orden_asignado` numeric(14,4) not null default 0
- `costo_total_asignado` numeric(14,4) not null default 0
- `costo_unitario_adicional` numeric(14,4) not null default 0
- `creado_en` timestamptz
- `actualizado_en` timestamptz

Notas:

- esta tabla no reemplaza el costo de compra del item;
- solo guarda la parte de costos compartidos del pedimento y de las ordenes asociadas.

## Reglas de calculo

### 1. Costo global del pedimento

El sistema debe calcular:

```text
gastos_ordenes_total = suma(gastos tipo gasto de cada orden ligada al pedimento)
gastos_pedimento_total = suma(gastos del pedimento)
costo_total_prorrateable = gastos_ordenes_total + gastos_pedimento_total
```

### 2. Base de reparto

La base recomendada para repartir entre items es el valor del item:

```text
base_item = cantidad_solicitada * precio_unitario
base_total = suma(base_item de todos los items del pedimento)
```

Si se requiere otro criterio, el modelo debe poder guardar el tipo de base usado.

### 3. Prorrateo por item

```text
porcentaje_prorrateo = base_item / base_total
costo_total_asignado = costo_total_prorrateable * porcentaje_prorrateo
```

### 4. Costo unitario real

```text
costo_unitario_adicional = costo_total_asignado / cantidad_del_item
costo_unitario_real = costo_unitario_compra + costo_unitario_adicional
```

Ese costo real es el que debe quedar disponible para:

- costeo real del inventario;
- analisis de margen;
- sugerencia de precio de venta.

## Impacto en el modelo actual de compras

El modulo actual ya cubre:

- ordenes de compra nacionales e internacionales;
- pagos programados por orden;
- condiciones comerciales;
- condiciones de pago;
- documentos;
- bitacora.

La nueva capa de pedimentos debe montarse encima de eso, sin romper el flujo actual.

### Reglas de integracion

- la orden sigue siendo el documento comercial principal;
- el pedimento es el nivel aduanal que agrupa ordenes internacionales;
- los gastos de la orden siguen existiendo;
- los gastos del pedimento se agregan aparte;
- el costo final se obtiene al consolidar ambos niveles.

## Backend

### Endpoints o acciones necesarias

- crear pedimento;
- editar pedimento;
- consultar pedimento con sus ordenes y gastos;
- vincular y desvincular ordenes de compra al pedimento;
- registrar gasto del pedimento;
- actualizar gasto del pedimento;
- recalcular totales del pedimento;
- recalcular prorrateo por item;
- obtener costo final por item y por orden;
- cerrar o cancelar pedimento.

### Reglas backend

- validar que solo se puedan ligar ordenes con `tipo_operacion = internacional`;
- validar que las ordenes ligadas pertenezcan a la misma organizacion;
- recalcular el total cuando se agregue, edite o elimine un gasto;
- recalcular el prorrateo cuando cambie la composicion del pedimento;
- guardar el historial de calculo si se requiere auditoria.

### Consideraciones tecnicas

- el calculo debe ejecutarse en servidor, no solo en UI;
- el backend debe normalizar montos a una moneda base antes de prorratear;
- si hay varios comprobantes para el mismo gasto, el total debe consolidarse antes del reparto;
- los valores calculados deben persistirse para consulta historica y no depender solo de una suma en pantalla.

## UI

### Nueva seccion

Agregar una seccion llamada:

- `Pedimentos de importacion`

Agregar una subvista llamada:

- `Agentes aduanales`

### Pantalla de listado

Debe mostrar:

- numero de pedimento;
- estado;
- agente aduanal;
- numero de ordenes ligadas;
- total de gastos del pedimento;
- total de gastos de ordenes absorbidos;
- total global prorrateable;
- fecha de presentacion;
- fecha de liberacion.

### Pantalla de detalle

Debe permitir:

- ver la cabecera del pedimento;
- agregar o quitar ordenes internacionales ligadas;
- ver el resumen de items del pedimento;
- registrar gastos del pedimento;
- ver gastos de cada orden asociados al pedimento;
- ver el total global;
- ver el prorrateo por item;
- ver el costo unitario final por item.

### Pantalla de agentes aduanales

Debe permitir:

- ver listado en tabla o cards compactas;
- buscar por nombre, patente o RFC;
- editar datos de contacto;
- activar o desactivar el agente;
- crear nuevo agente sin abandonar el contexto del pedimento;
- abrir el selector de agente desde el alta del pedimento.

### Comportamiento de UI

- mostrar advertencia si una orden internacional no tiene pedimento asignado;
- mostrar el desglose de costos en tres bloques:
  - gastos de la orden;
  - gastos del pedimento;
  - costo prorrateado por item;
- permitir re-correr el calculo manualmente si el usuario modifica gastos o relaciones;
- mostrar el costo adicional por item y el costo final consolidado.

### Vista dentro de compras

La experiencia ideal es que desde la orden internacional se pueda:

- crear o asignar un pedimento;
- ver el pedimento relacionado;
- revisar los gastos de pedimento que impactan a esa orden;
- navegar al detalle global del pedimento.

Y desde el pedimento se pueda:

- seleccionar o crear el agente aduanal;
- ver el historial de pedimentos asociados a ese agente;
- reutilizar agentes frecuentes sin duplicar registros.

## Flujo operativo sugerido

1. Se crea la orden internacional.
2. Se registran sus pagos de cumplimiento y sus gastos propios.
3. Cuando la mercancia llega a Mexico, se crea el pedimento.
4. Se captura el numero de pedimento del agente aduanal.
5. Se agregan una o varias ordenes internacionales al pedimento.
6. Se registran los gastos del pedimento.
7. El sistema suma:
   - gastos del pedimento;
   - gastos tipo `gasto` de las ordenes asociadas.
8. El sistema prorratea el total entre todos los items de todas las ordenes del pedimento.
9. El sistema calcula el costo real por item.
10. El usuario usa ese costo real para definir precio de venta.

## Resultado esperado

Con este diseño el usuario podra:

- ver el costo real de importacion por item;
- entender el costo global por pedimento;
- tener trazabilidad de gastos por orden y por pedimento;
- distribuir costos compartidos de forma consistente;
- calcular mejor margen y precio final de venta.

## Observacion final

La regla de negocio clave es que el pedimento no solo absorbe sus propios gastos, sino tambien los gastos de las ordenes que participaron en ese pedimento. Por eso el prorrateo debe hacerse sobre el universo completo de items ligados al pedimento, no solo sobre los items de una sola orden.
