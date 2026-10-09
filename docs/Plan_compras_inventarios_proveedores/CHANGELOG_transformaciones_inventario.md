# Changelog — Transformaciones de inventario

Registro de decisiones, avances, cambios de alcance, verificaciones y
pendientes de la funcionalidad de transformación de productos.

## 2026-10-09

### Propuesta funcional y técnica — documentado

- Se definió que el producto comprado, por ejemplo `P1`, conserva su propio
  `catalog_item_id` y puede venderse directamente.
- Se definió que cada producto transformado tiene su propio `catalog_item_id`,
  precio y existencia.
- Se estableció que transformar consume inventario de `P1` y produce inventario
  de uno o varios productos resultantes.
- Se aclaró que una cantidad de `P1` consumida por una transformación no puede
  volver a venderse como `P1`.
- Se decidió ubicar la funcionalidad en **Operaciones**, con las opciones:
  - `Transformaciones → Fórmulas`.
  - `Transformaciones → Ejecutar transformación`.
  - `Transformaciones → Historial`.
- Se separaron los conceptos de fórmula reutilizable y orden de transformación
  ejecutada.
- Se contemplaron transformaciones de una entrada a una salida,
  transformaciones con varias entradas y coproductos o merma.
- Se estableció que los movimientos deben utilizar las fuentes existentes de
  inventario: `inventario_existencias` e `inventario_movimientos`.
- Se definió que la información estructural debe persistir en tablas,
  columnas, relaciones y constraints explícitos; no en `metadata` o `jsonb`.
- Se propusieron permisos independientes para consultar, administrar,
  ejecutar y revertir transformaciones.
- Se documentaron impactos en compras, recepciones, inventario, costos,
  listas de precios, reservas y ventas.

### Estado de implementación

- No hay tablas, migraciones, endpoints ni componentes implementados para
  transformaciones.
- No se modificó la base de datos.
- No se modificó backend ni frontend.
- El plan completo se encuentra en
  `2026-10-09_transformaciones_inventario_productos.md`.

### Verificación de contexto del tenant

- Tenant objetivo: `3dbb2a99-9d81-4233-8444-0990d53b93b3`.
- El tenant utiliza `catalog_items` como catálogo operativo.
- El tenant cuenta con productos nacionales e internacionales en órdenes de
  compra.
- El tenant tiene existencias y movimientos operativos, pero no tiene todavía
  fórmulas ni órdenes de transformación.
- La implementación debe comenzar con una validación de productos base,
  productos transformados, unidades, mermas y reglas de costo.

## Próximos cambios esperados

Las siguientes entradas deben registrar cada cambio por separado:

- decisión final del modelo de costos;
- migración de tablas, constraints, índices y RLS;
- permisos y asignaciones por rol;
- endpoints y schemas Pydantic;
- pantalla de fórmulas;
- pantalla de ejecución;
- movimientos transaccionales;
- integración con reservas, surtidos y ventas;
- pruebas locales y remotas;
- despliegue y validación autenticada por tenant y rol.

## Estados permitidos para este changelog

- `propuesto`: definido documentalmente, sin implementación.
- `en progreso`: implementación iniciada, con pendientes conocidos.
- `implementado localmente`: validado en el repositorio, aún no desplegado.
- `migrado`: cambios de base aplicados y verificados.
- `desplegado`: backend o frontend publicado.
- `validado`: probado con sesión, tenant, rol y resultado funcional esperado.
- `pendiente`: requiere una decisión, implementación o evidencia adicional.
