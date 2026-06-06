# Plan de estados comerciales y precio por m2 en propiedades

Fecha: 2026-05-16 (UTC)
Estado: Propuesta técnica

## Objetivo

Separar de forma clara:

1. El flujo comercial de una propiedad.
2. La reserva patrimonial interna de la empresa.
3. El cálculo de precio manual o por metro cuadrado.

La meta es que el inventario inmobiliario siga siendo consistente con la venta, pero sin mezclar decisiones patrimoniales con estados comerciales.

## Alcance

Este plan cubre dos mejoras:

1. Nuevos estados comerciales para propiedades.
2. Precio por metro cuadrado para terrenos y lotes.

Queda fuera de este plan:

- La automatización del flujo patrimonial completo.
- La migración masiva histórica de estados viejos.
- Cambios al modelo de personas fuera del flujo de propiedades.

## Principios

- El estado comercial describe la disponibilidad operativa de venta.
- En `settings/propiedades` el usuario puede editar el `status` de la unidad sin amarrarlo a una oportunidad.
- La reserva patrimonial no debe entrar al flujo comercial ni a las métricas de ventas.
- Los estados `reservado`, `apartado` y `vendido` deben seguir ligados a una oportunidad en el flujo comercial de CRM/ventas.
- `bloqueado` no debe ligarse a oportunidad porque responde a una restricción administrativa o legal.
- El precio efectivo de una unidad debe seguir existiendo como columna real.
- El precio por m2 debe ser una forma de captura, no una simple nota en metadata.

## Estados comerciales propuestos

| Estado | Uso |
| --- | --- |
| `disponible` | Se puede vender |
| `reservado` | Cliente interesado, bloqueo temporal |
| `apartado` | Cliente dejó anticipo o compromiso formal |
| `vendido` | Operación cerrada |
| `bloqueado` | No disponible por tema administrativo/legal |

## Regla de negocio por estado

- `disponible`
  - No requiere oportunidad.
  - Entra a inventario vendible.
  - Puede generar `catalog_item`.

- `reservado`
  - Requiere `oportunidad_id` en el flujo comercial.
  - Debe registrar motivo y movimiento de auditoría.
  - Sigue siendo parte del inventario comercial.

- `apartado`
  - Requiere `oportunidad_id` en el flujo comercial.
  - Representa un compromiso comercial más fuerte que `reservado`.
  - Sigue siendo parte del inventario comercial.

- `vendido`
  - Requiere `oportunidad_id` en el flujo comercial.
  - Cierra la operación.
  - Debe desactivar la disponibilidad comercial.

- `bloqueado`
  - No requiere `oportunidad_id`.
  - No debe entrar a disponibilidad de venta.
  - Se usa para razones administrativas, legales o internas.

## Reserva patrimonial

`Reserva Patrimonial` no se considera parte del flujo comercial.

Se propone manejarla como una clasificación o destino aparte, por ejemplo:

- `destino_inventario = comercial`
- `destino_inventario = patrimonial`

### Regla

- Si `destino_inventario = patrimonial`, la unidad no entra a venta.
- No debe generar `catalog_item` comercial.
- No debe participar en cálculos de KPI de ventas.
- No debe exigir `oportunidad_id` porque no pertenece al proceso comercial.

### Nota de alcance

Este documento no desarrolla el flujo patrimonial completo. Solo deja definido que:

- existe como categoría separada,
- no compite con los estados comerciales,
- y no debe contaminar el inventario vendible.

## Propuesta técnica para el modelo

### Opción recomendada

Mantener el `status` para el estado comercial y agregar un campo de clasificación:

- `status`
- `destino_inventario`

### Valores sugeridos

Para `status`:

- `disponible`
- `reservado`
- `apartado`
- `vendido`
- `bloqueado`

Para `destino_inventario`:

- `comercial`
- `patrimonial`

### Ventaja

Evita usar `status` para dos cosas distintas:

- disponibilidad de venta
- decisión patrimonial

## Reglas de consistencia

