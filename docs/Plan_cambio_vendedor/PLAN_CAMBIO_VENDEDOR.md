# Plan: cambio masivo y atómico de vendedor

**Estado:** documento inicial de definición  
**Fecha:** 2026-09-12  
**Alcance inicial:** Contactos, Empresas, Oportunidades, Clientes y Embudo

## 1. Objetivo

Permitir que usuarios con permisos elevados cambien en un solo paso el vendedor o agente responsable de registros seleccionados desde las vistas de Contactos, Empresas y Oportunidades.

La operación debe ser **atómica**: todos los cambios relacionados se confirman juntos o todos se revierten. No debe quedar una empresa con contactos antiguos, una oportunidad con otro vendedor o un cliente generado con una asignación distinta a la operación confirmada.

## 2. Reglas de negocio confirmadas

- El lote admite máximo **100 registros de origen**.
- El vendedor destino es obligatorio.
- No se permite dejar registros sin vendedor.
- El destino debe pertenecer a la misma organización y tener `es_vendedor = true`.
- `*.reassign.any` permite reasignar cualquier registro del tenant.
- `*.reassign.team` permite reasignar únicamente registros y destinos dentro del alcance jerárquico del usuario.
- La autorización se valida en backend; la UI únicamente refleja esa autorización.
- Los IDs repetidos se deduplican antes de ejecutar la operación.
- Si una validación, actualización o auditoría falla, se revierte el lote completo.

## 3. Cascada por entidad de origen

### 3.1 Desde Contactos

Al reasignar contactos seleccionados:

1. Reasignar los contactos seleccionados.
2. Resolver las empresas relacionadas.
3. Reasignar esas empresas.
4. Reasignar todos los demás contactos relacionados con esas empresas.
5. Reasignar las oportunidades relacionadas.
6. Reasignar el cliente generado por cualquier oportunidad ganada relacionada.
7. Actualizar las conversaciones relacionadas con el contacto, la empresa o cualquiera de sus oportunidades cuando exista una relación inequívoca, aunque estén abiertas, pendientes o cerradas.
8. Registrar el histórico de cada entidad modificada.

### 3.2 Desde Empresas

Al reasignar empresas seleccionadas:

1. Reasignar las empresas.
2. Reasignar todos sus contactos relacionados.
3. Reasignar todas sus oportunidades relacionadas.
4. Reasignar los clientes generados por oportunidades ganadas relacionadas.
5. Actualizar las conversaciones relacionadas con la empresa, sus contactos o cualquiera de sus oportunidades cuando exista una relación inequívoca, aunque estén abiertas, pendientes o cerradas.
6. Registrar el histórico de cada entidad modificada.

La empresa no debe sobrescribir relaciones de contactos que estén fuera del tenant. Todas las relaciones deben resolverse por foreign keys y organización. El estado de la conversación no limita la reasignación: las conversaciones cerradas también reciben el nuevo vendedor para mantener consistente el histórico.

### 3.3 Desde Oportunidades

Al reasignar oportunidades seleccionadas:

1. Reasignar únicamente las oportunidades seleccionadas.
2. Si la oportunidad está ganada y tiene un cliente generado, reasignar también ese cliente.
3. Actualizar todas las conversaciones relacionadas con las oportunidades seleccionadas, incluyendo conversaciones vinculadas directamente a la oportunidad aunque no exista una coincidencia adicional por contacto y aunque la conversación esté cerrada.
4. No cambiar automáticamente el propietario del contacto ni de la empresa.

Si varias oportunidades ganadas apuntan al mismo cliente, el cliente se actualiza una sola vez y se registra en el mismo lote.

### 3.4 Vista Clientes

La vista Clientes debe mostrar el vendedor resultante y el histórico de reasignaciones, pero no será inicialmente el punto de entrada de la operación masiva.

Esto evita reasignar entidades ambiguas hasta confirmar si el cliente es una entidad generada exclusivamente desde oportunidades ganadas o si puede tener otras fuentes de creación.

### 3.5 Vista Embudo

El Embudo conservará la reasignación individual y las acciones operativas del pipeline. La reasignación masiva se ofrecerá inicialmente desde Oportunidades, donde existe un listado adecuado para selección y filtros.

## 4. Permisos

Se reutilizarán los permisos existentes:

- `contacts.reassign.team`
- `contacts.reassign.any`
- `pipeline.reassign.team`
- `pipeline.reassign.any`

