# Propuesta: inventario operativo y control de almacenes en Operación

**Fecha:** 2026-10-06  
**Estado:** Fase 1 implementada en código y base de datos; pendiente de desplegar backend y frontend.

## Objetivo

Dar al encargado de almacén una vista propia para consultar y operar el inventario, los almacenes, los movimientos y las entregas, sin depender de la vista de Compras ni otorgarle permisos comerciales o financieros.

## Decisión propuesta

Crear una nueva sección dentro de **Operación**:

```text
Operación
├── Órdenes de venta
├── Surtidos
└── Inventario y almacenes
```

La vista debe ser independiente de Compras, pero reutilizar las entidades, consultas, servicios y componentes que ya existen. La ruta propuesta es `/operacion/inventario` o `/operacion/almacenes`; debe definirse una sola ruta al iniciar la implementación.

No se recomienda reutilizar completa la pantalla de Compras porque mezcla proveedores, órdenes de compra, costos, recepción y procesos administrativos con las tareas diarias del almacén. Esto provocaría una interfaz confusa y podría conceder acceso innecesario a costos, proveedores o configuraciones.

## Qué se reutiliza

- Productos y partidas del catálogo.
- Almacenes y selección de almacén.
- Existencia actual, reservada, disponible y en tránsito.
- Cálculo de inventario en tránsito.
- Historial y auditoría de movimientos.
- La operación existente de ajustes de inventario mediante `crm_ajustar_inventario`.
- La vista y los estados actuales de `inventario/surtidos`.
- Patrones existentes de tablas, filtros, estados vacíos, impresión y permisos.

La vista actual de inventario del catálogo puede servir como base técnica para la consulta de existencias, pero no debe convertirse directamente en la pantalla operativa final porque actualmente es de solo lectura y está orientada al catálogo/precios.

## Alcance funcional propuesto

### 1. Existencias

Debe permitir seleccionar almacén y consultar rápidamente:

- Producto, SKU y unidad.
- Existencia física.
- Existencia reservada.
- Existencia disponible.
- Cantidad en tránsito.
- Mínimo o punto de alerta, cuando exista.
- Alertas de faltante o existencia baja.

Filtros iniciales: almacén, producto, SKU, disponibilidad y alertas.

### 2. Movimientos

Historial de entradas, salidas, reservas, liberaciones, entregas, recepciones y ajustes manuales. Cada movimiento debe mostrar:

- Fecha y hora.
- Producto y almacén.
- Tipo de movimiento.
- Cantidad y saldo resultante.
- Documento o proceso origen, cuando aplique.
- Usuario responsable.
- Motivo del ajuste, cuando aplique.

### 3. Ajustes de inventario

El encargado autorizado podrá registrar entradas o salidas manuales con:

- Almacén.
- Producto.
- Cantidad.
- Tipo de ajuste.
- Motivo obligatorio.
- Referencia opcional a un documento operativo.

El ajuste debe actualizar el inventario dentro de una operación transaccional y generar su movimiento de auditoría. No debe modificarse directamente la existencia desde el frontend.

### 4. Surtidos y entregas

La nueva vista debe enlazar con la operación existente de surtidos y entregas, sin duplicar su lógica. Puede mostrar un resumen de pedidos pendientes, en ruta y entregados, pero las acciones de preparar salida, marcar en ruta, confirmar entrega y registrar incidencias deben conservar una única fuente de verdad en `inventario/surtidos`.

## Separación de responsabilidades

| Compras | Operación / Almacén |
|---|---|
| Proveedores y contactos | Existencias por almacén |
| Órdenes de compra | Movimientos de inventario |
| Recepción de mercancía | Ajustes operativos autorizados |
| Costos y condiciones de compra | Reservas y disponibilidad |
| Pedimentos y documentación de compra | Preparación, ruta y entrega |

El operador de almacén no debe recibir por defecto permisos de administración de Compras, consulta de costos, gestión de proveedores ni configuración general.

## Permisos propuestos

| Permiso | Alcance |
|---|---|
| `inventory.stock.view` | Consultar existencias por almacén. Ya existe y debe mantenerse como permiso de lectura. |
| `inventory.movements.view` | Consultar el historial de movimientos y su auditoría. |
| `inventory.stock.adjust` | Crear ajustes manuales de inventario. |
| `inventory.warehouse.manage` | Crear, editar o desactivar almacenes. Debe asignarse solo a responsables autorizados. |
| `inventory.fulfillment.view` | Consultar surtidos y entregas. |
| `inventory.fulfillment.manage` | Preparar salidas, marcar en ruta, confirmar entregas y registrar incidencias. |
| `inventory.costs.view` | Permiso opcional para costos; no debe asignarse al perfil operativo por defecto. |

