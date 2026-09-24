# Plan clientes vendedores

Fecha: 2026-06-03
Ruta: `docs/Plan_clientes_vendedores/README.md`

## 1) Objetivo

Hacer que la vista de `clientes` muestre correctamente quien es el vendedor/propietario del cliente, usando relaciones reales de BD y no `metadata`.

Ademas:

- si cambia el vendedor del contacto, empresa u oportunidad, la vista de clientes debe reflejarlo automaticamente;
- si el vendedor deja de estar autorizado para ese cliente, ya no debe verlo en la vista;
- el comportamiento debe quedar alineado con el modelo actual de `personas/contactos`, `cuentas`, `clientes`, `cliente_responsables` y `oportunidades`.

## 2) Regla de negocio propuesta

La fuente de verdad del vendedor debe salir de relaciones normales de la base:

1. `clientes.contacto_id -> contactos.id -> contactos.propietario_usuario_id`
2. fallback: `clientes.cuenta_id -> cuentas.id -> cuentas.propietario_usuario_id`
3. fallback final: `clientes.oportunidad_id -> oportunidades.id -> oportunidades.asignado_a_usuario_id`

Orden de precedencia recomendado:

- `contacto_owner`
- `cuenta_owner`
- `oportunidad_asignado`

Si el contacto tiene owner, ese valor manda.
Si el contacto no tiene owner, se usa el de la cuenta.
Si tampoco hay owner en la cuenta, se usa el de la oportunidad si existe.

## 3) Lo que no se debe hacer

- No guardar el vendedor en `metadata`.
- No usar `conversaciones` como fuente canonica del propietario del cliente.
- No duplicar la misma verdad en varias tablas sin una regla clara de precedencia.

## 4) Estado actual detectado en BD

Con la revision de esquema y datos:

- `clientes` no tiene un campo propio de propietario/vendedor.
- `clientes` si tiene relaciones a:
  - `contactos`
  - `cuentas`
  - `oportunidades`
- `cliente_responsables` existe, pero su proposito es responsables operativos/comerciales del cliente, no el owner canonico del CRM.
- `asignaciones_vendedores` es auditoria de asignacion, no la fuente de verdad para la vista de clientes.
- En el backfill ya aplicado, los clientes creados quedaron con owner en `contactos` y `cuentas`, y no tienen oportunidad asociada.

## 5) Comportamiento esperado

### Vista de clientes

La tabla/lista de clientes debe mostrar:

- vendedor/propietario calculado por relacion
- nombre del vendedor
- correo del vendedor

La vista debe recalcularse cuando cambie:

- `contactos.propietario_usuario_id`
- `cuentas.propietario_usuario_id`
- `oportunidades.asignado_a_usuario_id`

### Permisos y visibilidad

Si un vendedor deja de ser propietario o queda fuera de scope:

- ya no debe ver esos clientes en la vista;
- el acceso debe depender del mismo criterio de scope que ya se usa en contactos, cuentas y oportunidades;
- la politica debe respetar tenant, rol y ownership.

## 6) Arquitectura objetivo

### 6.1 Capa de datos

Crear una vista o query canonica para clientes con vendedor resuelto, por ejemplo:

- `v_clientes_con_propietario`

Campos sugeridos:

- `cliente_id`
- `contacto_id`
- `cuenta_id`
- `oportunidad_id`
- `vendedor_usuario_id`
- `vendedor_nombre`
- `vendedor_correo`
- `vendedor_telefono`
- `vendedor_fuente` con valores como:
  - `contacto`
  - `cuenta`
  - `oportunidad`

La vista debe usar `COALESCE(contacto_owner, cuenta_owner, oportunidad_asignado)`.

### 6.2 Capa backend

Actualizar el selector de clientes para que devuelva el vendedor resuelto, sin depender de `metadata`.

El backend debe:

