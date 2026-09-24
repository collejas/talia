# Changelog — Clientes y vendedores

## 2026-09-24

### Entrega parcial y salida de inventario — desplegada, validación autenticada pendiente

- Se agregó la migración `20260924031112_sales_order_fulfillment.sql` y se aplicó en Supabase mediante MCP.
- Se modelaron encabezados y renglones de entrega con claves foráneas explícitas a pedido, renglón, reserva, producto y almacén.
- La función transaccional consume solo la cantidad surtida: descuenta existencia física y reserva, crea el movimiento `salida_venta` y mantiene trazabilidad hasta el renglón entregado.
- Se agregó estado logístico separado de venta y cobranza; el pedido puede quedar pendiente, parcial o entregado. Servicios sin control de inventario quedan como `no_aplica`.
- La liberación de inventario ahora opera sobre el remanente no surtido para preservar balances si una reserva tuvo entregas parciales.
- Se conectaron endpoint, repositorio, proxy del panel y modal para registrar entrega parcial o total por renglón.
- API y panel desplegados. `py_compile`, ESLint, TypeScript, build de producción y `git diff --check` pasaron; ESLint dejó dos advertencias existentes fuera de los archivos modificados.
- `/api/health` y `/ventas` responden HTTP 200; el nuevo endpoint rechaza solicitudes sin sesión con 401. Pendiente el recorrido autenticado y revisar que una entrega parcial y una total persistan correctamente el balance de existencias/reservas.
- Continúan pendientes la cancelación logística de pedidos ya confirmados y definir el evento contractual inmobiliario que cambia una unidad a vendida.

Registro del avance, decisiones y validaciones del plan de clientes y vendedores.

## Convención de estados

- `Pendiente`: aún no implementado.
- `En progreso`: trabajo iniciado, con pendientes para completarlo.
- `Completado`: implementado y verificado según la evidencia registrada.
- `Por validar`: el plan documenta la implementación, pero falta confirmar el flujo de extremo a extremo.

## 2026-09-24

### Corrección del 502 al cargar cotizaciones

- Los logs de Supabase identificaron `permission denied for table pedidos_venta`: la consulta de cotizaciones, ejecutada con el token autenticado del usuario, intentaba incluir pedidos protegidos para el backend.
- Se quitó esa relación de la consulta bajo RLS. El backend ahora enriquece únicamente las cotizaciones ya devueltas al usuario, filtrando además por organización y sus IDs, mediante `service_role`; no se amplió el acceso directo de `authenticated` ni de `anon`.
- **Desplegado (2026-09-24):** API reiniciada; `/api/health` responde HTTP 200 y el endpoint de cotizaciones rechazó sin sesión con HTTP 401. Compilación Python y `git diff --check` pasaron.
- **Por validar con sesión:** volver a abrir la oportunidad afectada y confirmar que carga sus cotizaciones y el resumen del pedido. La cookie de sesión compartida en el reporte no se reutilizó.

### Pedido confirmado, reserva de inventario y propagación del catálogo — desplegado; validación funcional pendiente

