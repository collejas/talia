# Ventas inmobiliarias con brokers y agentes externos

Fecha: 2026-10-30 (UTC)  
Estado: Propuesta funcional pendiente de implementación

## Objetivo

Permitir que una desarrolladora registre en Talia una reserva, apartado o
venta generada por una inmobiliaria o broker externo que no tiene acceso a la
aplicación.

La operación debe conservar la trazabilidad inmobiliaria completa, pero no
debe atribuir la venta al usuario interno que la captura.

## Principio principal

El sistema debe separar tres responsabilidades:

```text
Usuario interno
  Registra, valida y da seguimiento

Agente externo
  Genera comercialmente la operación y recibe la atribución

Unidad inmobiliaria
  Conserva el estado, precio y expediente de la venta
```

El usuario interno que captura la operación solo queda registrado para
auditoría. No debe recibir la venta en sus métricas comerciales.

## Entidades principales

### Socio comercial externo

Catálogo de inmobiliarias, brokers o agencias externas.

Datos mínimos:

- Nombre comercial.
- Tipo: inmobiliaria, broker independiente o agencia.
- Teléfono y correo.
- Datos fiscales, si aplican.
- Estado: activo o inactivo.
- Condiciones generales de comisión.

### Agente externo

Persona que trabaja para el socio comercial.

Datos mínimos:

- Nombre completo.
- Socio comercial al que pertenece.
- Teléfono y correo.
- Estado.
- Identificador o referencia externa.

El agente externo no será un registro de `usuarios` y no tendrá permisos ni
sesión en Talia.

### Operación inmobiliaria

La operación debe distinguir claramente el origen comercial y la auditoría:

- `origen_venta`: `interno` o `externo`.
- `socio_comercial_externo_id`.
- `agente_externo_id`.
- `registrado_por_usuario_id`.
- `validado_por_usuario_id`.
- `responsable_interno_usuario_id`.
- `referencia_externa`.
- `fecha_evento_externo`.
- Datos explícitos de comisión.

No se debe reutilizar `agente_usuario_id` para representar a un agente externo.
Los usuarios internos y los agentes externos tienen responsabilidades y
permisos diferentes.

## Flujo de registro

Desde la vista de Propiedades, un usuario autorizado selecciona:

> Registrar operación externa

El formulario solicita:

1. Desarrollo, macrolote, manzana y unidad.
2. Cliente o comprador.
3. Inmobiliaria o broker externo.
4. Agente externo.
5. Estado de la operación:
   - Reservada.
   - Apartada.
   - Vendida/cerrada.
6. Fecha del evento.
7. Folio o referencia externa.
8. Precio de la operación.
9. Datos y documentos de respaldo.
10. Observaciones.

El proceso debe ser transaccional:

```text
Registrar operación externa
        |
        +-- Vincular cliente
        +-- Vincular unidad
        +-- Crear o vincular oportunidad
        +-- Crear propuesta inmobiliaria
        +-- Cambiar estado de unidad
        +-- Registrar broker y agente externo
        +-- Registrar comisión
        +-- Crear historial y auditoría
```

## Estados y validación

Se utilizarán los estados inmobiliarios existentes:

- `reservada`: bloqueo temporal, con fecha de vencimiento cuando aplique.
- `apartada`: proceso posterior con documentación y validación.
- `vendida`: operación cerrada y validada internamente.
- `cancelada`: operación anulada, con motivo y movimiento histórico.

Una reserva externa no debe permanecer indefinidamente sin vencimiento. Si el
broker no proporciona un plazo, el usuario interno debe capturar uno antes de
guardar la operación.

Una venta reportada por un broker no debe marcarse automáticamente como
vendida definitiva. Primero debe pasar por la validación interna definida para
operaciones inmobiliarias.

## Precio de la unidad

El precio se toma de la ficha de la unidad:

- Precio fijo.
- Área en metros cuadrados por precio por metro cuadrado.

El agente externo no puede modificar el precio desde fuera de la aplicación.
Un usuario con permiso de alto nivel puede autorizar una diferencia desde el
modal de reserva o apartado, registrando:

