# Changelog — Clientes y vendedores

Registro del avance, decisiones y validaciones del plan de clientes y vendedores.

## Convención de estados

- `Pendiente`: aún no implementado.
- `En progreso`: trabajo iniciado, con pendientes para completarlo.
- `Completado`: implementado y verificado según la evidencia registrada.
- `Por validar`: el plan documenta la implementación, pero falta confirmar el flujo de extremo a extremo.

## 2026-09-23

### Sección independiente de Ventas — decisión de diseño

- Se propone agregar una sección de navegación `Ventas`, separada de `Clientes`.
- `Clientes` conserva su función actual como maestro de clientes y su detalle comercial.
- `Ventas` concentra el seguimiento financiero y comercial: ventas formalizadas, pagos confirmados, pagos parciales, saldo pendiente y ventas liquidadas.
- La vista de Ventas debe incluir indicadores, tendencias por periodo, tabla de operaciones y filtros por fechas, vendedor, estado de venta, estado de pago y moneda.
- Cada venta debe permitir consultar sus pagos y abrir el cliente relacionado.
- El alcance de datos será jerárquico: vendedor ve sus ventas; supervisor consulta a su equipo; nivel superior puede consultar la organización, sujeto a permisos del backend.
- Para preservar la atribución histórica, se propone guardar en `ventas` el vendedor responsable al formalizar la venta, en una columna explícita con relación a `usuarios`. La vista de clientes puede seguir mostrando el propietario actual.
- Estado: **decisión de producto documentada; implementación pendiente**.

## 2026-09-22

### Flujo de pago parcial y alta de cliente — validado por el usuario

- El usuario confirmó que probó el flujo y que funciona: el pago parcial confirmado crea o activa al cliente.
- Se puede cerrar la validación del caso de primera compra con pago parcial.
- Pendiente de confirmar por separado: liquidación del saldo y compra recurrente conservando el historial del cliente.

### Revisión del estado del plan — documentado

- Se confirmó la regla de negocio vigente: ganar una oportunidad o aceptar una cotización no crea por sí solo un cliente.
- El primer pago confirmado asociado a la venta crea o activa al cliente. Un pago parcial confirmado también cumple esta condición; la venta conserva el saldo pendiente y su estado parcial.
- La conversión manual legacy de oportunidad ganada a cliente está retirada.
- Según el estado de implementación documentado el 2026-09-12, ya están implementados la relación `oportunidades.cliente_id`, las tablas `ventas`, `venta_items` y `pagos`, la operación transaccional de pago confirmado y las vistas de lista y detalle comercial de clientes.
- La tabla de clientes presenta importes vendidos, cobrados y saldo pendiente; el detalle organiza oportunidades, cotizaciones, ventas, pagos y documentos.
- Estado global: **implementación principal reportada; validación integral pendiente**.

### Pendientes de seguimiento

- `Por validar`: recorrer el flujo completo de primera compra con pago parcial confirmado y verificar que se crea o activa el cliente, se registra la venta y se refleja correctamente el saldo.
- `Por validar`: completar el pago y comprobar la actualización de estado, cobrado y saldo.
- `Por validar`: recorrer la compra recurrente de un contacto o empresa que ya es cliente, conservando las oportunidades y ventas anteriores.
- `Por validar`: revisar los casos por contacto, empresa y cliente, además de métricas y reportes para separar oportunidades ganadas, ventas formalizadas, pagos parciales, ingresos cobrados y saldo pendiente.

### Referencia de estado anterior

El detalle de la implementación reportada al 2026-09-12 se conserva en
[`README.md`](README.md), sección 13. Este changelog registra el seguimiento a
partir de esta revisión y no sustituye esa descripción técnica.