- leer el owner del contacto;
- si no existe, leer el owner de la cuenta;
- si no existe, leer el owner de la oportunidad;
- exponer ese vendedor en la respuesta de `/crm/clientes`;
- aplicar el mismo filtro de visibilidad por scope/owner que ya usan contactos y oportunidades.

### 6.3 Capa frontend

La vista de clientes debe:

- mostrar el vendedor real resuelto;
- no inferirlo desde `responsables` salvo que sea un campo distinto y explicitamente rotulado como responsable;
- refrescar la tabla cuando cambie el owner.

## 7) Efecto de reasignacion

Cuando el vendedor cambia:

- si cambia el owner del contacto, la vista de clientes debe reflejarlo de inmediato;
- si el contacto no tiene owner y cambia el owner de la cuenta, la vista debe reflejarlo;
- si ambos estan vacios y cambia la oportunidad, la vista debe reflejarlo.

Regla importante:

- el cambio debe hacerse en la tabla fuente que corresponde al flujo real;
- la vista de clientes solo calcula y muestra;
- no se recomienda persistir una copia adicional en `clientes` salvo que el negocio pida snapshot historico.

## 8) Impacto por flujo

### Contactos

- sigue siendo la fuente principal del vendedor cuando el cliente nace desde una persona/contacto;
- la reasignacion del contacto debe propagar la nueva vista de clientes.

### Empresas / cuentas

- actua como fallback o fuente principal si el contacto no tiene owner;
- si la cuenta cambia de vendedor, los clientes asociados deben reflejarlo.

### Oportunidades

- actuan como ultimo fallback para clientes nacidos desde pipeline;
- si una oportunidad cambia de asignado, la vista debe actualizarse.

### Conversaciones

- solo sirven como soporte de asignacion y auditoria;
- no deben ser la fuente canonica del vendedor visible en clientes.

## 9) Plan de implementacion

### Fase 1: Definir la vista canonica

1. Crear una vista SQL para clientes con vendedor resuelto.
2. Validar que la vista respete tenant y relaciones.
3. Documentar la precedencia de `COALESCE`.

### Fase 2: Backend

1. Actualizar el endpoint/listado de clientes para devolver el vendedor resuelto.
2. Ajustar serializacion del payload de clientes.
3. Mantener compatibilidad con `documentos` y `responsables`.
4. Asegurar que filtros de scope bloqueen clientes fuera del vendedor permitido.

### Fase 3: Frontend

1. Mostrar el vendedor resuelto en la tabla de clientes.
2. Separar visualmente `vendedor` de `responsables`.
3. Asegurar refresco correcto al reasignar vendedor.

### Fase 4: Reasignacion

1. Revisar que el flujo de reasignacion de contacto/empresa/oportunidad siga actualizando la tabla correcta.
2. Si se decide usar snapshot historico, agregarlo de forma explicita en una columna propia, no en metadata.

### Fase 5: Validacion

1. Probar clientes nacidos desde contacto.
2. Probar clientes nacidos desde oportunidad.
3. Probar clientes con fallback a cuenta.
4. Probar cambio de vendedor y verificacion de acceso.

## 10) Criterios de aceptacion

El plan queda cerrado cuando:

- la vista de clientes muestra el vendedor correcto sin usar `metadata`;
- un cambio de owner en contacto/cuenta/oportunidad se ve reflejado en clientes;
- un vendedor reasignado deja de ver clientes fuera de su scope;
- el comportamiento queda documentado y probado con casos de contacto, empresa y oportunidad.

## 11) Nota tecnica

En el estado actual del sistema, la opcion mas limpia es derivar el vendedor con una vista o query de backend, no duplicarlo como dato libre.

Solo si el negocio necesita historial inmutable conviene materializar un snapshot en `clientes`.

## 12) Conversión histórica de oportunidades ganadas

La tabla canónica sigue siendo `public.clientes`; no se crea una tabla nueva.
Esta sección describe el comportamiento transitorio aplicado durante la
reconciliación inicial. La regla definitiva está en la sección 13: una
oportunidad ganada no crea cliente hasta que exista un pago confirmado.