- Aceptar una cotización o ganar una oportunidad no reserva existencias.
- Se decidió modelar el pedido del cliente con entidad propia: `pedidos_venta` y `pedido_venta_items`; no se agregará el ciclo de pedido dentro de `ventas.estatus`.
- Una cotización aceptada puede crear un pedido pendiente de confirmación. La confirmación explícita del compromiso del cliente —normalmente respaldada por su orden de compra recibida y validada— formaliza venta y cuenta por cobrar y reserva productos stockables en una operación coordinada.
- En v1, cada pedido confirmado genera una venta y una cuenta por cobrar; la venta tendrá referencia única al pedido. La orden de compra del cliente es evidencia del pedido y no debe confundirse con `ordenes_compra` a proveedores.
- Estados iniciales del pedido: `borrador`, `pendiente_confirmacion`, `confirmado` y `cancelado`. Cambios a partidas confirmadas requieren una operación controlada.
- El formulario distingue OC y confirmacion sin OC: OC, cotizacion firmada/aceptada, correo, WhatsApp, contrato, confirmacion verbal u otro. Un anticipo se registra por el flujo de pago inmediato, no como etiqueta que simule un pago.
- La OC del cliente se puede adjuntar al pedido como PDF privado de hasta 10 MB. Para confirmar con OC se requiere numero o archivo. Fecha, referencia y observaciones son columnas del pedido; el usuario confirmador y el vendedor provienen de la sesion y de la asignacion existente.
- Reservar aumenta el stock reservado y reduce el disponible; no reduce la existencia física. La salida ocurre al entregar/embarcar y libera la reserva.
- Pagos, facturas y proformas pertenecen al estado financiero/documental y no descuentan existencias.
- Las propiedades mantienen disponibilidad por unidad y no usan el inventario de almacén; pedido confirmado aparta/reserva y un hito contractual posterior marca vendido.
- Las partidas del pedido conservarán relaciones explícitas y tenant-safe con cotización, `catalog_item_id` y, cuando aplique, `propiedad_id` y `unidad_id`; el vínculo debe propagarse hasta `venta_items`.
- Las propiedades se apartan por estado de unidad, sin movimientos de almacén, y se marcan vendidas al cumplirse el hito contractual acordado.
- **Implementado en la base de datos remota:** `pedidos_venta`, `pedido_venta_items`, relaciones explícitas con ventas/reservas y los RPC para crear, cancelar, confirmar pedido y confirmar pedido con pago inmediato.
- **Implementado:** aceptar una cotización ya no intenta reservar existencias; genera un pedido pendiente. Confirmarlo formaliza venta y cuenta por cobrar, enlaza `catalog_item_id` a `venta_items`, reserva stock y aparta unidades de propiedad cuando aplica. La acción rápida con pago conserva una sola operación transaccional.
- La migración `20260924015415_pedidos_venta_flujo_confirmacion.sql` se aplicó al Supabase remoto. La migración `20260924021025_pedidos_venta_fk_indexes.sql` agregó índices de cobertura para claves foráneas de las nuevas relaciones y también se aplicó.
- **Verificación remota:** las tablas tienen RLS y política de acceso para `service_role`; los cuatro RPC niegan ejecución a `anon` y `authenticated` y la permiten a `service_role`.
- **Verificación local:** compilación Python, ESLint, TypeScript y `git diff --check` pasaron. ESLint conserva un warning preexistente en `property-map.jsx` por dependencias de `useCallback`.
- **Despliegue (2026-09-24):** panel y backend activos en el release `20260924_021215`; el script atómico completó TypeScript, lint, build y reinicio de ambos servicios. `/api/health` y `/ventas` respondieron HTTP 200; la ruta de formalización devuelve 401 sin sesión.
- **Pendiente:** validar con sesión autenticada cotización aceptada, pedido pendiente, confirmación con y sin pago, inventario insuficiente, cancelación y unidad inmobiliaria; diseñar después la entrega/salida física. El ciclo de contrato y el hito que marca propiedad como vendida permanecen por definir.
- **Implementado en esta iteracion (2026-09-24):** forma y fecha de confirmacion, observaciones, numero/fecha de OC, carga privada de PDF de OC y apertura mediante URL firmada de cinco minutos. La migracion `20260924023710_pedidos_venta_confirmation_evidence.sql` se aplico al Supabase remoto; `20260924024700_pedido_venta_documentos_fk_index.sql` agrega el indice del usuario que subio el archivo.
- **Seguridad verificada en Supabase:** RLS habilitado para `pedido_venta_documentos`; solo `service_role` tiene permisos de tabla y puede ejecutar los dos RPC nuevos. `anon` y `authenticated` no pueden ejecutarlos. El asesor no reporto hallazgos asociados a esta tabla; persisten avisos globales preexistentes en el esquema.
- **Despliegue (2026-09-24):** backend y panel activos; release `20260924_024855`. El build de produccion, TypeScript y lint terminaron sin errores. `/api/health` y `/ventas` respondieron HTTP 200; los endpoints BFF de carga y consulta del documento rechazaron solicitudes sin sesion con HTTP 401.
- **Pendiente de validacion funcional:** probar con sesion autenticada confirmacion con OC, sin OC, consulta del PDF, rechazo de archivos invalidos y permisos por vendedor. La carga admite PDF solamente en esta primera iteracion; otros tipos de evidencia quedan para una ampliacion posterior.
- ESLint reporto dos advertencias preexistentes en `tenant-email-service-panel.tsx` y `property-map.jsx`; no bloquean este cambio.
- El asesor de rendimiento aún muestra avisos existentes en el esquema global; las claves foráneas nuevas detectadas sin índice quedaron cubiertas por la segunda migración. Los avisos de índices nuevos sin uso son esperables antes de tráfico representativo.
- Políticas configurables por tenant y vencimientos de reserva quedan para fases posteriores.

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