- Precio establecido.
- Precio autorizado.
- Motivo.
- Usuario que autorizó.
- Fecha de autorización.

## Oportunidad y propuesta inmobiliaria

Para que la operación aparezca correctamente en reportes y dashboards, el
sistema debe crear o vincular una oportunidad interna con:

- Origen comercial externo.
- Cliente relacionado.
- Unidad inmobiliaria relacionada.
- Agente externo.
- Responsable interno.
- Propuesta inmobiliaria.

La oportunidad se crea para mantener la trazabilidad del proceso, pero la
atribución comercial se reporta al agente externo.

## Comisiones

La operación debe guardar:

- Porcentaje de comisión.
- Monto calculado.
- Base usada para el cálculo.
- Estado: pendiente, autorizada, pagada o cancelada.
- Fecha de autorización.
- Fecha de pago.
- Usuario que autorizó el pago.

La comisión no debe alterar el precio comercial de la unidad ni el monto
ganado de la desarrolladora.

## Reportes

Los reportes deben separar:

- Ventas internas.
- Ventas externas.
- Ventas por inmobiliaria.
- Ventas por agente externo.
- Ventas por usuario interno registrado.
- Comisiones pendientes y pagadas.
- Reservas y apartados externos.
- Ventas por desarrollo, macrolote, manzana y unidad.

El usuario interno que registra la operación debe aparecer en auditoría, pero
no como vendedor externo ni como propietario de la venta.

## Permisos

Se recomienda crear permisos específicos:

- `inmobiliaria.operaciones_externas.create`.
- `inmobiliaria.operaciones_externas.validate`.
- `inmobiliaria.brokers.manage`.
- `inmobiliaria.commissions.manage`.

Los vendedores comunes no deberían registrar directamente una venta externa
si no tienen autorización. La operación debe quedar sujeta a revisión de un
coordinador, gerente o administrador operativo.

## Reglas de integridad

- Una unidad no puede tener dos operaciones comerciales activas.
- Una operación externa debe tener agente externo o socio comercial definido.
- El usuario que registra la operación siempre debe quedar auditado.
- Una unidad apartada o vendida externamente no debe aparecer disponible para
  vendedores internos.
- Una venta externa debe tener cliente y unidad vinculados.
- Una venta externa no puede cerrarse sin pasar por la validación requerida.
- Un precio diferente al establecido requiere autorización y motivo.
- Las cancelaciones deben liberar la unidad cuando corresponda y registrar el
  movimiento.

## Fases de implementación

### Fase 1: Catálogo y registro

- Crear socios comerciales externos y agentes externos.
- Crear permisos.
- Agregar origen y relaciones externas a la operación inmobiliaria.
- Crear acción `Registrar operación externa`.
- Vincular cliente, oportunidad, propuesta y unidad.

### Fase 2: Validación y comisiones

- Flujo de revisión interna.
- Documentos y evidencia.
- Cálculo y autorización de comisiones.
- Historial de cambios.

### Fase 3: Reportes

- Filtros por origen de venta.
- Reportes por inmobiliaria y agente.
- Reportes de comisiones.
- Exportación CSV.
- Indicadores de ventas externas.

### Fase 4: Portal externo opcional

En una etapa posterior se podría ofrecer un acceso limitado al broker para:

- Consultar sus operaciones.
- Registrar prospectos.
- Consultar disponibilidad autorizada.
- Subir documentación.

Este portal no debe formar parte de la primera fase. La primera versión debe
ser capturada y controlada por usuarios internos.

## Relación con la documentación existente

Este plan debe integrarse con:

- `propuesta_inmobiliaria_constructor.md`.
- `automatizacion_operacion_venta_inmobiliaria.md`.
- `plan_operaciones_inmobiliarias_apartado_reservado_vendido.md`.
- `validacion_apartado_inmobiliario.md`.
- `plan_ventas_integradas.md`.

La operación externa no crea un flujo comercial separado. Utiliza el mismo
flujo inmobiliario, agregando únicamente el origen externo, el agente
responsable y la comisión.
