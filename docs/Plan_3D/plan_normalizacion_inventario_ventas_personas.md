# Plan de normalización de inventario, ventas y personas

Fecha: 2026-05-15 (UTC)
Estado: Propuesta técnica

## Objetivo

Reducir al mínimo el uso de `jsonb` para datos operativos del módulo inmobiliario y del flujo comercial, moviendo a columnas reales todo lo que se consulta, filtra, ordena o valida con frecuencia.

La meta es que la app trabaje con:

- inventario inmobiliario normalizado
- ventas ligadas a una oportunidad real
- actor humano canónico basado en `personas`
- estados comerciales claros para inventario vendible
- precio manual o precio por metro cuadrado para terrenos/lotes
- `jsonb` solo para extensión, compatibilidad o metadata no crítica

## Problema que resuelve

Hoy el sistema ya tiene la base para operar con tablas estructuradas, pero sigue cargando demasiada semántica en metadata y en contratos heredados.

Eso genera:

- consultas más lentas de lo necesario
- lógica duplicada entre backend, frontend y payloads
- riesgo de inconsistencias entre inventario, catálogo y oportunidades
- dependencia innecesaria de `contacto_id` mientras el modelo real ya apunta a `persona_id`

## Alcance

Este plan cubre tres frentes:

1. Inventario inmobiliario 3D
2. Ventas ligadas a oportunidad
3. Migración semántica de contacto a persona

## Principios

- Si un dato participa en filtros, listados, reglas o reportes, debe vivir en columna.
- Si un dato es de extensión, compatibilidad o payload variable, puede quedarse en `jsonb`.
- `metadata` no debe ser fuente de verdad para datos operativos del inventario 3D ni de ventas; solo puede conservar extensiones no críticas, trazas o compatibilidad temporal.
- Cada unidad inmobiliaria debe tener un estado operativo único.
- Un cambio de estado comercial relevante debe estar ligado a una oportunidad.
- `Reserva Patrimonial` no es un estado comercial; es una clasificación de inventario fuera del flujo de venta.
- El actor humano canónico del CRM debe ser `personas`.

## Estado base actual

Según el esquema vigente:

- `propiedad_desarrollos`, `propiedad_capas` y `propiedad_unidades` ya son el núcleo operativo del inventario.
- `propiedad_unidades.status` ya existe y usa el enum `propiedad_status`.
- `catalog_items` ya tiene `metadatos_extra` para separar atributos complementarios de la metadata principal.
- `oportunidades.contacto_principal_id` ya apunta a `personas.id` aunque el nombre aún sea legado.
- `clientes`, `cotizaciones` y `leads` ya exponen `persona_id`.
- `propiedad_unidades` ya guarda `precio` y `area_m2`, por lo que el precio por m2 puede modelarse sin rehacer el inventario.

## Decisión de diseño

### 1) Inventario

Mantener como columnas reales:

- `propiedad_desarrollos.status`
- `propiedad_unidades.status`
- `propiedad_unidades.destino_inventario`
- `propiedad_unidades.precio_tipo`
- `propiedad_unidades.precio`
- `propiedad_unidades.precio_m2`
- `propiedad_unidades.area_m2`
- `propiedad_unidades.linea_id`
- `propiedad_unidades.familia_id`
- `propiedad_unidades.modelo_id`
- `propiedad_unidades.desarrollo_id`
- `propiedad_unidades.nivel_id`
- `propiedad_desarrollos.pais_codigo`
- `propiedad_desarrollos.estado_cve`
- `propiedad_desarrollos.municipio_cve`
- `propiedad_desarrollos.codigo_postal`
- `propiedad_desarrollos.colonia`

Dejar en `jsonb` solo:

- metadatos opcionales del importador
- atributos visuales no críticos
- trazas de compatibilidad

Para propiedades 3D, los campos de volumen y color se tratan como columnas reales:

- `propiedad_poligonos.height`
- `propiedad_poligonos.min_height`
- `propiedad_poligonos.levels`
- `propiedad_poligonos.color`

