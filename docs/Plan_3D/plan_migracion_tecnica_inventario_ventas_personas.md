# Plan tecnico de migracion: inventario, ventas y personas

Fecha: 2026-05-15 (UTC)
Estado: Propuesta tecnica

## Objetivo tecnico

Definir el orden de migracion para que el inventario inmobiliario y el flujo comercial operen con columnas reales, trazabilidad de oportunidad y referencia canónica a `personas`, reduciendo dependencia de `jsonb` y de nombres heredados.

## Resultado esperado

- `propiedad_unidades` tiene el estado actual y el vínculo a oportunidad/catálogo.
- `catalog_items` expone referencias directas a propiedad, unidad y oportunidad.
- `oportunidades` deja de usar `contacto_principal_id` como referencia semántica principal.
- `propiedad_unidad_movimientos` guarda el historial de estados.
- Backend y frontend leen columnas, no metadata, para el inventario crítico.

## Orden recomendado de migraciones

### Fase 1. Preparar columnas nuevas

1. Agregar `persona_id` a `public.oportunidades`.
2. Agregar `oportunidad_id` a `public.propiedad_unidades`.
3. Agregar `catalog_item_id` a `public.propiedad_unidades`.
4. Agregar `propiedad_id`, `unidad_id`, `oportunidad_id`, `persona_id` a `public.catalog_items`.
5. Crear `public.propiedad_unidad_movimientos`.

### Fase 2. Backfill y validación

1. Copiar datos desde `oportunidades.contacto_principal_id` hacia `oportunidades.persona_id`.
2. Si existe una relación ya conocida entre unidad y catálogo, poblar `propiedad_unidades.catalog_item_id`.
3. Si el catálogo ya conoce la unidad, poblar `catalog_items.propiedad_id` y `catalog_items.unidad_id`.
4. Validar que cada unidad en estado no disponible tenga oportunidad asociada.

### Fase 3. Restricciones e índices

1. Crear índices para las nuevas FKs.
2. Agregar checks o triggers para estados inmobiliarios.
3. Agregar unicidad donde aplique para evitar doble venta por unidad activa.

### Fase 4. Limpieza de compatibilidad

1. Mantener `contacto_principal_id` como alias temporal.
2. Cambiar backend para leer y escribir `persona_id`.
3. Eliminar usos de metadata para campos ya normalizados.

## SQL sugerido

### 1) `oportunidades.persona_id`

```sql
alter table public.oportunidades
  add column if not exists persona_id uuid;

update public.oportunidades o
set persona_id = o.contacto_principal_id
where o.persona_id is null
  and o.contacto_principal_id is not null;

create index if not exists oportunidades_persona_id_idx
  on public.oportunidades (organizacion_id, persona_id);
```

### 2) `propiedad_unidades.oportunidad_id` y `catalog_item_id`

```sql
alter table public.propiedad_unidades
  add column if not exists oportunidad_id uuid,
  add column if not exists catalog_item_id uuid;

create index if not exists propiedad_unidades_oportunidad_idx
  on public.propiedad_unidades (oportunidad_id);

create index if not exists propiedad_unidades_catalog_item_idx
  on public.propiedad_unidades (catalog_item_id);
```

### 3) `catalog_items` como referencia directa

```sql
alter table public.catalog_items
  add column if not exists propiedad_id uuid,
  add column if not exists unidad_id uuid,
  add column if not exists oportunidad_id uuid,
  add column if not exists persona_id uuid;

create index if not exists catalog_items_propiedad_idx
  on public.catalog_items (organizacion_id, propiedad_id);

create index if not exists catalog_items_unidad_idx
  on public.catalog_items (organizacion_id, unidad_id);

create index if not exists catalog_items_oportunidad_idx
  on public.catalog_items (organizacion_id, oportunidad_id);
```

### 4) Historial de estados de unidad

```sql
create table if not exists public.propiedad_unidad_movimientos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id),
  unidad_id uuid not null references public.propiedad_unidades(id),
  oportunidad_id uuid references public.oportunidades(id),
  persona_id uuid references public.personas(id),
  cuenta_id uuid references public.cuentas(id),
  estado_anterior public.propiedad_status not null,
  estado_nuevo public.propiedad_status not null,
  precio numeric,
  moneda char(3) not null default 'MXN',
  motivo text,
  metadata jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  creado_por uuid
);

create index if not exists propiedad_unidad_movimientos_unidad_idx
  on public.propiedad_unidad_movimientos (organizacion_id, unidad_id, creado_en desc);

create index if not exists propiedad_unidad_movimientos_oportunidad_idx
  on public.propiedad_unidad_movimientos (organizacion_id, oportunidad_id);
```

### 5) Regla de consistencia

```sql
alter table public.propiedad_unidades
  add constraint propiedad_unidades_oportunidad_required_chk
  check (
    status = 'disponible'
    or oportunidad_id is not null
  );
```

Nota: esta restricción debe validarse primero en staging porque puede requerir backfill completo antes de aplicarse en producción.

## Reglas de aplicación

- La escritura canónica del estado debe ocurrir en backend.
- El frontend solo puede disparar la intención comercial.
- La transición `disponible -> reservado/apartado/vendido` debe ser transaccional.
- La auditoría de cambio debe escribirse en la misma operación.

## Orden de despliegue

1. Migración de columnas nuevas.
2. Backfill de datos.
3. Índices nuevos.
4. Backend leyendo nuevas columnas.
5. Frontend consumiendo la nueva relación.
6. Restricciones finales.

## Validación mínima

- una unidad vendida tiene `oportunidad_id`
- `catalog_items` ya puede resolver propiedad/unidad sin metadata
- una oportunidad nueva puede usarse desde `persona_id`
- el historial guarda cada cambio de estado

