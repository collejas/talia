BEGIN;

UPDATE public.producto_metadata_schemes s
SET fields = (
    jsonb_build_array(
        jsonb_build_object(
            'id', 'descripcion_corta',
            'label', 'Descripción corta',
            'type', 'text',
            'required', false,
            'description', 'Resumen breve del producto.'
        ),
        jsonb_build_object(
            'id', 'descripcion_larga',
            'label', 'Descripción larga',
            'type', 'text',
            'required', false,
            'description', 'Descripción extensa del producto.'
        ),
        jsonb_build_object(
            'id', 'precio_base',
            'label', 'Precio base',
            'type', 'number',
            'required', false,
            'description', 'Precio base del producto.'
        )
    )
    || COALESCE(
        (
            SELECT jsonb_agg(field ORDER BY ord)
            FROM jsonb_array_elements(COALESCE(s.fields, '[]'::jsonb)) WITH ORDINALITY AS items(field, ord)
            WHERE lower(coalesce(field->>'id', field->>'slug', '')) NOT IN (
                'descripcion',
                'descripcion_corta',
                'descripcion_larga',
                'precio_base'
            )
              AND lower(coalesce(field->>'label', field->>'name', '')) NOT IN (
                'descripción',
                'descripción corta',
                'descripción larga',
                'precio base'
            )
        ),
        '[]'::jsonb
    )
);

UPDATE public.catalog_items
SET
    descripcion_corta = COALESCE(
        descripcion_corta,
        NULLIF(BTRIM(metadatos->>'descripcion_corta'), '')
    ),
    descripcion_larga = COALESCE(
        descripcion_larga,
        NULLIF(BTRIM(metadatos->>'descripcion_larga'), ''),
        NULLIF(BTRIM(metadatos->>'descripcion'), ''),
        NULLIF(BTRIM(descripcion), '')
    ),
    precio_base = COALESCE(
        precio_base,
        CASE
            WHEN NULLIF(BTRIM(metadatos->>'precio_base'), '') ~ '^[0-9]+(\.[0-9]+)?$'
            THEN NULLIF(BTRIM(metadatos->>'precio_base'), '')::numeric
            ELSE NULL
        END
    ),
    metadatos = COALESCE(metadatos, '{}'::jsonb)
        - 'linea'
        - 'familia'
        - 'modelo'
        - 'descripcion_corta'
        - 'descripcion_larga'
        - 'descripcion'
        - 'precio_base'
WHERE COALESCE(metadatos, '{}'::jsonb) ?| array[
    'linea',
    'familia',
    'modelo',
    'descripcion_corta',
    'descripcion_larga',
    'descripcion',
    'precio_base'
]
OR (descripcion IS NOT NULL AND descripcion_larga IS NULL)
OR (precio_base IS NULL AND COALESCE(metadatos, '{}'::jsonb) ? 'precio_base');

COMMIT;