Durante la reconciliación inicial, las oportunidades ganadas se asociaron al
cliente disponible por medio de:

```text
oportunidades.organizacion_id + oportunidad_id
    -> clientes.organizacion_id + oportunidad_id
```

La conversión histórica fue idempotente y completó, cuando faltaba, la cuenta
CRM y el contacto mínimo recuperable de la oportunidad. El trigger asociado
debe reemplazarse o desactivarse al implementar el flujo definitivo basado en
ventas y pagos.

La migración histórica
`20260912153411_auto_create_cliente_from_won_opportunity.sql` hizo el backfill
idempotente de oportunidades ya ganadas. Ese flujo quedó cerrado: el trigger
histórico fue eliminado y no debe reactivarse.

## 13) Modelo comercial: formalizar venta antes de cobrar

### Regla de negocio

Una cotización aceptada representa un compromiso comercial y puede mover la
oportunidad a ganada. Ganar la oportunidad no registra dinero ni debe obligar
a emitir una factura. La acción explícita **Formalizar venta** es la frontera
entre CRM y administración: crea o activa el cliente, formaliza la venta y
abre su cuenta por cobrar con el total pendiente. Puede existir una venta y un
cliente aunque todavía no haya pagos confirmados.

Los documentos acompañan la venta y la cobranza; no son el evento que crea la
venta. Su emisión puede ser opcional y configurable por organización. Un recibo
de pago se registra como evidencia posterior al pago; una solicitud de pago,
proforma, nota u orden de venta puede servir para solicitarlo antes. La factura
fiscal es una clase de documento separada de los documentos internos y su
emisión depende del flujo fiscal que use cada organización.

```text
contacto / empresa
└── una o muchas oportunidades
    └── una cotización aceptada por oportunidad
        └── oportunidad ganada
            └── pedido del cliente confirmado
                ├── formalizar venta
                │   ├── cliente creado o actualizado
                │   ├── venta + partidas
                │   ├── cuenta por cobrar
                │   └── documentos de venta/cobro (según el flujo)
                └── reservar stock (solo articulos stockables)
                    └── entrega: salida fisica y liberacion de reserva
```

### Confirmacion del pedido e inventario

Aceptar la cotizacion y ganar la oportunidad cierran el compromiso comercial,
pero no reservan existencias. La cotizacion aceptada puede generar un pedido
pendiente de confirmacion. La confirmacion del pedido del cliente —usualmente
respaldada por su orden de compra recibida y validada— es la frontera para
formalizar la venta y, para productos stockables, reservar inventario. En la
primera version, esta es la politica B2B predeterminada. No se debe confundir
la orden de compra del cliente con `ordenes_compra`, que en Tal-IA representa
compras de la organizacion a sus proveedores.

La reserva modifica `stock_reservado` y `stock_disponible`, no la existencia
fisica. Facturar, emitir una proforma o recibir un pago tampoco descuenta stock.
La salida fisica ocurre al surtir/entregar; cancelar un pedido no surtido libera
la reserva. Servicios y articulos con `maneja_inventario = false` no crean
reservas ni movimientos de almacen. Cobranza, venta y cumplimiento logistico
conservan estados independientes.

**Decision de arquitectura:** el pedido del cliente sera una entidad propia,
`pedidos_venta`, con sus partidas `pedido_venta_items`. La cotizacion aceptada
podra originar un pedido en espera de confirmacion; aceptar la cotizacion o
ganar la oportunidad no reserva inventario ni formaliza la venta. La
confirmacion explicita registra que el cliente comprometio la compra (por
ejemplo, con una orden de compra recibida y validada) y, en una operacion
transaccional e idempotente, formaliza cliente, venta, partidas y cuenta por
cobrar, y reserva las cantidades disponibles de articulos stockables. La orden
de compra del cliente es evidencia/referencia del pedido; no es
`ordenes_compra`, que representa compras a proveedores.

