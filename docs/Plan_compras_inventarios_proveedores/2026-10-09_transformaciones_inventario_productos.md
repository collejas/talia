# Plan: transformaciones de inventario y productos vendibles

**Fecha:** 2026-10-09  
**Estado:** Propuesta funcional y técnica; sin cambios implementados.

## Objetivo

Permitir que un tenant compre un producto base, lo transforme y venda tanto
el producto original como uno o varios productos resultantes, sin duplicar
existencias ni perder la trazabilidad del costo y del movimiento físico.

Ejemplo:

```text
Compra:          P1 = 200 piezas
Transformación:  consume P1 y produce Producto A, B o C
Venta directa:   P1 puede seguir vendiéndose mientras conserve existencia
```

La funcionalidad debe aplicar inicialmente al tenant
`3dbb2a99-9d81-4233-8444-0990d53b93b3`, pero diseñarse como capacidad general
por organización.

## Decisión funcional

`P1` y cada producto transformado son `catalog_items` distintos y tienen
existencias independientes.

Una transformación no cambia el nombre de `P1`; registra un consumo de `P1` y
una producción de los artículos resultantes.

Ejemplo:

```text
Existencia inicial:
- P1: 200

Transformación:
- consume P1: 80
- produce Producto A: 30
- produce Producto B: 50

Existencia posterior:
- P1: 120
- Producto A: 30
- Producto B: 50
```

La venta de `P1` descuenta `P1`. La venta de `Producto A` o `Producto B`
descuenta el inventario específico del producto transformado.

Una cantidad de `P1` consumida por una transformación no puede venderse de
nuevo como `P1`.

## Alcance de Operaciones

La funcionalidad se ubicará en el botón o sección **Operaciones**, junto con
las tareas que modifican físicamente el inventario:

```text
Operaciones
├── Inventario
├── Recepciones
├── Transformaciones
│   ├── Ejecutar transformación
│   ├── Fórmulas
│   └── Historial
└── Surtidos
```

La ubicación exacta de la ruta debe reutilizar la navegación operativa
existente. No debe colocarse dentro de Ventas ni mezclarse con la creación de
órdenes de compra.

## Conceptos del dominio

### Producto de abastecimiento

Es el producto que se compra y entra al almacén. Puede ser vendible
directamente y también puede utilizarse como componente de una transformación.

Ejemplo: `P1`.

### Producto transformado

Es el producto que se produce mediante una transformación y se vende con su
propio nombre, código, unidad, precio y existencia.

Ejemplos: `Producto A`, `Producto B` y `Producto C`.

### Fórmula

Es la definición reutilizable de una transformación. Indica sus componentes,
salidas, cantidades, unidades, merma y distribución de costos.

### Orden de transformación

Es la ejecución real de una fórmula en una fecha y almacén determinados. Debe
tener estados, responsable y movimientos auditables.

## Fórmulas

La pantalla **Operaciones → Transformaciones → Fórmulas** debe permitir:

- crear y editar una fórmula;
- seleccionar uno o varios componentes del catálogo;
- definir cantidad y unidad requerida de cada componente;
- seleccionar una o varias salidas;
- definir cantidad y unidad producida;
- registrar merma esperada;
- definir distribución de costo entre las salidas;
- versionar o desactivar una fórmula;
- consultar quién la creó y cuándo fue modificada.

Ejemplo de fórmula simple:

```text
Fórmula: Ensamble Producto A

Entrada:
- P1: 1 pieza

Salida:
- Producto A: 1 pieza
```

Ejemplo de coproductos:

```text
Entrada:
- P1: 10 piezas

Salidas:
- Producto A: 6 piezas
- Producto B: 3 piezas
- Merma: 1 pieza
```

## Ejecución de una transformación

La pantalla **Operaciones → Transformaciones → Ejecutar transformación** debe
permitir seleccionar:

- fórmula y versión;
- cantidad a producir o número de lotes;
- almacén de origen;
- almacén de destino;
- fecha de operación;
- lotes y series cuando el producto los requiera;
- observaciones y documento de referencia.

Antes de confirmar, el sistema debe mostrar un resumen de entradas y salidas:

```text
Se consumirá:
- P1: 50 piezas

Se producirá:
- Producto A: 50 piezas
```

La confirmación debe ser transaccional. Debe validar existencia disponible,
crear los movimientos de salida y entrada, actualizar existencias y dejar la
orden en estado ejecutado. No debe actualizar saldos directamente desde el
frontend.

## Estados de la orden

Estados iniciales recomendados:

- `borrador`;
- `confirmada`;
- `ejecutada`;
- `cancelada`.

Una orden ejecutada no debe editarse directamente. Las correcciones deben
realizarse mediante una reversa controlada o una nueva transformación inversa,
con motivo y auditoría.

## Modelo de datos propuesto

La información estructural debe almacenarse en columnas y relaciones reales,
no en `metadata` o `jsonb`.

### `transformaciones`

Encabezado de la fórmula:

- `id`;
- `organizacion_id`;
- `codigo`;
- `nombre`;
- `version`;
- `estado`;
- `unidad_produccion`;
- `cantidad_produccion`;
- `merma_esperada`;
- `activo`;
- `creado_por`;
- `creado_en`;
- `actualizado_en`.

### `transformacion_componentes`

Entradas requeridas por la fórmula:

- `id`;
- `organizacion_id`;
- `transformacion_id`;
- `catalog_item_id`;
- `cantidad_requerida`;
- `unidad`;
- `porcentaje_merma`;
- `orden`.

### `transformacion_salidas`

Productos generados por la fórmula:

- `id`;
- `organizacion_id`;
- `transformacion_id`;
- `catalog_item_id`;
- `cantidad_producida`;
- `unidad`;
- `porcentaje_costo`;
- `es_merma`.

