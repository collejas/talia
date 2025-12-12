BEGIN;

WITH orgs AS (
    SELECT id
    FROM public.organizaciones
),
existing AS (
    SELECT
        organizacion_id,
        MIN(orden) AS min_orden
    FROM public.etapas_pipeline
    GROUP BY organizacion_id
),
first_stage AS (
    SELECT DISTINCT ON (organizacion_id)
        organizacion_id,
        metadata
    FROM public.etapas_pipeline
    ORDER BY organizacion_id, orden ASC
),
missing AS (
    SELECT
        gen_random_uuid() AS id,
        o.id AS organizacion_id,
        'prospeccion_primer_contacto' AS codigo,
        'Prospección · Primer contacto' AS nombre,
        GREATEST(1, COALESCE(e.min_orden, 10) - 5) AS orden,
        5.0::numeric(5,2) AS probabilidad,
        'abierta' AS categoria,
        jsonb_strip_nulls(
            jsonb_build_object(
                'seed',
                'prospeccion_stage',
                'color',
                'indigo',
                'legacy_codigo',
                'prospeccion_primer_contacto',
                'is_counter_only',
                'false',
                'tablero_id',
                fs.metadata ->> 'tablero_id',
                'tablero_nombre',
                fs.metadata ->> 'tablero_nombre',
                'tablero_slug',
                fs.metadata ->> 'tablero_slug'
            )
        ) AS metadata
    FROM orgs o
    LEFT JOIN existing e ON e.organizacion_id = o.id
    LEFT JOIN first_stage fs ON fs.organizacion_id = o.id
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.etapas_pipeline ep
        WHERE ep.organizacion_id = o.id
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
    m.id,
    m.organizacion_id,
    m.codigo,
    m.nombre,
    m.orden,
    m.probabilidad,
    m.categoria,
    m.metadata
FROM missing m
ON CONFLICT DO NOTHING;

COMMIT;