- `reservado`, `apartado` y `vendido` deben tener `oportunidad_id` cuando el cambio se ejecuta como transición comercial.
- `bloqueado` no debe requerir `oportunidad_id`.
- `destino_inventario = patrimonial` debe bloquear la venta aunque el registro exista.
- El frontend no debe decidir por sí solo el cambio de estado; debe pasar por backend.
- El historial de movimientos debe registrar cada transición de estado.

## Precio por metro cuadrado

### Problema

En terrenos y lotes, el precio cambia por atributos como:

- esquina
- vista
- topografía
- ubicación interna
- frente

Por eso el precio total no siempre debe capturarse manualmente desde el inicio.

### Propuesta

Agregar una forma explícita de captura de precio:

- `precio_tipo = manual`
- `precio_tipo = m2`

Y agregar una columna para el valor unitario:

- `precio_m2`

### Regla de cálculo

- Si `precio_tipo = manual`, el usuario captura `precio`.
- Si `precio_tipo = m2`, el usuario captura `precio_m2` y el sistema calcula `precio` como:

`precio = area_m2 * precio_m2`

### Regla de persistencia

- `precio` sigue siendo el valor efectivo final de la unidad.
- `precio_m2` guarda el valor base por metro cuadrado.
- `area_m2` sigue siendo obligatorio o al menos fuertemente recomendado para terrenos/lotes.

## UI propuesta para `settings/propiedades`

### Para unidades tipo terreno/lote

Mostrar un selector de modo de captura:

- Precio manual
- Precio por m2

### Comportamiento

- Si elige `precio manual`, mostrar el campo `precio`.
- Si elige `precio por m2`, mostrar:
  - `area_m2`
  - `precio_m2`
  - total calculado en vivo
- La edición de `status` debe estar disponible sin pedir una oportunidad.
- La oportunidad vive en el flujo comercial de ventas, no como requisito del editor de inventario.

### Resultado esperado

- El usuario puede capturar un precio final directo.
- El usuario puede capturar precio base por m2 cuando el terreno lo requiere.
- La UI ayuda a evitar capturas inconsistentes.

## Backend propuesto

### Validación comercial

Al cambiar a:

- `reservado`
- `apartado`
- `vendido`

el backend debe validar en el flujo comercial:

- que exista `oportunidad_id`
- que la oportunidad sea válida
- que la propiedad esté en inventario comercial

### Validación patrimonial

Si `destino_inventario = patrimonial`:

- bloquear transición comercial
- bloquear generación automática de `catalog_item`
- omitir métricas de ventas

### Validación de precio

- Si `precio_tipo = manual`, `precio` es obligatorio.
- Si `precio_tipo = m2`, `area_m2` y `precio_m2` son obligatorios.
- El backend debe recalcular `precio` para evitar diferencias entre UI y persistencia.

## Base de datos sugerida

### Tabla `propiedad_unidades`

Agregar:

- `precio_tipo`
- `precio_m2`
- `destino_inventario`

Conservar:

- `precio`
- `area_m2`
- `status`
- `oportunidad_id`

### Tabla de historial

Usar el historial de movimientos existente para registrar:

- estado anterior
- estado nuevo
- oportunidad asociada
- motivo del cambio
- precio aplicado

## Flujo recomendado

1. El usuario crea o edita una unidad.
2. Define si el precio será manual o por m2.
3. Si la unidad es comercial, elige su estado comercial.
4. Si pasa a `reservado`, `apartado` o `vendido` desde el CRM/ventas, el backend exige oportunidad.
5. Si la unidad es patrimonial, queda fuera del flujo comercial.
6. El historial guarda toda transición.

## Criterios de salida

- El sistema distingue claramente entre estado comercial y reserva patrimonial.
- Las unidades patrimoniales no aparecen en ventas.
- Las unidades vendibles pueden operarse con precio manual o por m2.
- La venta sigue ligada a oportunidad cuando se ejecuta como operación comercial.
- La UI de propiedades permite capturar ambos esquemas de precio.

## Relación con otros planes

- `docs/Plan_3D/plan_normalizacion_inventario_ventas_personas.md`
- `docs/Plan_3D/plan_migracion_tecnica_inventario_ventas_personas.md`
- `docs/Plan_3D/checklist_prs_inventario_ventas_personas.md`
- `docs/Plan_3D/plan_3D.md`
