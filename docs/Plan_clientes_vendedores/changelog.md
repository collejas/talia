# Changelog — Clientes y vendedores

Registro del avance, decisiones y validaciones del plan de clientes y vendedores.

## Convención de estados

- `Pendiente`: aún no implementado.
- `En progreso`: trabajo iniciado, con pendientes para completarlo.
- `Completado`: implementado y verificado según la evidencia registrada.
- `Por validar`: el plan documenta la implementación, pero falta confirmar el flujo de extremo a extremo.

## 2026-09-23

### Sección de Ventas y reporte comercial — implementado en el repositorio

- Se agregó `/ventas` como sección independiente dentro de CRM; `/clientes` y su función de maestro se conservaron.
- La pantalla ofrece indicadores, gráfica mensual, filtros por periodo, vendedor, estado y moneda, y tabla paginada con acceso al historial del cliente.
- Las ventas se agrupan por fecha de venta; el cobrado del periodo y su serie se agrupan por fecha de confirmación de pagos, usando la zona horaria efectiva.
- Se agregó `GET /crm/ventas/reporte`; el backend aplica tenant y alcance antes de invocar la agregación SQL.
- Se añadieron `sales.view`, `sales.view_team` y `sales.view_all` a permisos predeterminados y roles actuales: vendedor, equipo supervisado y organización.
- La migración agrega `ventas.vendedor_usuario_id`, lo rellena desde el asignado actual de la oportunidad y captura el asignado al formalizar nuevas ventas.
- Verificación local: `py_compile` pasó para las rutas y el repositorio; TypeScript, ESLint, React Doctor (100/100) y `git diff --check` pasaron.
- Pendiente: aplicar la migración en Supabase y validar el flujo con usuarios autenticados de cada alcance. El acceso MCP de Supabase requiere reconexión, por lo que no se pudo verificar ni aplicar el SQL remoto.
- Límite histórico: la atribución de ventas anteriores al cambio se infiere de la asignación actual de la oportunidad; reasignaciones históricas no pueden reconstruirse desde el esquema revisado.
- Límite de reembolsos: el modelo conserva estado `reembolsado`, pero no un evento de reembolso separado con su fecha. El reporte considera pagos actualmente `confirmado` y no grafica movimientos de reembolso.

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
