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