#### Evidencia de confirmacion de compra

El pedido debe permitir confirmar la compra tanto **con orden de compra (OC)**
como **sin OC**. La OC del cliente es opcional y no sustituye al pedido de
Tal-IA. Al confirmar, el vendedor seleccionara una forma de confirmacion:
`orden_compra`, `cotizacion_firmada_aceptada`, `correo_electronico`,
`whatsapp`, `contrato`, `confirmacion_verbal`, `anticipo_pago` u `otro`.

El formulario contemplara fecha de confirmacion, numero/referencia de OC cuando
aplique, observaciones y un archivo de evidencia que el usuario pueda subir
desde el documento que le entregue el cliente. Para una confirmacion de tipo
OC se debera capturar el numero de OC o adjuntar su documento. Para las otras
formas, el adjunto sera opcional. `Confirmado por` se tomara del usuario en
sesion y el vendedor se conservara desde la oportunidad/pedido; no seran campos
de texto libre. El anticipo/pago solo podra usarse como evidencia si se vincula
a un pago efectivamente registrado, no por seleccionar esa opcion.

El archivo se asociara al pedido y quedara tenant-scoped, con permisos de
lectura/escritura y trazabilidad de quien lo subio. Antes de implementar la
carga se revisara el mecanismo existente de archivos/documentos para reutilizar
su almacenamiento, validacion de tipo/tamano y autorizacion; no se guardara el
archivo dentro de metadata ni como contenido binario en las tablas del pedido.
El detalle del pedido mostrara la evidencia y permitira consultarla o
descargarla a usuarios autorizados. La referencia de OC nunca se confundira con
la orden de compra a proveedores.

Para la primera version se establece una relacion uno a uno entre pedido
confirmado y venta/cuenta por cobrar: cada pedido confirmado genera una venta y
una cuenta por cobrar, y la venta conserva una referencia unica al pedido.
Los estados del pedido/logistica se mantienen en el pedido y sus operaciones;
los estados financieros permanecen en venta/cuenta por cobrar. En la primera
version los estados del pedido seran `borrador`, `pendiente_confirmacion`,
`confirmado` y `cancelado`; solo un pedido no confirmado o sin surtir puede
cancelarse y liberar cualquier reserva asociada. La entrega parcial o total
registrara salidas contra las partidas del pedido/venta y liberara la cantidad
surtida. Cambios despues de confirmar requeriran una operacion controlada de
ajuste o cancelacion, no editar silenciosamente las partidas confirmadas.

Las partidas conservan relaciones explicitas y tenant-safe con
`cotizacion_items`, `catalog_items` y, cuando aplique, `propiedad_id` y
`unidad_id`; la entidad y la confirmacion del pedido ya se implementaron y
desplegaron. La carga de evidencia y la forma de confirmacion descritas arriba
siguen pendientes.

La partida conserva el producto mediante `catalog_item_id` desde cotizacion,
pedido y hasta `venta_items`. La reserva se traza hasta el pedido y su renglon;
la salida debe trazarse hasta la venta y el renglon surtido. La configuracion
por tenant para reservar con anticipo/pago, al aceptar cotizacion, manualmente
o no reservar queda para una fase posterior.

Una vez que el contacto o empresa ya es cliente, cada nueva oportunidad
ganada se conserva en su historial; no se sobrescribe la oportunidad
anterior.

### Modelo de datos objetivo

Se mantiene `public.clientes` como maestro del cliente. El modelo debe
incorporar:

- `public.oportunidades.cliente_id`: relación de muchas oportunidades con un
  cliente.
- `public.ventas`: venta formal asociada a organización, cliente, cuenta,
  oportunidad, cotización y pedido confirmado (referencia unica al pedido en
  el alcance inicial).
- `public.pedidos_venta` y `public.pedido_venta_items`: pedido del cliente con
  estado comercial/logistico propio; partidas ligadas a cotizacion,
  `catalog_item_id` y, cuando aplique, `propiedad_id`/`unidad_id`. Cada pedido
  confirmado genera una venta en v1.