La vista no debe depender de `settings.manage` para operar inventario. Si alguna función actual de ajustes usa ese permiso, debe separarse gradualmente mediante permisos específicos, conservando compatibilidad durante la migración.

## Consideraciones de backend y base de datos

- Todos los endpoints deben validar tenant, usuario y permiso antes de consultar o modificar información.
- Las consultas deben reutilizar las fuentes existentes de existencias, reservas, tránsito, movimientos y almacenes; no se deben crear saldos paralelos.
- Las mutaciones deben ejecutarse mediante servicios transaccionales o RPC protegida, con validación de concurrencia y sin permitir existencias negativas salvo una regla de negocio explícita.
- Los ajustes deben exigir motivo y registrar usuario, fecha, almacén, producto, cantidad y documento de origen mediante columnas explícitas.
- La información estructural de inventario y movimientos no debe guardarse en `metadata` o `jsonb`.
- Los costos deben permanecer separados de la vista operativa y protegidos con permiso específico.
- Los contratos de API deben usar esquemas Pydantic claros para existencias, movimientos, ajustes y almacenes.

## Plan de implementación recomendado

1. **Auditoría y contrato:** confirmar tablas, RPC, endpoints, permisos y fuentes actuales de saldo.
2. **Existencias de solo lectura:** crear la nueva ruta y mostrar existencias por almacén.
3. **Movimientos:** agregar historial filtrable y auditoría.
4. **Ajustes:** separar el permiso de ajuste de `settings.manage` y habilitar la operación con motivo obligatorio.
5. **Almacenes y alertas:** agregar administración restringida y alertas de bajo inventario.
6. **Integración operativa:** enlazar surtidos, entregas, documentos y navegación del panel.
7. **Roles:** asignar permisos mínimos al perfil de almacén y verificar que no tenga acceso indirecto a Compras o costos.

## Avance de la fase 1

Se implementó el primer corte de solo lectura:

- Nueva entrada de menú **Operación → Inventario y almacenes**.
- Nueva ruta de panel /operacion/inventario.
- Nuevo endpoint protegido GET /crm/operacion/inventario.
- Nuevo permiso inventory.operations.view, separado de settings.manage y de los permisos de Compras.
- Consulta de almacenes, existencia actual, reservada, disponible, tránsito y mínimos.
- Búsqueda por producto/almacén y filtro por almacén.
- Alertas visuales cuando la disponibilidad está en el mínimo o por debajo.
- El endpoint de consulta no expone costos.
- La vista incluye ajustes manuales para usuarios con inventory.stock.adjust, con entrada/salida, cantidad, almacén, producto y auditoría.

Las migraciones 20261006_120000_operational_inventory_view_permission.sql y 20261006_124000_operational_inventory_adjust_permission.sql separan consulta y edición. El permiso de ajuste se asignó a owner, admin_operativo y al rol Gerencia Almacen (0016) para los tenants donde exista ese rol. El historial de movimientos y la administración de almacenes corresponden a las siguientes fases.

## Criterios de aceptación

- El encargado de almacén puede entrar a **Operación → Inventario y almacenes** sin entrar a Compras.
- Puede consultar existencias por almacén y distinguir física, reservada, disponible y en tránsito.
- Puede consultar quién, cuándo y por qué realizó un movimiento.
- Solo usuarios con `inventory.stock.adjust` pueden realizar ajustes.
- Cada ajuste genera auditoría y no rompe las reservas ni las entregas existentes.
- Las acciones de surtido y entrega siguen funcionando desde una única fuente de verdad.
- Los costos, proveedores y configuraciones de Compras no se muestran al perfil operativo por defecto.
- La información queda aislada por tenant y protegida también en backend, no solo en el menú del frontend.

## Recomendación final

La mejor opción es **crear una nueva vista operativa de Inventario y almacenes y reutilizar la base técnica existente**, en lugar de reutilizar completa la vista de Compras. Así se conserva el trabajo realizado, se evita duplicar la lógica de inventario y se obtiene una experiencia clara para el almacén, con permisos mínimos y responsabilidades separadas.