Para Empresas se agregarán permisos específicos:

- `accounts.reassign.team`
- `accounts.reassign.any`

La UI debe ocultar la acción si el usuario no tiene permiso. El backend debe volver a validar:

- sesión autenticada;
- organización actual;
- permiso `any` o `team` de la entidad de origen;
- alcance jerárquico del actor y del vendedor destino;
- existencia y pertenencia de cada registro;
- condición de vendedor del destino.

No se debe usar únicamente el nombre del rol ni confiar en IDs enviados por el navegador.

## 5. Modelo de operación atómica

La operación debe resolverse en un único endpoint por tipo de origen o mediante un servicio común con contratos diferenciados.

Flujo transaccional:

```text
validar sesión, tenant, permiso y límite
    ↓
resolver entidades relacionadas y deduplicar
    ↓
validar vendedor destino y scope de todos los registros
    ↓
bloquear/validar el conjunto para evitar cambios concurrentes inconsistentes
    ↓
actualizar empresas, contactos, oportunidades, clientes y conversaciones
    ↓
insertar histórico del lote y de cada entidad
    ↓
confirmar transacción
```

Si falla cualquier paso después de iniciar la transacción, se ejecuta rollback completo.

No se deben ejecutar 100 llamadas independientes desde React. La respuesta debe representar el resultado de una sola transacción.

## 6. Auditoría histórica

La operación debe conservar dos niveles de histórico:

### Registro de lote

Debe contener como mínimo:

- identificador del lote;
- organización;
- usuario actor;
- entidad de origen;
- vendedor destino;
- cantidad solicitada;
- cantidad total afectada por la cascada;
- motivo;
- fecha de inicio y confirmación;
- resultado.

### Detalle por entidad

Cada cambio debe guardar:

- lote de operación;
- entidad afectada: empresa, contacto, oportunidad, cliente o conversación;
- ID del registro;
- vendedor anterior;
- vendedor nuevo;
- entidad e ID que originaron la cascada;
- fecha;
- actor.

El histórico debe insertarse dentro de la misma transacción. Si no puede guardarse, se revierte también la reasignación.

Los datos estructurales del histórico deben ser columnas explícitas, con foreign keys e índices por organización, lote, entidad, registro y fecha. Un campo JSON opcional solo podrá contener contexto variable no necesario para consultar, filtrar o auditar la operación principal.

## 7. Contratos de API propuestos

### Contactos

```text
POST /crm/personas/reasignar-lote
```

```json
{
  "persona_ids": ["uuid-1", "uuid-2"],
  "propietario_usuario_id": "uuid-vendedor",
  "alinear_conversaciones": true,
  "motivo": "Redistribución comercial"
}
```

### Empresas

```text
POST /crm/cuentas/reasignar-lote
```

```json
{
  "cuenta_ids": ["uuid-1", "uuid-2"],
  "propietario_usuario_id": "uuid-vendedor",
  "alinear_conversaciones": true,
  "motivo": "Redistribución comercial"
}
```

### Oportunidades

```text
POST /crm/oportunidades/reasignar-lote
```

```json
{
  "oportunidad_ids": ["uuid-1", "uuid-2"],
  "asignado_usuario_id": "uuid-vendedor",
  "alinear_conversaciones": true,
  "motivo": "Redistribución comercial"
}
```

La respuesta debe incluir el ID del lote y el resumen de entidades afectadas. En una operación atómica exitosa no debe existir un resultado parcial persistido.

## 8. Experiencia de usuario

En Contactos, Empresas y Oportunidades:

- mostrar selección múltiple;
- mostrar el contador de seleccionados;
- mostrar la acción `Cambiar vendedor` solo con permiso;
- abrir un selector de vendedores con el scope permitido;
- informar que la acción también puede afectar empresas, contactos, oportunidades y clientes;
- mostrar un resumen antes de confirmar;
- exigir confirmación explícita;
- mostrar el lote actualizado y refrescar las filas afectadas;
- conservar los filtros y evitar seleccionar registros fuera del universo visible sin indicarlo.

El selector debe usar nombres operativos de usuario, no códigos internos de roles o proveedores.

## 9. Resolución de relaciones

La cascada debe utilizar relaciones persistidas:

- contacto → empresa;
- empresa → contactos;
- contacto/empresa → oportunidades;
- oportunidad ganada → cliente generado;
- oportunidad → conversación.
- contacto → conversación.