- `public.cotizacion_items`: debe conservar `catalog_item_id` como relacion
  explicita del articulo cotizado, además de la compatibilidad temporal con
  `producto_id` legado.
- `public.venta_items`: productos o servicios vendidos, con `catalog_item_id`,
  cantidad, precio, descuentos, impuestos y subtotal.
- `public.cuentas_por_cobrar`: obligación pendiente de una venta, con importe
  original, importe pagado, saldo, moneda, fechas de emisión y vencimiento, y
  estado de cobranza. Debe relacionarse mediante claves foráneas reales con la
  organización, cliente y venta. Para el alcance inicial se busca una cuenta
  por cobrar por venta; parcialidades se representan mediante pagos asociados.
- `public.documentos_cobro` (nombre objetivo): documentos asociados a la venta
  y, cuando aplique, a la cuenta por cobrar. Debe tener columnas explícitas
  para tipo, folio, fechas, importes, moneda, estado y referencia al archivo o
  proveedor documental. Tipos previstos: solicitud de pago, proforma, nota de
  venta, orden de venta, factura y recibo de pago. El detalle del CFDI/PAC se
  definirá en una fase fiscal separada; no se guardarán relaciones o estados
  centrales únicamente en JSON/metadata.
- `public.pagos`: pagos, anticipos, pagos parciales, liquidaciones,
  devoluciones y cancelaciones.

### Vista de clientes

La vista principal mostrará una tabla resumida de clientes. Al abrir un
cliente se mostrará un detalle organizado por secciones, sin mezclar
prospección, venta y cobranza:

```text
Resumen | Oportunidades | Cotizaciones | Ventas | Pagos | Documentos
```

El resumen incluirá contacto, empresa, vendedor, estado, primera compra,
número de oportunidades ganadas, número de ventas, importe vendido, importe
cobrado y saldo pendiente. Las secciones de oportunidades, cotizaciones,
ventas y pagos conservarán sus relaciones y fechas para reconstruir el ciclo
comercial completo. Cada sección tendrá estados de carga, error y vacío.

Relaciones esperadas:

```text
clientes 1 ─── N oportunidades
oportunidades 1 ─── N cotizaciones
oportunidades 1 ─── 1 venta
ventas 1 ─── N venta_items
ventas 1 ─── 1 cuenta_por_cobrar
ventas 1 ─── N documentos_cobro
ventas 1 ─── N pagos
cuentas_por_cobrar 1 ─── N documentos_cobro
```

La relación histórica debe usar columnas y foreign keys reales. No se debe
guardar el vínculo principal entre venta, oportunidad, cliente o pago dentro
de `metadata`.

### Estados y reglas de integridad

- Sólo puede existir una cotización aceptada activa por oportunidad.
- Una oportunidad ganada debe conservar su cotización aceptada.
- Una venta debe referenciar la oportunidad y cotización que la originaron.
- Formalizar una venta crea o activa el cliente, la venta, sus partidas y la
  cuenta por cobrar en una operación transaccional e idempotente.
- Registrar un documento de cobro no equivale a registrar un pago. Un pago
  confirmado no requiere que exista un documento, salvo que la organización
  configure esa regla.
- Mantener estados separados: oportunidad (`abierta`, `ganada`, `perdida`),
  venta (`borrador`, `formalizada`, `cancelada`) y cobranza (`pendiente`,
  `parcial`, `pagada`, `vencida`, `cancelada`, `reembolsada`). Los nombres
  definitivos se alinearán con los estados existentes y sus restricciones.
- El saldo de la cuenta por cobrar se deriva de su importe original menos los
  pagos confirmados y ajustes/reembolsos válidos; no se debe contar una factura
  o solicitud emitida como dinero cobrado.
- `clientes.oportunidad_id` no debe seguir siendo la única relación. Se debe
  migrar a una referencia de origen histórica o retirarse después de validar
  `oportunidades.cliente_id`.

