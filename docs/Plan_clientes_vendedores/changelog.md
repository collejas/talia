# Changelog — Clientes y vendedores

## 2026-09-24 — Implementacion local de revision operativa y reserva por OC

- La bandeja de Operaciones ahora requiere marcar revision de cliente,
  evidencia y partidas antes de aprobar y liberar a surtido.
- Se creo una RPC transaccional para guardar la revision, formalizar venta y
  cuenta por cobrar y liberar el pedido. La ruta anterior de formalizacion
  directa devuelve conflicto para impedir que omita el checklist.
- Confirmar pedido con OC validada reserva stock fisico; sin OC no reserva en
  Comercial. La aprobacion reutiliza esa reserva o la crea una sola vez. Al
  reenviar sin OC se liberan las reservas anticipadas; una devolucion conserva
  la reserva mientras Comercial corrige el pedido.
- El atajo de pago desde cotizacion requiere ahora que Operaciones ya haya
  aprobado y formalizado el pedido.
- Se agrego la migracion local
  `20260924213308_order_review_and_oc_reservation.sql`. No esta aplicada a
  Supabase ni desplegada; falta validar sintaxis de migracion, flujo autenticado,
  permisos y balances antes de despliegue.

## 2026-09-24 — Reserva anticipada cuando Comercial valida una OC

- Se agrega una excepcion a la reserva: si Comercial recibe y valida una OC del
  cliente, al **Confirmar pedido** puede reservar unicamente el inventario
  fisico stockable.
- La reserva anticipada no formaliza venta, no crea cuenta por cobrar y no
  libera el pedido a Almacen. Operaciones aun debe revisar y aprobar.
- Sin OC validada, la reserva ocurre al aprobar y liberar a surtido. Esa
  aprobacion formaliza venta/cuenta por cobrar y conserva una reserva previa sin
  duplicarla.
- Si el pedido regresa a Comercial, la reserva se conserva mientras la OC siga
  vigente; cancelar el pedido o invalidar la OC libera lo reservado. Las
  unidades inmobiliarias se apartan al aprobar y no usan stock de almacen.
- Los tres planes relacionados se actualizaron. Esta decision es documental;
  no se modificaron codigo, base de datos ni permisos.

## 2026-09-24 — Flujo objetivo corregido: revision antes de formalizar

- Se establece el flujo vigente para los planes: Comercial pulsa **Confirmar
  pedido**, registra como confirmo el cliente y adjunta evidencia con OC o sin
  OC. El pedido pasa a revision y esta accion no crea venta ni cuenta por
  cobrar. Si Comercial valida una OC, puede reservar solo stock fisico.
- Operaciones revisa cliente, evidencia y partidas. Si detecta problemas usa
  **Regresar a Comercial** con el motivo; si todo esta correcto usa **Aprobar y
  liberar a surtido**.
- La aprobacion de Operaciones es el unico evento que formaliza/activa cliente
  y crea venta/cuenta por cobrar. Tambien reserva el stock cuando no exista ya
  una reserva anticipada por OC, sin duplicarla.
- Almacen recibe unicamente pedidos aprobados y liberados y registra entregas
  parciales o completas. Finanzas conserva su proceso independiente de pagos y
  documentos.
- Esta decision reemplaza el diseño anterior documentado en este changelog, en
  el que la confirmacion comercial ya formalizaba o en el que la accion de
  Operaciones se describia solo como confirmacion. El comportamiento desplegado
  todavia corresponde al flujo anterior; la alineacion de la aplicacion queda
  pendiente de implementacion y validacion autenticada.
- Los planes de clientes/vendedores, compras/inventarios y flujo integrado de
  propiedades se actualizaron para distinguir el flujo objetivo del estado
  actualmente desplegado. No se modificaron codigo, base de datos ni permisos.

## 2026-09-24

### Traspaso y colas operativas — desplegado; validacion autenticada pendiente

