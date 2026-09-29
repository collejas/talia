# Alineación del módulo de compras, inventarios y proveedores

Fecha de revisión: 2026-09-29

Este documento es la referencia operativa actual para planear mejoras. Se
contrastaron los documentos del plan, el frontend, el backend, las migraciones
locales y el esquema remoto de Supabase. La revisión fue de solo lectura.

## Estado actual por capa

### Frontend

La entrada principal es `/compras`. Las vistas disponibles son resumen,
almacenes, proveedores, órdenes, pedimentos, agentes aduanales, inventario,
recepciones y pagos.

La carga inicial por vista se realiza en
`frontend/panel/src/app/compras/page.tsx`. La experiencia interactiva está
concentrada principalmente en
`frontend/panel/src/app/settings/compras/compras-workspace.client.tsx`.

Ya existen componentes específicos para el detalle de proveedores y los
pedimentos. El workspace principal sigue siendo un componente grande; las
mejoras amplias deben extraerse por módulo de forma incremental.

### Backend

Las rutas y schemas del dominio están en `backend/app/api/routes/crm.py` y el
acceso a datos está en `backend/app/repositories/crm.py`.

Ya existen endpoints para almacenes y existencias, ajustes de inventario,
proveedores, contactos y cuentas bancarias, órdenes de compra, pagos
programados, recepciones, agentes aduanales y pedimentos con gastos y
prorrateos.

Las operaciones usan `organizacion_id` y permisos backend. Sin embargo, las
estructuras de condiciones comerciales, condiciones de pago y logística aún
se reciben parcialmente como `dict`; antes de una ampliación importante debe
decidirse si se convierten en schemas Pydantic específicos.

### Base de datos remota

El esquema remoto contiene las entidades principales del plan, con RLS,
foreign keys, índices y restricciones por organización.

Conteos observados el 2026-09-29:

| Entidad | Filas |
| --- | ---: |
| `catalog_items` | 7211 |
| `almacenes` | 5 |
| `inventario_existencias` | 4 |
| `inventario_movimientos` | 8 |
| `proveedores` | 1 |
| `proveedor_items` | 0 |
| `proveedor_contactos` | 0 |
| `proveedor_cuentas_bancarias` | 0 |
| `ordenes_compra` | 2 |
| `ordenes_compra_items` | 5 |
| `recepciones_compra` | 1 |
| `pedimentos_importacion` | 2 |
| `pedimentos_importacion_gastos` | 1 |
| `pedimentos_importacion_prorrateos` | 5 |

La estructura de contactos y cuentas bancarias existe, pero no hay registros
operativos actualmente. Tampoco hay datos legacy pendientes de convertir en el
proveedor observado.

## Estado de implementación

### Implementado en base y backend

- compras nacionales e internacionales bajo `ordenes_compra`;
- snapshots de partidas y condiciones satélite;
- pagos programados y normalización a MXN;
- recepciones y movimientos de inventario;
- pedimentos con gastos, vinculación y prorrateo;
- proveedores con relaciones de contactos y cuentas bancarias;
- reservas, entregas parciales y cola de surtidos del flujo de ventas.

El historial remoto muestra migraciones de inventario, recepciones, contactos
de proveedores, fulfillment, revisión operativa y reservas. La existencia de
una migración aplicada no sustituye la validación autenticada del flujo en la
UI.

### Pendiente de validar antes de cerrar una mejora

- flujo autenticado por tenant y rol;
- devoluciones y reenvíos de pedidos;
- formalización financiera sin duplicar reservas;
- entregas parciales y completas con balances de existencia/reserva;
- expiración de reservas;
- consistencia de documentación entre migraciones locales y el historial
  remoto;
- permisos específicos para consultar cuentas bancarias completas.

## Observaciones de diseño para nuevas mejoras

1. Mantener `catalog_item_id` como vínculo explícito desde compra, recepción,
   inventario y venta.
2. Mantener los estados operativos fuera de `metadata` o JSON.
3. No agregar otro catálogo de países; usar `geo_paises`.
4. No mezclar la orden de compra de la organización con la orden de compra del
   cliente.
5. Para cuentas bancarias, devolver por defecto datos enmascarados y reservar
   la lectura completa para un permiso financiero explícito.
6. Para contratos nuevos, preferir schemas de creación, actualización y
   lectura separados.
7. No considerar una mejora terminada por tener solo la migración aplicada;
   debe existir evidencia de API, UI autenticada y efecto transaccional.

## Divergencia de migraciones

Las tablas y columnas esperadas existen en remoto, pero algunos archivos
locales especializados no aparecen con el mismo nombre en
`supabase_migrations.schema_migrations`. Antes de crear una nueva migración se
debe identificar si fueron aplicados con otro nombre, incluidos en un baseline
o ejecutados fuera del historial local. No se debe reaplicar DDL a ciegas.

## Siguiente paso

Definir la mejora sobre este estado real: módulo, rol ejecutor, regla de
negocio, entidades afectadas, permisos y evidencia de aceptación. La
implementación debe ser incremental y limitarse a las capas realmente
necesarias.

## Decisión funcional: almacén de tránsito y recepción de compras

La mejora acordada queda documentada en `PLAN_DESARROLLO.md`, Fase 6. El
criterio es mantenerla simple:

- cada tenant debe tener un único `ALMACEN EN TRANSITO`, creado de forma
  idempotente al provisionarse y regularizado para tenants existentes;
- una orden nueva usa ese almacén como destino predeterminado;
- `aprobada` significa compromiso firme y pendiente de recibir;
- `en_transito` significa embarque confirmado;
- `parcial` y `recibida` reflejan las cantidades efectivamente recibidas;
- aprobar o marcar en tránsito no crea stock físico ni movimientos;
- al recibir, el tenant puede conservar la mercancía en tránsito o seleccionar
  cualquier otro almacén activo de su organización;
- el almacén de recepción de cada recepción es la fuente del movimiento y de
  la existencia física, por lo que no debe ser obligatorio que coincida con el
  destino predeterminado de la orden;
- las existencias en almacenes de tipo `transito` no deben contar como
  disponibles para venta o reserva.

Esta decisión aún no se considera implementada. La orden aprobada observada
en la revisión apunta al almacén de tránsito, pero no genera inventario, lo
cual es correcto; falta hacer explícitos el estado de embarque, el valor
predeterminado por tenant y la selección del almacén real al registrar la
recepción.
