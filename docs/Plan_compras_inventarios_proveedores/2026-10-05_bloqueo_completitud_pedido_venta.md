# Bloqueo de completitud antes de enviar pedidos a revisión

Fecha: 2026-10-05  
Módulo: ventas, pedidos de venta, inventario y revisión operativa

## Objetivo

Evitar que una oportunidad incompleta llegue a la cola de revisión de
Operaciones. La acción **Confirmar pedido** ahora comienza mostrando un resumen
de completitud y solo permite continuar cuando los cuatro bloques comerciales
están completos.

## Regla funcional

La oportunidad debe cumplir los cuatro bloques siguientes:

1. **Cliente y facturación**
   - Cuenta CRM asociada.
   - Razón social.
   - RFC.
   - Correo de facturación.
   - Código postal fiscal.
   - Uso de CFDI.
   - Forma de pago.
   - Método de pago.
2. **OC confirmada y evidencias**
   - Forma de confirmación.
   - Evidencia verificable asociada al medio de confirmación.
   - Si el medio es una orden de compra, número de OC o referencia equivalente
     en la evidencia.
3. **Datos de entrega**
   - Se valida cuando existen partidas que manejan inventario.
   - La dirección debe estar completa conforme al snapshot del pedido.
   - Para servicios o partidas sin inventario, el bloque no aplica.
4. **Productos y cantidades**
   - Debe existir al menos una partida.
   - Las partidas del pedido deben coincidir con la cotización aceptada.
   - Se comparan producto, cantidad y vínculo con catálogo.

La falta de cualquiera de estos bloques impide enviar el pedido a revisión.
El bloqueo se aplica tanto en la interfaz como en el procedimiento de base de
datos, por lo que no depende únicamente del frontend.

## Flujo comercial actualizado

1. El vendedor pulsa **Confirmar pedido** desde la oportunidad.
2. El panel abre un único modal de **Confirmar pedido**, consulta la
   completitud y muestra el resumen de los cuatro bloques.
3. Los bloques incompletos muestran los datos faltantes.
4. En ese mismo modal se captura la forma de confirmación, referencia, fecha,
   notas o archivo admitido.
5. Mientras existan datos comerciales incompletos, se mantiene bloqueado
   **Confirmar pedido**.
6. El botón **Confirmar pedido** guarda la evidencia y envía el pedido a la
   cola de revisión en la misma acción; no se abre un segundo modal.
7. Operaciones revisa visualmente la información, utiliza sus checkboxes y
   puede devolver o aprobar/liberar el pedido.
8. La aprobación elevada continúa siendo la acción que formaliza la venta,
   crea la cuenta por cobrar y libera el pedido al flujo de surtido.

## Vista `ventas/pedidos`

La ruta conserva una sola vista, con comportamiento condicionado por permiso:

- Usuarios con `sales.orders.confirm` ven la cola operativa completa, los
  checkboxes, la devolución y **Aprobar y liberar**.
- Vendedores con `sales.orders.submit` ven únicamente sus pedidos asignados,
  con el estado de los cuatro bloques y el detalle informativo.
- El vendedor no ve checkboxes, devolución, aprobación ni liberación.
- El filtrado de pedidos asignados se aplica en backend usando el alcance de la
  oportunidad; no se confía solamente en ocultar controles del frontend.

## Implementación técnica

### Base de datos

Migración local:

`supabase/migrations/20261005090000_sales_order_submission_readiness.sql`

`supabase/migrations/20261005100000_sales_order_billing_fields_readiness.sql`

La segunda migración incorpora Uso de CFDI, Forma de pago y Método de pago a
la validación obligatoria de Cliente y facturación.

Funciones involucradas:

- `public.crm_obtener_completitud_pedido_venta(...)`
  - Devuelve los cuatro booleanos de completitud y sus listas de faltantes.
  - Crea el pedido borrador si todavía no existe.
  - Respeta el tenant recibido por `organizacion_id`.
- `public.crm_enviar_pedido_a_formalizacion(...)`
  - Reutiliza la misma evaluación de completitud.
  - Lanza `sales_order_completeness_incomplete` si el pedido no está completo.
  - Conserva las validaciones de cotización aceptada y oportunidad ganada.
  - Conserva la reserva anticipada para OC y la liberación al cambiar de base
    de confirmación cuando corresponde.

La migración fue aplicada en Supabase. Las funciones se mantienen restringidas
a `service_role`; el acceso público ocurre únicamente a través de endpoints
autenticados y autorizados.

### Backend

Archivo principal:

`backend/app/api/routes/crm.py`

Cambios:

- Nuevo endpoint autenticado:
  `POST /crm/cotizaciones/{cotizacion_id}/pedido/completitud`.
- El endpoint valida el permiso `sales.orders.submit` y el alcance del vendedor
  sobre la oportunidad.
- El endpoint de envío traduce el bloqueo de base de datos a HTTP 409 con
  `pedido_incompleto_para_revision`.
- La cola de formalización acepta consulta con `sales.orders.submit`, pero
  filtra en backend los pedidos fuera del alcance del vendedor.

Repositorio:

`backend/app/repositories/crm.py`

- Se agregó la llamada al RPC de completitud mediante el cliente de servicio.

### Frontend

Archivos principales:

- `frontend/panel/src/components/embudo/lead-drawer.tsx`
  - Resumen previo de los cuatro bloques.
  - Captura de evidencia sin abrir todavía el modal de confirmación.
  - Continuación bloqueada mientras `puede_enviar_a_revision` sea falso.
- `frontend/panel/src/components/ventas/order-formalization-queue.tsx`
  - Prop `canReview` para diferenciar consulta de revisión operativa.
  - Ocultamiento de checkboxes y acciones elevadas para vendedores.
- `frontend/panel/src/app/ventas/pedidos/page.tsx`
  - Determina si el usuario tiene permiso de revisión.
- `frontend/panel/src/components/AppSidebar.tsx`
  - Permite mostrar la entrada de órdenes a usuarios con `sales.orders.submit`.
- `frontend/panel/src/app/api/embudo/quotes/[quoteId]/pedido/completitud/route.ts`
  - BFF del nuevo endpoint de completitud.

## Validaciones realizadas

- Backend: `compileall` correcto.
- Frontend: ESLint correcto.
- Frontend: TypeScript sin errores.
- React Doctor: 100/100, sin hallazgos.
- `git diff --check`: correcto.
- Supabase: funciones y migraciones verificadas después de aplicar el cambio.

## Pendiente operativo

Falta recorrer el flujo con sesiones autenticadas de al menos:

- un vendedor con `sales.orders.submit`;
- un usuario de Operaciones con `sales.orders.confirm`;
- dos oportunidades asignadas a vendedores distintos para confirmar el
  aislamiento de la cola.

También debe validarse visualmente en el entorno desplegado que el panel
actualizado esté publicado; la aplicación de la migración no despliega por sí
sola el backend ni el frontend.
