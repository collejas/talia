BEGIN;

UPDATE public.producto_metadata_schemes
SET fields = (
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(fields, '[]'::jsonb)) AS field
            WHERE LOWER(COALESCE(field->>'id', field->>'slug', '')) = 'descripcion'
               OR LOWER(COALESCE(field->>'label', field->>'name', '')) = 'descripción'
        )
        THEN COALESCE(fields, '[]'::jsonb)
        ELSE jsonb_build_array(
            jsonb_build_object(
                'id', 'descripcion',
                'label', 'Descripción',
                'type', 'text',
                'required', false,
                'description', 'Descripción principal del producto.'
            )
        ) || COALESCE(fields, '[]'::jsonb)
    END
)
WHERE TRUE;

COMMIT;