- Comercial ahora envia el pedido con su evidencia a formalizacion; no confirma venta ni reserva desde la oportunidad.
- La nueva bandeja de Operaciones permite revisar, devolver con motivo o confirmar; la confirmacion sigue usando la transaccion existente de cliente, venta, cuenta por cobrar y reserva.
- Se agrego una cola de Surtidos en Inventario y se retiro la accion de entrega del drawer comercial. El endpoint requiere `inventory.fulfillment.manage` y la consulta requiere `inventory.fulfillment.view`.
- La migracion `20260924185828_sales_order_handoff_permissions.sql` agrega estado de revision, historial auditable y capacidades al RBAC actual. Conserva `pendiente_confirmacion` para pedidos existentes.
- Las migraciones `20260924185828_sales_order_handoff_permissions.sql` y `20260924195100_sales_order_handoff_fk_indexes.sql` se aplicaron mediante MCP Supabase. Se verificaron tabla de eventos, columnas del estado de formalizacion y los cuatro permisos del catalogo; la revision posterior de Supabase no muestra claves foraneas de este bloque sin indice de cobertura.
- Despliegue de produccion completado con release atomico `20260924_191718`; API y panel activos. `/api/health`, `/ventas/pedidos` y `/inventario/surtidos` respondieron HTTP 200; OpenAPI publica las cinco rutas nuevas de pedidos. El API se reinicio correctamente.
- TypeScript, ESLint y build de produccion pasaron; ESLint reporto dos advertencias en `tenant-email-service-panel.tsx` y `property-map.jsx`, ajenas a este cambio. React Doctor (100/100), `py_compile` y `git diff --check` tambien pasaron antes del despliegue.
- Pendiente validar con usuarios autenticados de Comercial, Operaciones y Almacen el envio, devolucion, reenvio, confirmacion, permisos por tenant y entrega parcial/total. Las respuestas HTTP 200 comprueban el despliegue de paginas, no el flujo autenticado completo.

### Priorizacion del siguiente bloque del refactor — documentado

- Se actualizo la hoja de ruta para distinguir las capacidades ya desplegadas del trabajo operativo pendiente.
- Orden acordado: envio Comercial a formalizacion; capacidades especificas en el RBAC existente; bandeja de revision/confirmacion de Operaciones; cola de surtidos en Inventario; validacion autenticada por rol y tenant.
- Documentos de cobro, vencimiento de reservas, politicas de liberacion por anticipo/credito y el hito contractual inmobiliario quedan como etapas posteriores, no como bloqueadores del traspaso inicial.

### Separacion de responsabilidades y traspasos — documentado

- Se define que Comercial trabaja la oportunidad/cotizacion y envia el pedido a formalizacion; Operaciones/Administracion revisa y confirma; Almacen atiende la cola de surtidos; Finanzas lleva cobranza y documentos.
- La confirmacion administrativa queda como frontera transaccional para crear/activar cliente, venta, cuenta por cobrar y reserva de productos stockables. El surtido fisico ocurre despues desde una vista de Inventario.
- El drawer de oportunidad conserva consulta del progreso y enlace `Ver pedido`; no es el centro operativo de confirmacion ni de entregas. `/clientes` conserva su alcance.
- Se reutilizara el RBAC existente por organizacion y roles configurables, sin permisos inferidos de nombres de puesto. El catalogo base no ofrece capacidad de surtido: `sales.manage` tambien se asigna a agentes/finanzas y `settings.manage` es demasiado amplio.
- Se documenta agregar capacidades acotadas al catalogo RBAC actual para enviar/confirmar pedidos y ver/gestionar surtidos; sus asignaciones predeterminadas quedan por definir antes de la implementacion.
- Hallazgo correctivo: la entrega desplegada quedo dentro del drawer de oportunidad y autorizada con `sales.manage`. No respeta la separacion acordada; retirar esa accion del alcance comercial y protegerla con la capacidad de inventario antes de considerar el surtido listo para uso.
- Plan actualizado en clientes/vendedores, compras/inventarios y el flujo integrado de propiedades.

### Entrega parcial y salida de inventario — desplegada, validación autenticada pendiente

- Se agregó la migración `20260924031112_sales_order_fulfillment.sql` y se aplicó en Supabase mediante MCP.
- Se modelaron encabezados y renglones de entrega con claves foráneas explícitas a pedido, renglón, reserva, producto y almacén.
- La función transaccional consume solo la cantidad surtida: descuenta existencia física y reserva, crea el movimiento `salida_venta` y mantiene trazabilidad hasta el renglón entregado.
- Se agregó estado logístico separado de venta y cobranza; el pedido puede quedar pendiente, parcial o entregado. Servicios sin control de inventario quedan como `no_aplica`.
- La liberación de inventario ahora opera sobre el remanente no surtido para preservar balances si una reserva tuvo entregas parciales.
- Se conectaron endpoint, repositorio, proxy del panel y modal para registrar entrega parcial o total por renglón; la ubicacion y el permiso del modal quedaron identificados como incorrectos para el modelo de responsabilidades y requieren correccion.
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