### `ordenes_transformacion`

Ejecución de una fórmula:

- `id`;
- `organizacion_id`;
- `transformacion_id`;
- `almacen_origen_id`;
- `almacen_destino_id`;
- `estado`;
- `fecha_operacion`;
- `usuario_responsable_id`;
- `observaciones`;
- `creado_en`;
- `ejecutado_en`.

### `ordenes_transformacion_componentes`

Snapshot de lo realmente consumido:

- `id`;
- `organizacion_id`;
- `orden_transformacion_id`;
- `catalog_item_id`;
- `cantidad_consumida`;
- `unidad`;
- `costo_unitario`;
- `lote`;
- `serie`.

### `ordenes_transformacion_salidas`

Snapshot de lo realmente producido:

- `id`;
- `organizacion_id`;
- `orden_transformacion_id`;
- `catalog_item_id`;
- `cantidad_producida`;
- `unidad`;
- `costo_unitario`;
- `lote`;
- `serie`;
- `es_merma`.

## Movimientos de inventario

La operación debe conservar una única fuente de verdad en
`inventario_existencias` e `inventario_movimientos`.

Se deben agregar tipos explícitos de movimiento, por ejemplo:

- `consumo_transformacion`;
- `produccion_transformacion`;
- `merma_transformacion`;
- `reversa_consumo_transformacion`;
- `reversa_produccion_transformacion`.

Cada movimiento debe referenciar la orden mediante:

```text
referencia_tipo = orden_transformacion
referencia_id   = ordenes_transformacion.id
```

La implementación debe revisar primero la restricción actual de tipos de
`inventario_movimientos` y el historial de migraciones antes de agregar nuevos
valores.

## Costos

Cuando una transformación produce una sola salida, el costo puede heredarse
del consumo más los costos adicionales que se incorporen posteriormente.

Cuando produce varias salidas, cada salida debe tener un
`porcentaje_costo` explícito. La suma de las salidas no marcadas como merma
debe validarse según la regla de negocio definida para la fórmula.

La primera versión debe soportar distribución manual y conservar el costo
histórico en las líneas de la orden y en los movimientos. No se debe depender
del costo vigente actual del catálogo para reconstruir operaciones pasadas.

## Compras, ventas y listas de precios

- Las órdenes de compra siguen comprando `P1` mediante `catalog_item_id`.
- Las recepciones incrementan el inventario de `P1`.
- Las fórmulas producen otros `catalog_item_id`.
- Las ventas pueden referenciar `P1` o cualquier producto transformado.
- Las listas de precios se mantienen sobre los productos vendibles.
- Los alias comerciales solo aplican cuando no existe transformación física.
- Un alias no debe crear inventario adicional ni ocultar el producto real.

## Permisos

Se proponen permisos separados:

- `inventory.transformations.view`;
- `inventory.transformations.manage`;
- `inventory.transformations.execute`;
- `inventory.transformations.reverse`;
- `inventory.transformations.costs.view`.

El backend debe validar organización, usuario y permiso. Ocultar la opción del
menú no es suficiente para proteger la operación.

## API y frontend

La implementación debe reutilizar las rutas, repositorios y componentes de
inventario existentes, sin crear un saldo paralelo.

Rutas conceptuales:

```text
GET    /crm/operacion/transformaciones
POST   /crm/operacion/transformaciones
PATCH  /crm/operacion/transformaciones/{id}
GET    /crm/operacion/transformaciones/{id}
POST   /crm/operacion/transformaciones/{id}/ejecutar
POST   /crm/operacion/transformaciones/{id}/cancelar
GET    /crm/operacion/transformaciones/historial
```

Los contratos deben usar schemas Pydantic separados para fórmula, ejecución,
lectura, cancelación y reversa. Las cantidades, unidades, productos y
almacenes deben validarse en backend.

## Fases de implementación

1. Confirmar productos base y transformados del tenant.
2. Definir tipos de producto, unidades y reglas de merma.
3. Crear tablas, foreign keys, índices, constraints y permisos.
4. Crear el maestro de fórmulas.
5. Crear la ejecución transaccional de transformaciones.
6. Integrar movimientos, existencias, lotes, series y costos.
7. Integrar reservas, surtidos y ventas sobre productos transformados.
8. Agregar historial, reversas y reportes.
9. Agregar importación masiva de fórmulas si el tenant lo necesita.
10. Activar la funcionalidad inicialmente para el tenant objetivo y validarla
    con usuarios autenticados.

## Criterios de aceptación

- Se puede comprar y recibir `P1`.
- Se puede vender directamente `P1`.
- Se puede definir una fórmula que use `P1`.
- Se puede ejecutar una transformación sin permitir existencia negativa.
- La transformación disminuye `P1` y aumenta los productos resultantes.
- Los productos resultantes pueden venderse y reservarse individualmente.
- El inventario no se duplica entre `P1` y sus transformados.
- Una transformación ejecutada queda auditada con usuario, fecha, almacén,
  entradas, salidas, costos y referencia.
- Una reversa restaura correctamente las cantidades sin sobrescribir el
  historial original.
- Todas las consultas y mutaciones están aisladas por `organizacion_id`.
- La operación funciona desde **Operaciones** y no depende de Compras o Ventas
  para ejecutarse.
- La información estructural no se guarda en `metadata` o `jsonb`.

## Pendientes de definición

- Nombre final de la sección: `Operaciones` u `Operación`.
- Si la fórmula produce una salida principal o coproductos.
- Regla de distribución de costos.
- Reglas de merma permitidas.
- Manejo de lotes y series durante la transformación.
- Si se permiten transformaciones entre almacenes distintos.
- Si se requiere reversa total o también reversa parcial.
- Formato de importación masiva de fórmulas.
