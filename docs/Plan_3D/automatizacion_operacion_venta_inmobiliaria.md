# Automatización de la operación y venta inmobiliaria

Fecha: 2026-10-19 (UTC)  
Estado: Diseño funcional pendiente de implementación

## Objetivo

Automatizar el flujo que inicia desde la vista de **Propiedades**, evitando que
el agente tenga que crear manualmente operaciones, cotizaciones, pedidos y
ventas en módulos separados.

La automatización debe conservar la diferencia entre:

- Un bloqueo temporal de una unidad.
- Una formalización inmobiliaria.
- Una venta formal registrada en el CRM.

La cotización se crea automáticamente cuando corresponde, pero el usuario no
debe tener que navegar a la vista de Cotizaciones para iniciar la operación.

## Decisión funcional

La cotización no debe ser requisito para iniciar un **Reservado**. El reservado
es un bloqueo temporal y puede comenzar desde la ficha de una unidad.

La cotización sí debe existir antes de crear una venta formal. Para mantener la
trazabilidad, Tal-IA la crea automáticamente y la utiliza como documento
comercial interno del flujo.

```text
Disponible
    |
    | Reservar
    v
Reservado
Operación temporal + cotización en borrador
    |
    | Formalizar apartado
    v
Apartado
Operación formal + cotización aceptada + pago/documentos
    |
    | Preparar cierre
    v
Pedido de venta
    |
    | Confirmar cierre
    v
Vendido
Venta formal + cliente + cuenta por cobrar + historial
```

## Comportamiento esperado de cada botón

### Reservado

El botón debe:

1. Solicitar cliente, plazo, forma de compra y motivo.
2. Crear o reutilizar la oportunidad comercial del cliente.
3. Crear una operación inmobiliaria en estado temporal.
4. Crear una cotización en estado `borrador`, asociada a la unidad y al
   `catalog_item`.
5. Cambiar la unidad a `reservado`.
6. Registrar el movimiento de estado y la fecha de vencimiento.

El reservado no debe crear una venta, un pedido confirmado ni un cliente
convertido.

### Apartado

El botón debe reutilizar la operación temporal y solicitar únicamente los datos
que falten:

- Compradores definitivos.
- Precio acordado.
- Forma de adquisición.
- Importe y comprobante de pago.
- Contrato y documentos requeridos.
- Fecha límite y condiciones de cancelación.

Al confirmar los requisitos:

1. La operación pasa a formalización inmobiliaria.
2. La cotización en borrador se actualiza con el precio y condiciones finales.
3. La cotización pasa a `aceptada` únicamente cuando corresponda según la
   validación del tenant.
4. La unidad pasa a `apartado`.
5. Se registra el movimiento y se conserva el expediente documental.

El apartado todavía no debe crear una venta formal si el cierre comercial no ha
sido confirmado.

### Preparar cierre

El botón debe reutilizar la cotización aceptada y:

1. Validar cliente, oportunidad, unidad, precio y moneda.
2. Crear o reutilizar el pedido de venta.
3. Copiar al pedido la unidad, propiedad, catálogo, cantidad y precio.
4. Mostrar en la vista de Ventas que el pedido está pendiente de confirmación.

Esta acción prepara el cierre, pero no debe marcar la unidad como vendida ni
crear una segunda venta.

### Finalizar venta

La confirmación del pedido debe ejecutar una operación transaccional que:

1. Formalice o reutilice la venta asociada a la cotización.
2. Cree o reutilice el cliente del CRM.
3. Cree la cuenta por cobrar.
4. Registre el pago confirmado, si se captura en el mismo flujo.
5. Vincule `venta_items` con `pedido_venta_items`.
6. Conserve `propiedad_id`, `unidad_id` y `catalog_item_id`.
7. Cambie la unidad a `vendido`.
8. Registre el movimiento `apartado/reservado -> vendido`.
9. Actualice el expediente inmobiliario y la fecha de cierre.

La operación debe ser idempotente: repetir la confirmación no debe crear otra
venta, otro cliente ni otro movimiento de cierre.