`metadata` queda como respaldo histórico o extensión auxiliar, no como cálculo primario.

### 1.1) Estados comerciales

La unidad comercial solo debe poder estar en uno de estos estados:

- `disponible`
- `reservado`
- `apartado`
- `vendido`
- `bloqueado`

Reglas:

- `reservado`, `apartado` y `vendido` exigen `oportunidad_id`.
- `bloqueado` no exige `oportunidad_id`.
- `destino_inventario = patrimonial` excluye la unidad del flujo comercial.

### 2) Ventas

Toda venta de una unidad debe quedar amarrada a:

- `catalog_item_id`
- `propiedad_id`
- `unidad_id`
- `oportunidad_id`
- `persona_id`
- `cuenta_id` cuando aplique

### 3) Personas

El modelo canónico para el humano es `personas`.

`contacto_id` solo debe seguir existiendo mientras haya consumidores heredados. El objetivo operativo es mover lecturas y escrituras hacia `persona_id`.

## Propuesta de esquema

### A. Tabla de vínculo entre unidad y oportunidad

Crear una relación explícita para no depender solo de metadata.

Opciones:

1. `propiedad_unidades.oportunidad_id`
2. `propiedad_unidad_movimientos`
3. `propiedad_unidad_reservas`

La recomendación es combinar dos capas:

- `propiedad_unidades.oportunidad_id` para el estado actual
- `propiedad_unidad_movimientos` para historial y auditoría

#### `propiedad_unidad_movimientos`

Campos sugeridos:

- `id`
- `organizacion_id`
- `unidad_id`
- `oportunidad_id`
- `persona_id`
- `cuenta_id`
- `estado_anterior`
- `estado_nuevo`
- `precio`
- `moneda`
- `motivo`
- `metadata`
- `creado_en`
- `creado_por`

Este historial permite saber:

- cuándo se reservó
- cuándo se apartó
- cuándo se vendió
- con qué oportunidad ocurrió
- quién ejecutó el cambio

### B. Normalización de oportunidad

En `oportunidades`:

- conservar la columna física
- renombrar semánticamente en backend a `persona_id` cuando sea posible
- mantener compatibilidad temporal con `contacto_principal_id`

Campos que deben ser de uso directo:

- `organizacion_id`
- `cuenta_id`
- `contacto_principal_id` o alias `persona_id`
- `etapa_id`
- `estado`
- `canal`
- `monto_estimado`
- `probabilidad`
- `fecha_cierre_probable`

## Reglas de negocio

### Estados inmobiliarios

La unidad comercial solo debe poder estar en uno de estos estados:

- `disponible`
- `reservado`
- `apartado`
- `vendido`
- `bloqueado`

### Regla de obligatoriedad

Si la unidad pasa a:

- `reservado`
- `apartado`
- `vendido`

entonces debe existir una `oportunidad_id` válida.

### Regla comercial

Antes de marcar una unidad como bloqueada o vendida:

- validar que la oportunidad exista
- validar que pertenezca a la misma organización
- validar que esté en etapa compatible
- registrar un movimiento de auditoría

### Regla patrimonial

Si `destino_inventario = patrimonial`:

- bloquear el flujo comercial
- evitar la generación automática de `catalog_item`
- excluir la unidad de KPIs de ventas
- permitir solo manejo interno del inventario

### Regla de consistencia

No se debe permitir que:

- una unidad esté `vendido` sin oportunidad
- una oportunidad quede asociada a dos ventas activas para la misma unidad
- el frontend actualice el estado sin pasar por backend

## Backend

### API de ventas

Definir o consolidar un endpoint tipo:

- `POST /crm/ventas/propiedades`

Payload mínimo:

- `catalog_item_id`
- `propiedad_id`
- `unidad_id`
- `oportunidad_id`
- `persona_id`
- `cuenta_id`
- `precio_final`
- `moneda`
- `metadata`

Comportamiento:

1. crear cotización o venta según el flujo actual
2. registrar el vínculo comercial
3. actualizar el estado de la unidad
4. actualizar el `catalog_item`
5. escribir movimiento/historial

### API de inventario

Las rutas de `propiedades` y `settings/propiedades` deben seguir creando y editando:

- desarrollo
- capa
- unidad

pero deben dejar de depender de metadata para atributos operativos.

### Precio por m2

La API de inventario debe aceptar:

- `precio_tipo`
- `precio_m2`

Comportamiento:

- si `precio_tipo = manual`, `precio` es obligatorio;
- si `precio_tipo = m2`, `area_m2` y `precio_m2` son obligatorios y `precio` debe calcularse a partir de ellos;
- el backend debe persistir el precio efectivo final en `precio`.

### API de personas

Seguir consolidando:

- alta de persona
- alta de cuenta
- relación persona-cuenta

y mover el uso visible del backend hacia `persona_id`.

## Frontend

### `/settings/propiedades`

La vista debe priorizar:

- columnas estructurales para estado, precio, área, referencias y geografía
- metadata solo para campos opcionales
- selector de oportunidad al ejecutar `reservar`, `apartar` o `vender`

### Panel comercial

La UI debe mostrar:

- unidad
- estado actual
- oportunidad ligada
- persona asociada
- cuenta asociada
- historial de movimientos

### Editor 3D

Mapbox y Leaflet deben consumir:

- `status`
- `height`
- `min_height`
- `levels`
- `color`
- `linea_nombre`
- `familia_nombre`
- `modelo_nombre`

sin depender de reconstrucciones desde `jsonb`.

## Migración por fases

### Fase 1. Alinear modelo operativo

- Identificar todos los campos que hoy viven en `jsonb` y que deben pasar a columnas
- Confirmar índices sobre columnas de uso intensivo
- Definir la relación unidad-oportunidad

### Fase 2. Venta con trazabilidad

- Hacer que la venta cree o valide una oportunidad
- Registrar `persona_id` y `cuenta_id`
- Guardar el movimiento de estado

### Fase 3. Limpieza de compatibilidad

- Reducir dependencias de `contacto_id`
- Mantener alias solo donde todavía existan consumidores legacy
- Documentar qué contratos quedan obsoletos

### Fase 4. Optimización

- Revisar índices faltantes
- Evaluar vistas materializadas o RPCs para reportes pesados
- Dejar `jsonb` exclusivamente para extensiones

## Criterios de aceptación

El plan se considera bien encaminado cuando:

- una unidad cambia de estado solo desde backend
- `reservado`, `apartado` y `vendido` exigen oportunidad
- ventas y cotizaciones guardan `persona_id`
- el inventario principal consulta columnas, no `jsonb`
- Mapbox recibe datos ya normalizados
- `contacto_id` deja de ser la referencia principal en el flujo nuevo

## Riesgos

- romper compatibilidad con módulos legacy que aún leen `contacto_id`
- duplicar lógica si se deja estado en metadata y columna a la vez
- agregar demasiada lógica en frontend en lugar de centralizarla en backend
- dejar estados comerciales sin historial auditable

## Pendientes técnicos

- definir si el historial será `propiedad_unidad_movimientos` o una tabla de reservas/apartados separada
- decidir el nombre final del campo canónico en oportunidades
- revisar índices faltantes en tablas con FK frecuentes
- resolver el hallazgo de RLS deshabilitado en tablas no críticas antes de exponer más lectura

## Relación con otros planes

Este documento se complementa con:

- `docs/Plan_3D/plan_3D.md`
- `docs/Plan_3D/plan_migracion_tecnica_inventario_ventas_personas.md`
- `docs/Plan_3D/checklist_prs_inventario_ventas_personas.md`
- `docs/Plan_3D/plan_ventas_integradas.md`
- `docs/Plan_3D/ventas_asociadas_leads_clientes.md`
- `docs/Plan_personas_empresa_contactos/progreso.md`
