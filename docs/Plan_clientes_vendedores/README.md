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
            └── Comercial confirma pedido y adjunta evidencia
                ├── OC recibida y validada: reservar stock fisico
                │   (sin venta ni cuenta por cobrar)
                └── Operaciones revisa
                    ├── regresar a Comercial con motivo
                    └── aprobar y liberar a surtido
                        ├── cliente creado o actualizado
                        ├── venta + partidas
                        ├── cuenta por cobrar
                        ├── reservar stock si aun no estaba reservado
                        └── Almacen surte solo despues de liberar el pedido
```

### Confirmacion del pedido e inventario

Aceptar la cotizacion y ganar la oportunidad cierran el compromiso comercial,
pero no reservan existencias. La cotizacion aceptada puede generar un pedido
pendiente de confirmacion. Comercial registra la confirmacion del cliente y
envia el pedido a revision; esta accion no formaliza la venta ni crea la cuenta
por cobrar. Si recibe y valida una OC del cliente, puede reservar en ese
momento solo inventario fisico stockable, sin liberar el pedido a Almacen. Sin
OC validada, la reserva ocurre al aprobar Operaciones. La aprobacion para
liberar a surtido siempre formaliza la venta y cuenta por cobrar, y garantiza
la reserva sin duplicarla si ya existe. No se debe confundir
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
ganar la oportunidad no reserva inventario ni formaliza la venta. Comercial
confirma el pedido registrando como el cliente comprometio la compra y adjunta
evidencia con OC o sin ella. Si Comercial recibe y valida una OC, puede reservar
en ese momento solo las cantidades fisicas stockables, sin formalizar venta ni
cuenta por cobrar y sin liberar a Almacen. El pedido queda en revision
operativa. Si Operaciones detecta problemas, lo regresa a Comercial con el
motivo. Si lo aprueba y libera a surtido, una operacion transaccional e
idempotente formaliza cliente, venta, partidas y cuenta por cobrar y garantiza
la reserva si aun no existe. La orden de compra del cliente es
evidencia/referencia del pedido; no es
`ordenes_compra`, que representa compras a proveedores.

#### Evidencia y confirmacion comercial del pedido

El pedido debe permitir confirmar la compra tanto **con orden de compra (OC)**
como **sin OC**. La OC del cliente es opcional y no sustituye al pedido de
Tal-IA. Al confirmar el pedido, Comercial registra la forma de
confirmacion:
`orden_compra`, `cotizacion_firmada_aceptada`, `correo_electronico`,
`whatsapp`, `contrato`, `confirmacion_verbal`, `anticipo_pago` u `otro`.

El formulario registra fecha, numero/referencia de OC cuando aplique,
observaciones y archivo de evidencia que el usuario puede subir desde el
documento recibido del cliente. Para una confirmacion de tipo OC se debe
capturar el numero o adjuntar el documento. Para las otras formas, el adjunto
es opcional. **Confirmar pedido** nunca crea venta ni cuenta por cobrar. Si la
evidencia es una OC recibida y validada por Comercial, se reserva unicamente el
inventario fisico stockable; con evidencia sin OC no se reserva aun.
Operaciones/Administracion revisa cliente,
evidencia y partidas. Si hay problemas, usa **Regresar a Comercial** y registra
el motivo. Si todo esta correcto, usa **Aprobar y liberar a surtido**; esa
aprobacion formaliza cliente/venta/cuenta por cobrar y garantiza la reserva
stockable si aun no existe, sin duplicar una reserva previa por OC. Si el
pedido regresa a Comercial, la reserva basada en una OC vigente se conserva
mientras se corrige; cancelar el pedido o invalidar la OC libera lo reservado.
Se auditan por separado quien confirma y quien aprueba; el vendedor se conserva
desde la oportunidad/pedido.
El anticipo/pago solo puede usarse como evidencia si se vincula a un pago
efectivamente registrado, no por seleccionar esa opcion.

El archivo se asociara al pedido y quedara tenant-scoped, con permisos de
lectura/escritura y trazabilidad de quien lo subio. Antes de implementar la
carga se revisara el mecanismo existente de archivos/documentos para reutilizar
su almacenamiento, validacion de tipo/tamano y autorizacion; no se guardara el
archivo dentro de metadata ni como contenido binario en las tablas del pedido.
El detalle del pedido mostrara la evidencia y permitira consultarla o
descargarla a usuarios autorizados. La referencia de OC nunca se confundira con
la orden de compra a proveedores.

Para la primera version se establece una relacion uno a uno entre pedido
aprobado por Operaciones y venta/cuenta por cobrar: cada pedido aprobado genera
una venta y una cuenta por cobrar, y la venta conserva una referencia unica al
pedido. La confirmacion comercial por si sola no crea esas entidades.
Los estados del pedido/logistica se mantienen en el pedido y sus operaciones;
los estados financieros permanecen en venta/cuenta por cobrar. En la primera
version los estados del pedido seran `borrador`, `pendiente_confirmacion`,
`confirmado` y `cancelado`; la transicion de pedido confirmado por Comercial a
aprobado por Operaciones debe quedar representada sin ambiguedad. Solo un
pedido aun no aprobado o aprobado pero sin surtir puede cancelarse y liberar
cualquier reserva asociada. La entrega parcial o total registrara salidas
contra las partidas del pedido/venta y liberara la cantidad surtida. Cambios
despues de la aprobacion de Operaciones requeriran una operacion controlada de
ajuste o cancelacion, no editar silenciosamente las partidas aprobadas.

Las partidas conservan relaciones explicitas y tenant-safe con
`cotizacion_items`, `catalog_items` y, cuando aplique, `propiedad_id` y
`unidad_id`; la entidad, confirmacion comercial y aprobacion operativa del
flujo anterior ya estan implementadas y desplegadas. La forma y evidencia
con/sin OC tambien estan implementadas. La secuencia nueva de revision,
aprobacion y reserva anticipada por OC tiene una implementacion preliminar local
en esta rama; no equivale a la revision completa de seis bloques descrita mas
adelante. Su migracion aun no esta aplicada en Supabase y falta completar y
validar el flujo autenticado antes de considerarla desplegada.

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

La primera version del traspaso por areas se implemento y desplego el
2026-09-24. El flujo objetivo aprobado para alinear es:

1. **Comercial — Confirmar pedido:** registra forma de confirmacion, fecha,
   referencia, evidencia y condiciones acordadas (con OC o sin ella); no crea
   venta ni cuenta por cobrar. Si valida una OC, reserva solo el stock fisico
   disponible y deja registrado el faltante; con otras evidencias no reserva.
2. **Operaciones — Revisar pedido:** valida los seis bloques (cliente,
   aceptacion/evidencia, partidas, inventario, condiciones y riesgos); puede
   **Regresar a Comercial** con causa/comentario o **Aprobar y liberar a surtido**.
3. **Aprobacion operativa:** formaliza cliente/venta/partidas/cuenta por cobrar
   y garantiza la reserva de stock transaccionalmente si aun no existe. Es el
   unico punto que ejecuta los efectos financieros; no duplica una reserva
   anterior hecha con OC. Un faltante solo se acepta como alerta si el acuerdo
   permite entrega parcial; de otro modo bloquea liberar.
4. **Almacen — Surtidos:** recibe solo pedidos aprobados y liberados; registra
   entregas parciales o totales.
5. **Siguiente — condiciones y evidencia:** agregar campos estructurados de
   pago/credito/anticipo, entrega parcial, fecha/domicilio y envio a cotizacion;
   copiarlos al pedido al confirmarlo. Admitir evidencia adjunta y referencias
   para los medios de aceptacion distintos de OC.
6. **Siguiente — reserva parcial:** reservar solo disponibilidad real; conservar
   cantidades requeridas, reservadas, surtidas y pendientes. OC validada permite
   reservar anticipadamente; sin OC se reserva al aprobar. Si hay faltante, solo
   permitir liberar cuando el acuerdo acepte entrega parcial. Surtidos entrega
   unicamente cantidades reservadas y debe exponer faltantes/reabastecimiento.
7. **Siguiente — revision completa:** mostrar los seis bloques, reglas
   bloqueantes/alertas, causa estructurada al devolver y comentario auditable.
   Operaciones no edita partidas ni condiciones acordadas.
8. **Migracion, despliegue y validacion:** aplicar migraciones despues de
   revisar contratos; recorrer con sesiones/roles autorizados OC y sin OC,
   reserva parcial y total, falta de stock, devolucion/reenvio, aprobacion,
   surtidos, pagos y balances; probar tambien usuario sin permiso y aislamiento
   por organizacion.
9. **Posterior — documentos y reglas:** implementar `documentos_cobro`,
   politicas configurables de liberacion logistica y vencimiento de reservas
   cuando se definan sus requisitos. No bloquear entregas por cobranza como
   regla universal.
10. **Posterior — propiedades:** definir el hito contractual que cambia una
   unidad inmobiliaria de apartada a vendida y completar los reportes del ciclo
   inmobiliario sin movimientos de almacen.

### Traspaso entre areas y responsabilidades

El flujo se separa por proceso, aunque una persona pueda recibir varios
permisos en empresas pequeñas:

1. **Comercial / vendedor — Embudo:** trabaja contacto, oportunidad y
   cotizacion; registra la aceptacion y evidencia del cliente; usa **Confirmar
   pedido** para enviarlo a Operaciones. No formaliza venta ni cuenta por
   cobrar; puede reservar inventario fisico si valida una OC del cliente.
   Despues consulta el avance, pero no registra
   entregas, modifica existencias ni confirma pagos por defecto.
2. **Operaciones comerciales / administracion — Ventas > Pedidos por revisar:**
   revisa cliente, evidencia y partidas. Puede **Regresar a Comercial** con
   motivo o **Aprobar y liberar a surtido**. Solo esta aprobacion crea/activa
   cliente, venta y cuenta por cobrar, y garantiza que los articulos stockables
   queden reservados sin duplicar una reserva creada desde una OC validada.
3. **Almacen / inventario — cola de Surtidos:** atiende pedidos aprobados y
   liberados,
   prepara partidas y registra entregas parciales o totales. Cada entrega
   reduce existencia fisica y reserva por la misma cantidad. Servicios y
   unidades inmobiliarias no aparecen como surtido de almacen.
4. **Finanzas / cobranza:** consulta cuentas por cobrar, emite o adjunta
   documentos segun el flujo del tenant y registra pagos. La cobranza no
   bloquea universalmente una entrega; cualquier politica de liberacion por
   anticipo o credito se definira despues.

El drawer de oportunidad conserva la cotizacion aceptada como antecedente de
solo consulta y muestra un resumen de pedido, venta/cobranza y logistica con
el acceso **Ver pedido**. No sera el centro operativo de revision ni de
surtido. Ventas incorpora una bandeja de revision operativa y la vista
de inventario una cola de surtidos; `/clientes` conserva su proposito actual.

Los traspasos deben registrar quien envio, reviso, confirmo, asigno y surtio,
con fecha y evento auditable. La bandeja debe permitir trabajo propio/equipo
segun el alcance que ya usa Tal-IA; no se confiaran permisos unicamente a
botones ocultos en la interfaz.

#### Revision de Operaciones antes de formalizar

Operaciones no vuelve a vender ni modifica silenciosamente el acuerdo. Su
responsabilidad es validar que el pedido aceptado este completo, ejecutable y
administrativamente correcto antes de formalizar venta/cuenta por cobrar y
comprometer inventario. La vista organiza la evidencia en seis bloques:

1. **Cliente:** identidad de persona/empresa, vinculacion entre ambas, datos
   fiscales o comerciales requeridos por el tenant y posibles duplicados.
2. **Aceptacion:** forma/fecha de aceptacion, evidencia asociada, vigencia de la
   OC cuando aplique y conciliacion del importe con la cotizacion aceptada.
3. **Partidas:** catalogo, descripcion, cantidad, unidad, precio, descuento,
   impuestos, moneda y totales comparados contra la cotizacion aceptada.
4. **Inventario:** partidas controladas, existencia fisica, cantidad reservada
   por este pedido, disponible y faltante/reposicion. Las unidades inmobiliarias
   no se mezclan con stock de almacen.
5. **Condiciones:** forma/terminos de pago, credito y anticipo, fecha/domicilio
   de entrega, envio y autorizaciones especiales cuando correspondan.
6. **Riesgos e inconsistencias:** discrepancias comerciales, cliente bloqueado,
   producto inactivo, datos/documentos faltantes y alertas de inventario.

La pantalla muestra lo capturado para compararlo; Operaciones no corrige datos
comerciales. Una discrepancia de cliente, precio, cantidad, descuento o
condiciones vuelve a Comercial. La devolucion guarda una causa estructurada
(evidencia faltante, OC discrepante, precio/descuento, cliente, partidas,
condiciones, inventario u otro), comentario, actor y fecha.

Las reglas se clasifican como **bloqueantes** o **alertas**. Aceptacion ausente,
cliente no identificable, partida invalida o total comercial discrepante
bloquean la aprobacion. Falta de stock, entrega parcial o fecha cercana pueden
ser alertas que Operaciones acepte segun las condiciones acordadas. Un bloqueo
no puede omitirse marcando una casilla.

#### Condiciones y evidencias como datos del acuerdo

Comercial captura las condiciones en la cotizacion mientras acuerda la venta:
forma/plazo de pago, credito, anticipo, si se permiten entregas parciales, fecha
y domicilio de entrega, costo de envio y observaciones comerciales. Al aceptar
el cliente, el pedido conserva una copia inmutable de esas condiciones para
que Operaciones las compare; no vuelve a capturarlas ni puede editarlas.

La evidencia del cliente admite OC, cotizacion firmada, contrato y adjuntos de
correo u otros documentos. Para WhatsApp, correo o llamada se guarda el tipo y
la referencia verificable disponible (por ejemplo fecha, asunto o registro de
llamada), con archivo cuando exista. La OC es un tipo de evidencia y puede
habilitar reserva anticipada; no es un requisito universal salvo politica
explicita del tenant.

#### Reserva parcial y faltante de inventario

Una reserva no puede exceder el disponible fisico del almacen. Si un pedido
requiere 10 unidades y solo hay 8 disponibles para reservar, se reserva 8 y se
registra 2 como pendiente de inventario. Comercial puede crear esa reserva
anticipada solo cuando valida una OC; no formaliza la venta ni libera a
Almacen. Sin OC, Operaciones determina la reserva al aprobar.

La cantidad pendiente solo permite aprobar/liberar cuando la condicion
capturada en la cotizacion indica que se acepta entrega parcial. Si no se
permiten parcialidades, el faltante bloquea la liberacion hasta reabastecer o
corregir comercialmente el pedido. Almacen solo puede entregar cantidades
reservadas. Surtidos muestra requerido, reservado, surtido y pendiente de
inventario; al recibir reposicion, se reserva el remanente mediante una accion
controlada y auditable. Una reserva previa por OC se conserva y nunca se duplica.

La implementacion actual solo contiene un checklist preliminar de tres
confirmaciones; no representa todavia esta revision de seis bloques. El
snapshot de pedido tiene importes y partidas basicos, pero la bandeja debe
exponer el detalle completo; la carga de evidencia actual se limita a OC; las
condiciones de pago/entrega requieren columnas explicitas en cotizacion/pedido.
La reserva vigente es de todo o nada y debe evolucionar a reserva parcial con
faltante visible en Surtidos. Datos fiscales, deteccion de duplicados y
requisitos documentales deben validarse contra las fuentes existentes y
configuracion del tenant antes de definir bloqueos automaticos. Estas brechas
no se consideran resueltas por el checklist preliminar.

### Autorizacion usando el RBAC existente

Se reutilizaran el motor de permisos por organizacion y la administracion de
roles existente; no se hardcodearan puestos ni se creara otro sistema de
autorizacion. La revision del catalogo actual encontro que `sales.manage` esta
asignado tambien a `agente` y `finanzas`, mientras que `settings.manage` es una
capacidad amplia de configuracion. El catalogo base no contiene una capacidad
especifica para enviar/confirmar pedidos o gestionar surtidos; por eso ninguno
de esos permisos genericos se considera suficiente para autorizar una salida
fisica de inventario.

El refactor definira capacidades acotadas dentro del catalogo RBAC actual —por
ejemplo, `sales.orders.submit`, `sales.orders.confirm`,
`inventory.fulfillment.view` e `inventory.fulfillment.manage`— y las asignara
mediante roles configurables por tenant. La matriz predeterminada se revisara
antes de implementarla; los codigos de puesto no seran la fuente de
autorizacion. A futuro se separaran igualmente los permisos de cuentas por
cobrar, pagos y emision documental.

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
dinero. El flujo objetivo descrito abajo mueve la formalización y reserva desde
la confirmación comercial hacia la aprobación de Operaciones.

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

### Pedido, revisión operativa e inventario — motor base desplegado; alineacion pendiente

El refactor añade una entidad propia para el compromiso del cliente, separada
de la oportunidad y de la venta:

- Una cotización aceptada y oportunidad ganada crea un pedido en
  `pendiente_confirmacion`; no reserva inventario.
- **Flujo actualmente desplegado:** Comercial envia el pedido a formalizacion;
  Operaciones lo confirma y esa accion crea/activa cliente, venta, cuenta por
  cobrar y reserva de stock transaccionalmente.
- **Flujo objetivo aprobado:** Comercial usa **Confirmar pedido** para registrar
  la evidencia y enviar a revision, sin formalizar venta ni cuenta por cobrar.
  Si valida una OC, reserva solo stock fisico; sin OC no reserva aun.
  Operaciones revisa y puede **Regresar a Comercial** con motivo o **Aprobar y
  liberar a surtido**. Solo esta aprobacion formaliza venta/cuenta por cobrar y
  garantiza la reserva, sin duplicar una reserva previa por OC.
- Para una unidad inmobiliaria, la aprobacion operativa la aparta/reserva por
  estado, sin movimiento de almacen ni cambio a vendida.
- Comercial registra la forma y fecha de confirmacion, la referencia de OC y
  observaciones al enviar a revision. Puede adjuntar una OC PDF privada de
  hasta 10 MB y abrirla con URL firmada temporal.
- El atajo de pago inmediato requiere ajustarse al nuevo punto de aprobacion;
  no debe formalizar antes de la revision de Operaciones. Si la OC ya reservo
  stock, conserva esa reserva sin duplicarla.
- La cancelación de una cotización libera únicamente pedidos no confirmados;
  un pedido confirmado requiere un flujo posterior de cancelación de venta y
  liberación logística.

El motor para entrega parcial o total ya registra encabezados en
`pedido_venta_entregas` y renglones en `pedido_venta_entrega_items`. Por cada
cantidad surtida crea una salida de almacen ligada al renglon, reduce la
existencia fisica y consume la misma parte de la reserva. El pedido mantiene
un estado logistico (`pendiente`, `parcial`, `entregado` o `no_aplica`)
independiente de cobranza. Sin embargo, la primera interfaz puso la accion en
el drawer comercial y uso `sales.manage`; esa ubicacion y autorizacion no
respetan la separacion de responsabilidades y deben retirarse/corregirse antes
de tratar la entrega como flujo operativo disponible.

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
autenticado de punta a punta. La cancelación de pedidos confirmados y definir
el hito contractual inmobiliario que marca una unidad como vendida siguen
pendientes.

La migración `20260924031112_sales_order_fulfillment.sql` ya se aplicó en
Supabase. El API y el panel se desplegaron el 2026-09-24; release del panel:
`20260924_031802`. Pasaron `py_compile`, ESLint, TypeScript y `git diff
--check`; el build de producción finalizó. `/api/health` y `/ventas` responden
HTTP 200. El endpoint exige autenticacion, pero su permiso vigente sigue siendo
demasiado amplio. Pendiente: retirarlo del alcance comercial, validar un
permiso RBAC acotado y crear las bandejas de formalizacion y surtidos antes de
hacer el recorrido autenticado con pedidos reales. La migracion de tablas/RPC
no equivale a tener el proceso operativo terminado.

### Refactor de traspaso y colas — desplegado el 2026-09-24; validacion autenticada pendiente

La migracion `20260924185828_sales_order_handoff_permissions.sql` agrega estados
de revision, asignacion de permisos del RBAC existente y eventos auditables de
envio, devolucion, confirmacion y cancelacion. El codigo del panel/API agrega la
bandeja **Pedidos por formalizar** y la cola **Surtidos**; la oportunidad solo
permite enviar a revision y consultar el progreso.

Las migraciones `20260924185828_sales_order_handoff_permissions.sql` y
`20260924195100_sales_order_handoff_fk_indexes.sql` se aplicaron en Supabase y
el release `20260924_191718` esta activo.
API y panel quedaron saludables; `/ventas/pedidos` y `/inventario/surtidos`
responden HTTP 200 y OpenAPI publica las rutas nuevas. Falta recorrer el flujo
con sesiones de Comercial, Operaciones, Inventario y usuarios sin esos
permisos; las respuestas HTTP no sustituyen esa validacion funcional.

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
