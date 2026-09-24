# Changelog — Clientes y vendedores

Registro del avance, decisiones y validaciones del plan de clientes y vendedores.

## Convención de estados

- `Pendiente`: aún no implementado.
- `En progreso`: trabajo iniciado, con pendientes para completarlo.
- `Completado`: implementado y verificado según la evidencia registrada.
- `Por validar`: el plan documenta la implementación, pero falta confirmar el flujo de extremo a extremo.

## 2026-09-23

### Separación entre venta formalizada, cuenta por cobrar y pago — migración y despliegue realizados; validación pendiente

- Se ajustó el modelo objetivo: ganar una oportunidad cierra el proceso comercial, pero no crea automáticamente una venta ni registra ingresos.
- Se definió **Formalizar venta** como la acción que crea o activa el cliente y crea venta, partidas y cuenta por cobrar con saldo inicial igual al total.
- Los documentos de venta/cobro acompañan la operación; emitirlos no crea la venta ni registra un pago. Se distinguen solicitud de pago/proforma/orden, factura fiscal y recibo posterior al pago.
- Se añadió `cuentas_por_cobrar` al modelo objetivo y se separaron los estados de oportunidad, venta y cobranza.
- Se conserva un flujo rápido para formalizar y registrar un pago en el mismo recorrido, coordinando ambas operaciones.
- Para inmobiliarias se propone reutilizar el núcleo financiero, definiendo aparte los eventos y documentos propios del flujo inmobiliario.
- Se agregó la migración `20260923145927_sales_formalization_accounts_receivable.sql`, con `cuentas_por_cobrar`, saldo calculado, relación 1:1 por venta, migración de datos existentes y vínculo de pagos con la cuenta.
- Se agregaron los RPC de formalización sin pago, registro de pago sobre venta existente y el atajo transaccional de formalizar + pagar.
- Se agregaron endpoints separados, permisos de gestión de ventas con alcance propio/equipo/organización y acciones en la ficha del embudo.
- El atajo existente ahora crea cliente, venta, partidas y cuenta por cobrar antes de guardar el pago, dentro de la misma operación SQL.
- `/ventas` conserva compatibilidad con `ventas.estatus`; la migración a estados separados en la presentación y el detalle de cliente queda pendiente junto con documentos de cobro.
- **Validación local:** compilación Python y `git diff --check` pasaron. No se ejecutaron pruebas.
- **Supabase remoto (2026-09-23):** migración aplicada como `20260923151522_sales_formalization_accounts_receivable`. El primer intento fue revertido por códigos de roles inexistentes (`admin`, `supervisor`); se ajustó el catálogo predeterminado a los roles disponibles antes de reintentar.
- **Verificación remota:** existe `cuentas_por_cobrar`, `pagos.cuenta_por_cobrar_id` quedó obligatorio, se generaron 4 cuentas para las ventas existentes y los 3 RPC quedaron ejecutables por `service_role` pero no por `authenticated`.
- **Despliegue producción (2026-09-23):** panel publicado en el release `20260923_161750`; backend reiniciado desde el código actualizado.
- **Validación del despliegue:** TypeScript, ESLint y build Next.js completaron; ESLint reportó dos warnings ajenos a esta vista. Panel y API quedaron activos, `/ventas` respondió HTTP 200, `/api/health` respondió `{"status":"ok"}` y el endpoint de formalización respondió 401 sin sesión.
- **Pendiente:** validar con sesión autenticada formalización sin pago, pago parcial, liquidación y compra recurrente. La respuesta 401 confirma que el endpoint protege el acceso, pero no sustituye la prueba funcional autenticada.

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