No se deben inferir relaciones por nombre, teléfono o correo cuando exista más de una coincidencia. La relación directa de una oportunidad con una conversación debe tener prioridad sobre cualquier resolución indirecta por contacto. Las conversaciones abiertas, pendientes y cerradas siguen el mismo tratamiento de asignación; la operación no reabre, modifica ni elimina su estado conversacional. Las relaciones ambiguas deben bloquear la operación completa o quedar como una regla explícita de negocio antes de implementar.

## 10. Concurrencia e integridad

Antes de modificar:

- volver a leer los registros dentro de la transacción;
- verificar que sigan perteneciendo al tenant;
- verificar que sigan siendo reasignables;
- evitar actualizar registros eliminados o modificados de forma incompatible;
- usar bloqueo de filas o una estrategia equivalente cuando sea necesario.

Las actualizaciones deben respetar foreign keys, RLS y funciones de autorización. Las funciones `SECURITY DEFINER`, si se utilizan, deben limitarse al servicio autorizado y validar explícitamente la organización y el actor.

## 11. Pruebas mínimas

### Autorización

- `owner` y `admin` con alcance total.
- Usuario con `*.reassign.any` en todo el tenant.
- Usuario con `*.reassign.team` fuera de scope: rechazado.
- Usuario sin permiso: `403`.
- Destino que no es vendedor: rechazado.
- Destino de otra organización: rechazado.

### Cascada

- Contacto con empresa, contactos relacionados, oportunidad abierta y oportunidad ganada con cliente.
- Empresa con varios contactos y oportunidades.
- Oportunidad ganada con cliente.
- Varias oportunidades apuntando al mismo cliente.
- Contactos sin empresa.
- Oportunidad con conversación abierta, pendiente y cerrada.
- Registros duplicados en el request.

### Atomicidad

- Error al validar una entidad: cero cambios persistidos.
- Error al actualizar una entidad: rollback de todas las tablas.
- Error al actualizar una conversación de una oportunidad: rollback de toda la reasignación.
- Error al insertar auditoría: rollback de toda la reasignación.
- Lote de 100 registros aceptado.
- Lote de 101 registros rechazado.
- Reintento controlado sin duplicar cambios históricos incorrectamente.

### Evidencia funcional

Después de una prueba autenticada se debe comprobar:

- vendedor actual de cada entidad;
- cliente generado por oportunidad ganada;
- conversaciones actualizadas;
- existencia del registro de lote;
- detalle histórico con vendedor anterior y nuevo;
- rollback real en el caso de fallo inducido.

## 12. Orden de implementación

1. Confirmar el modelo exacto de relación entre oportunidades ganadas y clientes.
2. Diseñar tablas o extensión de auditoría histórica.
3. Crear permisos de Empresas.
4. Implementar servicio transaccional común.
5. Crear endpoints de lote.
6. Agregar pruebas de tenant, permisos, scope, cascada y rollback.
7. Ampliar `ClientDataTable` para acciones de selección.
8. Integrar Contactos.
9. Integrar Empresas.
10. Integrar Oportunidades.
11. Mostrar histórico en Clientes y en el módulo de auditoría.
12. Ejecutar validación autenticada y despliegue controlado.

## 13. Pendientes antes de codificar

- Confirmar el nombre real de la tabla o relación que vincula cliente generado con oportunidad ganada.
- Confirmar el campo o relación exacta que vincula directamente una conversación con una oportunidad; cuando exista, tendrá prioridad sobre la relación por contacto.
- Confirmar los roles iniciales que recibirán `accounts.reassign.team` y `accounts.reassign.any`.
- Definir si el motivo será obligatorio o únicamente recomendado.
- Definir el texto final de confirmación para informar correctamente el alcance de la cascada.

## 14. Criterio de terminado

La funcionalidad se considerará terminada únicamente cuando:

- el usuario autorizado pueda ejecutar un lote desde cada vista definida;
- el backend aplique permisos, tenant y scope;
- todas las entidades de la cascada se actualicen en una sola transacción;
- el vendedor destino sea válido;
- cualquier fallo produzca rollback completo;
- exista histórico de lote y detalle por entidad;
- las vistas Clientes y Embudo reflejen el resultado real;
- existan pruebas autenticadas y evidencia de persistencia.
