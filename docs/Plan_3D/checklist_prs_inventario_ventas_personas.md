# Checklist de PRs: inventario, ventas y personas

Fecha: 2026-05-15 (UTC)
Estado: Propuesta de ejecucion

## Objetivo

Dividir el trabajo en PRs pequeños y verificables para reducir riesgo de ruptura entre inventario, ventas y CRM.

## PR 1. Esquema base

### Objetivo

Agregar columnas y tabla de historial sin cambiar la lógica visible.

### Incluye

- `oportunidades.persona_id`
- `propiedad_unidades.oportunidad_id`
- `propiedad_unidades.catalog_item_id`
- `catalog_items.propiedad_id`
- `catalog_items.unidad_id`
- `catalog_items.oportunidad_id`
- `catalog_items.persona_id`
- `propiedad_unidad_movimientos`

### Verificación

- El proyecto compila y migra sin errores.
- Las columnas nuevas existen en Supabase.
- No se rompe lectura actual del panel.

## PR 2. Backfill

### Objetivo

Poblar las columnas nuevas con datos existentes.

### Incluye

- copia de `contacto_principal_id` a `persona_id`
- vínculo catálogo-unidad
- vínculo oportunidad-unidad cuando ya exista

### Verificación

- No hay filas críticas sin relación esperada.
- El backfill es idempotente.
- El número de registros no cambia de forma inesperada.

## PR 3. Backend de ventas

### Objetivo

Hacer transaccional el cierre de una unidad.

### Incluye

- `POST /crm/ventas/propiedades`
- validación de oportunidad
- actualización de estado de unidad
- escritura de movimiento

### Verificación

- Una venta crea o actualiza el vínculo correcto.
- La unidad no puede cerrarse sin oportunidad.
- El payload comercial usa `persona_id`.

## PR 4. Inventario y editor 3D

### Objetivo

Eliminar dependencias del `jsonb` operativo en inventario.

### Incluye

- lectura de columnas estructurales
- uso de `catalog_item_id` directo
- UI de `settings/propiedades` validando oportunidad en estados bloqueantes
- soporte para `precio_tipo`, `precio_m2` y `destino_inventario`
- exclusión de `Reserva Patrimonial` del flujo comercial

### Verificación

- Listados y filtros usan columnas.
- Mapbox recibe el dato normalizado.
- No se requiere reconstrucción desde metadata para lo crítico.
- El inventario patrimonial no genera venta ni `catalog_item`.

## PR 5. Limpieza semántica de CRM

### Objetivo

Reducir el uso de `contacto_id` como nombre funcional.

### Incluye

- lectura y escritura prioritaria por `persona_id`
- alias temporales para compatibilidad
- documentación de deprecación

### Verificación

- El flujo nuevo opera sin depender de `contacto_id`.
- El runtime legacy sigue funcionando mientras exista compatibilidad.

## PR 6. Endurecimiento

### Objetivo

Cerrar las reglas de consistencia.

### Incluye

- constraints o triggers para estados
- índices faltantes
- revisión de RLS en tablas relacionadas

### Verificación

- No hay doble venta de una unidad.
- No hay estado bloqueante sin oportunidad.
- El rendimiento mejora en consultas frecuentes.

## Criterios de salida

- Las PRs pueden desplegarse una por una.
- Cada PR deja el sistema en estado utilizable.
- La lógica crítica se valida en backend.
- La metadata deja de ser fuente de verdad para inventario y ventas.

## Dependencias

- `docs/Plan_3D/plan_normalizacion_inventario_ventas_personas.md`
- `docs/Plan_3D/plan_migracion_tecnica_inventario_ventas_personas.md`
- `docs/Plan_personas_empresa_contactos/progreso.md`
