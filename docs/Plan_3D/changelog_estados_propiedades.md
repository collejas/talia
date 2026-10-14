# Changelog — Estados visuales de propiedades

## 2026-10-14 — Actualización de nombres visibles

Se intercambian únicamente las etiquetas visibles de `apartado` y `reservado`.
Los valores internos, transiciones, vencimientos, contratos, pagos y validaciones
se mantienen sin cambios.

| Valor interno | Etiqueta visible | Función que conserva |
| --- | --- | --- |
| `apartado` | Reservado | Bloqueo temporal inicial |
| `reservado` | Apartado | Formalización con contrato, pago y expediente |

El flujo visible queda:

1. Disponible
2. Reservado
3. Apartado
4. Vendido

## 2026-10-10 — Orden y colores de estados

### Objetivo

Unificar la representación visual de las unidades inmobiliarias en el mapa de
Mapbox, los botones de acciones y el formulario de propiedades.

### Orden visual

1. Disponible
2. Reservado
3. Apartado
4. Vendido

### Colores

| Estado | Color | Uso |
| --- | --- | --- |
| `disponible` | Verde | Unidad disponible en el mapa |
| `apartado` | Amarillo | Botón Reservar y unidad reservada |
| `reservado` | Naranja | Botón Apartar y unidad apartada |
| `vendido` | Rojo | Botón Vender/Preparar cierre y unidad vendida |

Colores técnicos usados:

- `disponible`: `#2ECC71`
- `apartado`: `#F1C40F`
- `reservado`: `#F97316`
- `vendido`: `#E74C3C`

### Superficies actualizadas

- Polígonos de unidades en Mapbox.
- Color de estado recibido por el GeoJSON del mapa.
- Botones de Reservar, Apartar y Vender/Preparar cierre.
- Orden de opciones en el formulario de propiedades.

### Fuera de alcance

Este refactor no cambia:

- los nombres internos de los estados;
- el flujo comercial;
- las transiciones de oportunidades;
- la lógica de ventas, pedidos o reservas;
- la visibilidad ni la existencia de los botones actuales.

### Implementación

- Panel: `frontend/panel/src/components/mapa-de-propiedades/property-map.jsx`.
- GeoJSON BFF: `frontend/panel/src/app/api/crm/propiedades/geojson/route.ts`.
- Formulario: `frontend/panel/src/components/settings/propiedades/propiedad-form.tsx`.
- Supabase: migración `20261010192654_property_status_order_colors`.

### Validación

- El GeoJSON activo de Supabase confirma los cuatro colores.
- `git diff --check` correcto.
- Backend compilado con `py_compile`.
