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

## Problema actual

Actualmente la manzana guarda un `macrolote_id`, pero no existe una tabla
formal de macrolotes con nombre y relación explícita con el desarrollo.

Por eso la aplicación puede conocer un identificador, pero no puede saber con
seguridad si corresponde a `Campero`, `Cerrito` u otro macrolote.

## Propuesta

Crear una tabla `propiedad_macrolotes` con:

- `id`
- `organizacion_id`
- `desarrollo_id`
- `nombre`
- `descripcion`
- `status`
- `creado_en`
- `actualizado_en`

Después, `propiedad_manzanas.macrolote_id` deberá apuntar formalmente a esta
tabla.

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

1. Crear la tabla de macrolotes.
2. Convertir los identificadores actuales en registros.
3. Asignar los nombres reales, como `Campero` y `Cerrito`.
4. Agregar la relación formal con las manzanas.
5. Validar unidades sin manzana o con relaciones inconsistentes.
6. Ejecutar el backfill de oportunidades, propuestas y operaciones.

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
