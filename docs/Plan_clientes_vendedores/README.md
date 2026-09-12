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
`20260912152756_auto_create_cliente_from_won_opportunity.sql` prepara un
trigger para cubrir cambios hechos desde el panel, servicios internos o SQL,
y ejecuta un backfill idempotente de oportunidades ya ganadas. Ya fue aplicada
mediante Supabase MCP; queda pendiente sustituirla por la regla definitiva de
creación de cliente posterior al pago.

## 13) Modelo comercial: venta y pago antes de crear cliente

### Regla de negocio

Una cotización aceptada representa un compromiso comercial y mueve la
oportunidad a ganada, pero todavía no confirma una venta cobrada. El cliente
se crea o activa únicamente cuando existe un pago confirmado asociado a la
venta.

```text
contacto / empresa
└── una o muchas oportunidades
    └── una cotización aceptada por oportunidad
        └── oportunidad ganada
            └── venta formal
                └── uno o varios pagos
                    └── cliente creado o actualizado
```

Una vez que el contacto o empresa ya es cliente, cada nueva oportunidad
ganada se conserva en su historial; no se sobrescribe la oportunidad
anterior.

### Modelo de datos objetivo

Se mantiene `public.clientes` como maestro del cliente. El modelo debe
incorporar:

- `public.oportunidades.cliente_id`: relación de muchas oportunidades con un
  cliente.
- `public.ventas`: venta formal asociada a organización, cliente, cuenta,
  oportunidad y cotización.
- `public.venta_items`: productos o servicios vendidos, con cantidad, precio,
  descuentos, impuestos y subtotal.
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
ventas 1 ─── N pagos
```

La relación histórica debe usar columnas y foreign keys reales. No se debe
guardar el vínculo principal entre venta, oportunidad, cliente o pago dentro
de `metadata`.

### Estados y reglas de integridad

- Sólo puede existir una cotización aceptada activa por oportunidad.
- Una oportunidad ganada debe conservar su cotización aceptada.
- Una venta debe referenciar la oportunidad y cotización que la originaron.
- El primer pago confirmado crea o activa el cliente.
- La venta puede distinguir entre `pendiente_pago`, `pago_parcial`,
  `pagada`, `cancelada` y `reembolsada`.
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
   oportunidad como ganada, sin crear todavía el cliente.
2. Crear `oportunidades.cliente_id` y conservar todas las oportunidades del
   mismo cliente.
3. Crear `ventas` y `venta_items` con restricciones, índices y RLS por tenant.
4. Crear `pagos` para soportar anticipos, parcialidades, liquidaciones,
   devoluciones y cancelaciones.
5. Crear o activar el cliente al registrar el primer pago confirmado.
6. Reconciliar los clientes creados por el flujo anterior y conservar la
   trazabilidad de su origen.
7. Actualizar APIs, panel de clientes, detalle de oportunidad, ventas y
   reportes.
8. Validar el flujo de primera compra y compra recurrente por contacto,
   empresa y cliente.

### Estado de implementación al 2026-09-12

Ya están aplicados en Supabase los puntos estructurales 2, 3, 4 y parte del
5:

- `oportunidades.cliente_id` vincula las 42 oportunidades ganadas existentes
  con su cliente, sin asociar oportunidades abiertas o perdidas.
- Existe una restricción para impedir más de una cotización aceptada por
  oportunidad.
- Existen `ventas`, `venta_items` y `pagos`, con foreign keys tenant-safe,
  índices, constraints monetarios y RLS.
- La función protegida `crm_registrar_pago_confirmado` formaliza cliente,
  venta, partidas y pago en una sola transacción, usando la referencia de
  pago como clave de idempotencia.
- La API expone
  `POST /crm/cotizaciones/{cotizacion_id}/pago-confirmado`.
- La vista de clientes ya tiene preparada la ruta de detalle
  `/clientes/{clienteId}` con las secciones Resumen, Oportunidades,
  Cotizaciones, Ventas, Pagos y Documentos.
- La tabla principal de clientes enlaza cada registro con su detalle
  comercial, en lugar de enviarlo directamente a la empresa o al contacto.

Queda pendiente retirar el trigger histórico que crea clientes al ganar una
oportunidad y reemplazar el endpoint manual de conversión. Se hará cuando el
nuevo endpoint esté desplegado y validado, para no dejar una ventana sin
flujo operativo.
