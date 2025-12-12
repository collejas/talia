BEGIN;

WITH first_stage AS (
    SELECT DISTINCT ON (organizacion_id)
        organizacion_id,
        metadata
    FROM public.etapas_pipeline
    ORDER BY organizacion_id, orden ASC
),
stage_pairs AS (
    SELECT
        ep.id,
        ep.metadata AS current_metadata,
        fs.metadata AS base_metadata
    FROM public.etapas_pipeline ep
    JOIN first_stage fs ON fs.organizacion_id = ep.organizacion_id
    WHERE lower(ep.codigo) = 'prospeccion_primer_contacto'
)
UPDATE public.etapas_pipeline AS ep
SET metadata = jsonb_strip_nulls(
        COALESCE(stage_pairs.current_metadata, '{}'::jsonb)
        || jsonb_build_object(
            'tablero_id',
            stage_pairs.base_metadata ->> 'tablero_id',
            'tablero_nombre',
            stage_pairs.base_metadata ->> 'tablero_nombre',
            'tablero_slug',
            stage_pairs.base_metadata ->> 'tablero_slug'
        )
    )
FROM stage_pairs
WHERE ep.id = stage_pairs.id;

COMMIT;