### Métricas comerciales

Los indicadores deben separar conceptos:

- oportunidades ganadas;
- ventas formalizadas;
- ventas con pago parcial;
- ventas pagadas o liquidadas;
- clientes nuevos;
- clientes recurrentes;
- importe vendido;
- importe cobrado;
- saldo pendiente.

Una cotización aceptada no debe contarse automáticamente como ingreso cobrado.

### Fases de implementación

1. Modificar el flujo actual para que la aceptación de cotización marque la
   oportunidad como ganada, sin formalizar automáticamente una venta.
2. Crear `oportunidades.cliente_id` y conservar todas las oportunidades del
   mismo cliente.
3. Crear `ventas` y `venta_items` con restricciones, índices y RLS por tenant.
4. Crear `pedidos_venta` y `pedido_venta_items`, enlazarlos con la cotizacion
   aceptada y permitir confirmar explicitamente el compromiso del cliente,
   con OC o sin OC. El formulario debe admitir forma de confirmacion,
   referencia/numero de OC, carga del documento recibido del cliente,
   observaciones y auditoria del usuario/vendedor.
5. Al confirmar el pedido, ejecutar **Formalizar venta** y crear/activar
   cliente, venta, partidas y cuenta por cobrar atomicamente e idempotentemente;
   reservar stock disponible para articulos stockables en la misma operacion.
6. Crear `cuentas_por_cobrar`, con cálculo consistente de saldo y estados de
   cobranza; no confundir importe vendido con importe cobrado.
7. Crear `documentos_cobro` y sus operaciones (emitir, consultar, descargar,
   enviar y cancelar según tipo). La emisión de estos documentos será
   configurable y no una condición universal para crear la venta.
8. Separar el registro de pago confirmado del alta/formalización. Conservar un
   flujo rápido opcional de formalizar venta y registrar pago en una sola
   operación coordinada.
9. Reconciliar los clientes creados por el flujo anterior y conservar la
   trazabilidad de su origen.
10. Actualizar APIs, panel de clientes, detalle de oportunidad, ventas,
   cobranza y reportes.
11. Propagar `catalog_item_id` desde `cotizacion_items` hasta partidas del
    pedido y `venta_items`; mantener separados los estados comercial,
    financiero y logistico.
12. Integrar la entrega/surtido parcial o total como salida de inventario y
    liberacion de la reserva correspondiente.
13. Validar el flujo de primera compra, compra recurrente y ciclo de
    inventario por contacto, empresa y cliente.
14. Incorporar flujos de propiedades sobre el mismo nucleo financiero cuando
    las entidades y eventos inmobiliarios (por ejemplo, apartado, contrato y
    parcialidades) estén definidos; no asumir que el ciclo documental es igual
    al de otros giros.

### Estado de implementación base al 2026-09-12, actualizado al 2026-09-24

La relación con clientes, las tablas de ventas, partidas y pagos, y los
reportes ya existen. En esta revisión se agregó al repositorio el código para
formalización independiente y cuentas por cobrar. La migración ya se aplicó al
Supabase remoto y el código de backend/panel ya se desplegó en producción; queda
validar el recorrido financiero con un usuario autenticado.

- `oportunidades.cliente_id` vincula las 42 oportunidades ganadas existentes
  con su cliente, sin asociar oportunidades abiertas o perdidas.
- Existe una restricción para impedir más de una cotización aceptada por
  oportunidad.
- Existen `ventas`, `venta_items` y `pagos`, con foreign keys tenant-safe,
  índices, constraints monetarios y RLS.
- La migración remota `20260923151522_sales_formalization_accounts_receivable`
  creó las cuentas por cobrar para las cuatro ventas existentes y reemplazó
  los RPC financieros. El backend se reinició para consumir las nuevas firmas.
- La API expone
  `POST /crm/cotizaciones/{cotizacion_id}/pago-confirmado`.
