BEGIN;

UPDATE public.producto_metadata_schemes s
SET fields = (
    jsonb_build_array(
        jsonb_build_object(
            'id', 'descripcion',
            'label', 'Descripción',
            'type', 'text',
            'required', false,
            'description', 'Descripción principal del producto.'
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
            WHERE LOWER(COALESCE(field->>'id', field->>'slug', '')) NOT IN ('descripcion', 'precio_base')
              AND LOWER(COALESCE(field->>'label', field->>'name', '')) NOT IN ('descripción', 'precio base')
        ),
        '[]'::jsonb
    )
);

COMMIT;
