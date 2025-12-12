BEGIN;

WITH first_stage AS (
    SELECT DISTINCT ON (organizacion_id)
        organizacion_id,
        orden,
        metadata
    FROM public.etapas_pipeline
    ORDER BY organizacion_id, orden ASC
),
missing AS (
    SELECT
        fs.organizacion_id,
        COALESCE(fs.metadata, '{}'::jsonb) AS metadata,
        CASE
            WHEN COALESCE(fs.orden, 10) <= 1 THEN -1
            ELSE fs.orden - 1
        END AS new_orden
    FROM first_stage fs
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.etapas_pipeline ep
        WHERE ep.organizacion_id = fs.organizacion_id
          AND lower(ep.codigo) = 'prospeccion_primer_contacto'
    )
)
INSERT INTO public.etapas_pipeline (
    id,
    organizacion_id,
    codigo,
    nombre,
    orden,
    probabilidad,
    categoria,
    metadata
)
SELECT
    gen_random_uuid(),
    m.organizacion_id,
    'prospeccion_primer_contacto',
    'Prospección · Primer contacto',
    m.new_orden,
    5.0,
    'abierta',
    jsonb_strip_nulls(
        jsonb_build_object(
            'seed', 'prospeccion_stage',
            'legacy_codigo', 'prospeccion_primer_contacto',
            'tablero_id', m.metadata ->> 'tablero_id',
            'tablero_nombre', m.metadata ->> 'tablero_nombre',
            'tablero_slug', m.metadata ->> 'tablero_slug',
            'metadatos',
            jsonb_strip_nulls(
                jsonb_build_object(
                    'color', COALESCE(m.metadata -> 'metadatos' ->> 'color', 'indigo'),
                    'descripcion', 'Primer contacto generado desde búsquedas de prospección.',
                    'is_counter_only', false
                )
            )
        )
    )
FROM missing m;

COMMIT;