- La vista de clientes ya tiene preparada la ruta de detalle
  `/clientes/{clienteId}` con las secciones Resumen, Oportunidades,
  Cotizaciones, Ventas, Pagos y Documentos.
- La tabla principal de clientes enlaza cada registro con su detalle
  comercial, en lugar de enviarlo directamente a la empresa o al contacto.
- La lista de clientes no utiliza `clientes.monto_estimado` como importe de
  venta: muestra el total formal acumulado de `ventas.total`, además de total
  cobrado y saldo pendiente.
- El historial consulta `ventas`, `venta_items` y `pagos` mediante el backend
  autorizado, respetando el RLS de las tablas comerciales.

El flujo legacy de conversión manual quedó retirado. La versión desplegada
permite formalizar sin pago o usar el atajo de formalizar y cobrar
inmediatamente; ganar la oportunidad no crea por sí sola una venta ni registra
dinero. El refactor descrito abajo cambia esa versión para que la formalización
y la reserva de stock ocurran al confirmar un pedido del cliente.

### Formalización y cuentas por cobrar — código en repositorio al 2026-09-23

La migración `20260923145927_sales_formalization_accounts_receivable.sql`
define `cuentas_por_cobrar` con relación única por venta, importes explícitos,
saldo calculado, moneda, fechas, estado, foreign keys, índices y RLS para
acceso interno. Migra las ventas y pagos existentes y enlaza cada pago con su
cuenta por cobrar.

El código agrega:

- `POST /crm/cotizaciones/{cotizacion_id}/formalizar-venta`: crea o activa el
  cliente, la venta, sus partidas y la cuenta por cobrar sin insertar un pago.
- `POST /crm/ventas/{venta_id}/pagos-confirmados`: registra pagos solo para una
  venta formalizada y actualiza el saldo asociado.
- `POST /crm/cotizaciones/{cotizacion_id}/pago-confirmado`: conserva el atajo
  para formalizar y registrar el pago inmediato dentro de una operación SQL.
- La acción explícita **Formalizar venta** en la ficha del embudo; el flujo
  rápido **Registrar pago inmediato** continúa disponible.
- Permisos `sales.manage`, `sales.manage_team` y `sales.manage_all`, con
  alcance de oportunidad validado en backend.

Por compatibilidad, `ventas.estatus` conserva temporalmente los estados de
cobranza que consume `/ventas`; el estado propio de cuenta por cobrar queda en
`cuentas_por_cobrar.estatus`. La adaptación de reportes y vistas para exponer
por separado venta formalizada, cobranza, cobrado y saldo queda pendiente.
Tampoco se implementan aún `documentos_cobro`, facturación fiscal ni vencimiento
automático materializado.

Estado de aplicación: **migración y despliegue realizados; validación funcional
autenticada pendiente**. El panel quedó en el release `20260923_161750`;
`/ventas` respondió HTTP 200, la API volvió a responder `/api/health` con
`{"status":"ok"}` y la ruta de formalización respondió 401 sin sesión,
confirmando que exige autenticación.

### Pedido confirmado e inventario — desplegado; validación autenticada pendiente

El refactor añade una entidad propia para el compromiso del cliente, separada
de la oportunidad y de la venta:

- Una cotización aceptada y oportunidad ganada crea un pedido en
  `pendiente_confirmacion`; no reserva inventario.
- Confirmar el pedido crea o activa el cliente, formaliza venta y cuenta por
  cobrar, preserva la relación explícita con catálogo y partidas, y reserva
  existencias de almacén en la misma transacción.
- Para una unidad inmobiliaria, la confirmación la aparta/reserva por estado,
  sin movimiento de almacén ni cambio a vendida.
- La forma de confirmación (OC o sin OC), adjuntar el documento del cliente,
  capturar observaciones y mostrar la evidencia siguen pendientes; el alcance
  funcional y las reglas están definidos en “Evidencia de confirmacion de compra”.
