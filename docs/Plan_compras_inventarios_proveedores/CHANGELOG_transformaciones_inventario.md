# Changelog — Transformaciones de inventario

Registro de decisiones, avances, cambios de alcance, verificaciones y
pendientes de la funcionalidad de transformación de productos.

## 2026-10-09

### Primera fase vertical — implementación local en progreso

- Se agregó la migración local
  `supabase/migrations/20261009_120000_inventory_transformations.sql`.
- Se modelaron fórmulas, componentes, salidas, órdenes de transformación y
  snapshots de consumo/producción con columnas, foreign keys, índices y
  constraints tenant-safe.
- Se agregaron tipos explícitos de movimientos para consumo, producción,
  merma y reversa de transformaciones.
- Se agregaron RPC transaccionales para crear fórmulas, crear órdenes y
  ejecutar órdenes contra existencias.
- Se agregaron permisos `inventory.transformations.view`,
  `inventory.transformations.manage`, `inventory.transformations.execute` y
  `inventory.transformations.reverse`.
- Se agregaron schemas, repositorio y endpoints FastAPI para listar, crear,
  activar, ordenar y ejecutar transformaciones.
- Se agregó la navegación **Operación → Transformaciones** y un primer panel
  local para fórmulas y ejecución de una entrada y una salida.
- La migración fue validada en una transacción reversible contra Supabase; la
  transacción terminó con `ROLLBACK` y no dejó cambios remotos.
- Verificación local: `py_compile` y `git diff --check` correctos.
- Pendiente: instalar o disponer del TypeScript local del panel; `npx tsc`
  no fue válido porque el repositorio no tiene dependencias instaladas y npm
  intentó usar un paquete `tsc` no compatible.
- Pendiente: aplicar la migración remota, activar fórmulas existentes o
  importar fórmulas iniciales, validar costos, probar con sesión autenticada y
  completar historial, reversas y coproductos.

### Corrección 502 en lectura de transformaciones — migrado

- Diagnóstico: las tablas de transformaciones tenían RLS habilitado, pero no
  tenían políticas `SELECT` ni grants para el rol `authenticated`.
- El BFF reenviaba correctamente el JWT del usuario; Supabase rechazaba la
  consulta anidada y el backend la convertía en `502`.
- Se agregó
  `supabase/migrations/20261009_123000_inventory_transformations_rls.sql` con
  grants de lectura y políticas tenant-safe basadas en
  `usuario_organizacion_id(auth.uid())`.
- La migración fue validada primero con `ROLLBACK` y después aplicada en
  Supabase.
- Se verificó con el rol `authenticated` que un usuario del tenant puede ver
  únicamente las filas de su organización; actualmente no existen fórmulas,
  por lo que el resultado visible es vacío (`0` filas), no un error.
- Las mutaciones se ajustaron localmente para usar `service_role` solo desde
  el backend autorizado; no se modificaron existencias.
- Pendiente: desplegar el ajuste local del repositorio y probar creación y
  ejecución con usuario autenticado.

### Corrección 401 al crear fórmulas — ajuste local

- **Síntoma:** `POST /api/operacion/transformaciones` respondía `401` aunque
  la sesión estuviera activa.
- **Causa:** el proxy BFF reenviaba el JWT y `X-Organizacion-Id`, pero omitía
  `X-Usuario-Id`; el endpoint necesita ese identificador para `creado_por`.
- **Cambio:** el proxy deriva el usuario del JWT de sesión y lo reenvía como
  `X-Usuario-Id`. La autorización continúa validándose en FastAPI mediante
  permisos y tenant.
- **Pendiente:** publicar el panel y comprobar en navegador que la fórmula se
  crea y activa correctamente.

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
