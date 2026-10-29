# Modelo sencillo de macrolotes

Fecha: 2026-10-29 (UTC)  
Estado: Propuesta documentada; sin cambios aplicados en base de datos

## Objetivo

Representar correctamente la jerarquía de una propiedad:

```text
Desarrollo → Macrolote → Manzana → Unidad
```

Esto permitirá identificar una unidad de forma clara en propuestas,
reservas, oportunidades y reportes.

## Estructura actual

La base de datos ya tiene una entidad para este nivel: `propiedad_capas`.

En la jerarquía inmobiliaria actual, una capa representa el macrolote y tiene
relación con el desarrollo. `propiedad_manzanas.macrolote_id` apunta a esa
capa.

Por lo tanto, no se creará una tabla nueva. La solución será usar y validar la
estructura existente:

- `propiedad_capas`: macrolote.
- `propiedad_manzanas`: manzana.
- `propiedad_unidades`: lote o unidad.

En Grupo Gran Peñon ya existen, entre otros, los macrolotes `CAMPERO` y
`CERRITO`.

La relación quedaría así:

```text
organización
└── desarrollo
    └── macrolote
        └── manzana
            └── unidad
```

## Ejemplo

```text
Gran Peñón Residencial
└── Campero
    └── Manzana 5
        └── Lote 17
```

## Fases posteriores

1. Validar la relación desarrollo → capa/macrolote → manzana → unidad.
2. Identificar unidades sin manzana o con relaciones inconsistentes.
3. Generar un reporte por tenant inmobiliario.
4. Corregir las oportunidades y propuestas históricas con relación inequívoca.
5. Actualizar las operaciones inmobiliarias y verificar los informes.

## Alcance del backfill

El backfill será multi-tenant, pero no se ejecutará para todas las
organizaciones indiscriminadamente.

Solo se incluirán los tenants que tengan habilitada la configuración
inmobiliaria, incluyendo:

- Módulo de propiedades habilitado.
- Catálogo inmobiliario habilitado cuando sea necesario para la relación
  comercial.

Los tenants sin configuración inmobiliaria quedarán fuera y sus datos de
productos y servicios no serán modificados.

Antes de aplicar cambios se generará un reporte por tenant con:

- Macrolotes encontrados.
- Manzanas y unidades relacionadas.
- Oportunidades inmobiliarias afectadas.
- Propuestas o cotizaciones que serán relacionadas.
- Registros que requieran revisión manual.

Solo los registros con una relación inequívoca serán actualizados
automáticamente. Los casos ambiguos quedarán reportados para revisión.

Esta propuesta no cambia todavía nombres de cotizaciones ni de propuestas y
no modifica datos existentes.