- El atajo de pago inmediato confirma el pedido y registra el pago en una
  operación coordinada.
- La cancelación de una cotización libera únicamente pedidos no confirmados;
  un pedido confirmado requiere un flujo posterior de cancelación de venta y
  liberación logística.

La migración `20260924015415_pedidos_venta_flujo_confirmacion.sql` creó
`pedidos_venta` y `pedido_venta_items`, las relaciones con ventas y reservas,
y las funciones transaccionales. La migración
`20260924021025_pedidos_venta_fk_indexes.sql` añadió índices para cubrir claves
foráneas detectadas por el asesor de rendimiento. Ambas están aplicadas en
Supabase. Las tablas tienen RLS con acceso de servicio y los cuatro RPC niegan
ejecución directa a `anon` y `authenticated`.

El backend y el panel se desplegaron el 2026-09-24 en el release
`20260924_021215`. La publicación atómica completó TypeScript, lint y build;
API y panel están activos, `/api/health` y `/ventas` responden HTTP 200, y el
endpoint de formalización devuelve 401 sin sesión. Falta el recorrido
autenticado de punta a punta. También siguen pendientes la salida física por
entrega/surtido, cancelación de pedidos confirmados y definir el hito
contractual inmobiliario que marca una unidad como vendida.

## 14) Reportes de ventas

La sección `/ventas` es independiente de `/clientes`: Clientes conserva el
maestro y el historial del cliente; Ventas concentra el desempeño comercial y
la cobranza.

### Contenido y filtros

- Indicadores de ventas formalizadas, importe vendido, cobros confirmados en el
  periodo, saldo pendiente, pagos parciales, ventas pendientes y ventas pagadas.
- Gráfica mensual que agrupa las ventas por `ventas.fecha_venta` y los cobros
  por `pagos.fecha_confirmacion`.
- Tabla paginada con cliente, oportunidad, vendedor, estado, total, cobrado y
  saldo; el cliente enlaza a su detalle comercial.
- Filtros por fechas, vendedor, estado de venta y moneda. Los montos se filtran
  por una sola moneda para no sumar cantidades de monedas distintas.
- El periodo usa la zona horaria efectiva del usuario/organización.

### Atribución y permisos

- `ventas.vendedor_usuario_id` conserva el vendedor asignado a la oportunidad
  cuando se formaliza la venta. Un cambio posterior del propietario actual del
  contacto, la cuenta o la oportunidad no reescribe la atribución histórica.
- `sales.view` permite consultar las ventas propias; `sales.view_team` permite
  consultar al equipo supervisado; `sales.view_all` permite consultar toda la
  organización. El backend calcula y aplica el alcance antes de consultar el
  reporte; el filtro de vendedor del panel nunca amplía los permisos.
- `GET /crm/ventas/reporte` recibe `desde`, `hasta`, `estatus`,
  `vendedor_usuario_id`, `moneda`, `limit` y `offset`. La organización se toma
  del contexto autenticado, no del query del cliente.
- La agregación usa la función privada `crm_reporte_ventas`, ejecutable solo
  por `service_role`; la API valida autenticación, permiso, tenant y scope de
  vendedores antes de invocarla.

### Estado del desarrollo

La implementación inicial está en el repositorio en la migración
`20260923134157_sales_reports_and_vendor_attribution.sql`, la API CRM y la
pantalla `/ventas`. La migración aún debe aplicarse al Supabase del entorno de
destino y probarse con usuarios vendedor, supervisor y administrador.

El backfill inicial asigna las ventas históricas al vendedor que tiene ahora
asignada su oportunidad; el modelo previo no guardaba una atribución de venta
inmutable, por lo que una reasignación pasada podría no ser reconstruible.
Además, `pagos.estatus = 'reembolsado'` no conserva una fila/evento de reembolso
separada con su propia fecha. El reporte cuenta pagos que mantienen estado
`confirmado`; no presenta reembolsos como movimientos mensuales.