## Reglas de negocio

- `Reservado` no equivale a venta.
- `Apartado` representa un compromiso formal, pero no necesariamente una venta
  cerrada.
- Una venta formal siempre debe tener una cotización aceptada y una oportunidad
  ganada.
- Una unidad no puede tener dos pedidos confirmados activos.
- Una unidad `vendido` no puede volver a entrar al flujo comercial desde los
  botones normales.
- Las unidades patrimoniales quedan fuera de este flujo.
- Toda transición debe validar tenant, permisos, disponibilidad y ownership.
- Toda transición debe guardar historial; cancelar o liberar no debe borrar la
  operación anterior.

## Relaciones que deben conservarse

La trazabilidad mínima de una operación inmobiliaria es:

```text
cliente/persona
   └── oportunidad
         └── cotización
               └── cotización_item
                     └── pedido_venta_item
                           └── venta_item
                                 └── propiedad_unidad
```

La relación debe utilizar columnas y foreign keys existentes o explícitas. La
metadata puede conservar atributos variables, pero no debe ser la única fuente
para `propiedad_id`, `unidad_id`, `catalog_item_id`, precio, estado o relaciones
comerciales.

## Situación actual detectada

La implementación actual está parcialmente automatizada:

- `Reservado` crea una operación y cambia el estado de la unidad, pero permite
  iniciar sin cotización.
- `Apartado` guarda el expediente inmobiliario y cambia el estado, pero no
  termina de conectar automáticamente todo el flujo comercial.
- `Preparar cierre` crea una cotización aceptada y la deja lista para pedido.
- La confirmación del pedido crea la venta formal, pero debe completar la
  actualización final de la unidad a `vendido` y la trazabilidad de la partida
  inmobiliaria.
- Los reportes de Clientes y Ventas ya están preparados para mostrar ventas
  inmobiliarias cuando existen partidas de venta vinculadas a una unidad.

## Plan de implementación

### Fase 1: normalizar el inicio desde Propiedades

- Crear o reutilizar oportunidad automáticamente.
- Crear cotización en borrador para `Reservado`.
- Evitar cotizaciones duplicadas por oportunidad y unidad.
- Mantener la operación inmobiliaria como fuente del estado temporal.

### Fase 2: conectar Apartado con la cotización

- Reutilizar la cotización creada en `Reservado`.
- Actualizar sus partidas y precio.
- Aceptarla solo al cumplir las reglas de formalización.
- Mostrar el número de cotización en el expediente.

### Fase 3: automatizar la preparación del cierre

- Crear el pedido desde el botón `Preparar cierre`.
- Mostrar el pedido en la cola de Ventas.
- Evitar que el agente tenga que volver a seleccionar la cotización.

### Fase 4: cerrar la venta de extremo a extremo

- Confirmar pedido y venta en una operación transaccional.
- Cambiar la unidad a `vendido`.
- Vincular todas las partidas inmobiliarias.
- Actualizar Clientes, Ventas y el historial de movimientos.
- Probar reintentos e idempotencia.

## Criterio de aceptación

Una operación se considera correctamente automatizada cuando el usuario puede
realizar el flujo desde la unidad seleccionada y, al finalizar el cierre:

- existe una sola cotización;
- existe un solo pedido confirmado;
- existe una sola venta formal;
- el comprador aparece como cliente;
- la venta aparece en `Ventas`;
- la compra aparece en el historial del cliente;
- la unidad aparece como `vendido`;
- el historial conserva todos los cambios;
- no se crean registros duplicados al repetir una acción.

## Documentos relacionados

- [Plan de operaciones inmobiliarias](./plan_operaciones_inmobiliarias_apartado_reservado_vendido.md)
- [Plan de ventas integradas](./plan_ventas_integradas.md)
- [Ventas asociadas a leads y clientes](./ventas_asociadas_leads_clientes.md)
- [Validación del apartado inmobiliario](./validacion_apartado_inmobiliario.md)
