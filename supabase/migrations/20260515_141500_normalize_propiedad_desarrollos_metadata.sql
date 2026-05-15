BEGIN;

WITH desarrollo_extracted AS (
    SELECT
        d.id,
        CASE lower(NULLIF(btrim(d.metadata->>'status'), ''))
            WHEN 'disponible' THEN 'disponible'::public.propiedad_status
            WHEN 'apartado' THEN 'apartado'::public.propiedad_status
            WHEN 'vendido' THEN 'vendido'::public.propiedad_status
            WHEN 'reservado' THEN 'reservado'::public.propiedad_status
            WHEN 'activo' THEN 'disponible'::public.propiedad_status
            WHEN 'libre' THEN 'disponible'::public.propiedad_status
            WHEN 'ocupado' THEN 'vendido'::public.propiedad_status
            ELSE NULL
        END AS status_from_metadata,
        CASE
            WHEN jsonb_typeof(d.metadata) = 'object' THEN
                COALESCE(d.metadata, '{}'::jsonb)
                    - 'status'
                    - 'pais_codigo'
                    - 'estado_cve'
                    - 'municipio_cve'
                    - 'codigo_postal'
                    - 'colonia'
                    - 'tipo'
                    - 'nombre'
                    - 'descripcion'
            ELSE COALESCE(d.metadata, '{}'::jsonb)
        END AS cleaned_metadata
    FROM public.propiedad_desarrollos d
)
UPDATE public.propiedad_desarrollos d
SET
    status = CASE
        WHEN d.status = 'disponible' AND desarrollo_extracted.status_from_metadata IS NOT NULL
            THEN desarrollo_extracted.status_from_metadata
        ELSE d.status
    END,
    metadata = COALESCE(desarrollo_extracted.cleaned_metadata, '{}'::jsonb)
FROM desarrollo_extracted
WHERE d.id = desarrollo_extracted.id;

WITH mix_extracted AS (
    SELECT
        m.id,
        CASE lower(NULLIF(btrim(m.metadata->>'status'), ''))
            WHEN 'disponible' THEN 'disponible'::public.propiedad_status
            WHEN 'apartado' THEN 'apartado'::public.propiedad_status
            WHEN 'vendido' THEN 'vendido'::public.propiedad_status
            WHEN 'reservado' THEN 'reservado'::public.propiedad_status
            WHEN 'activo' THEN 'disponible'::public.propiedad_status
            WHEN 'libre' THEN 'disponible'::public.propiedad_status
            WHEN 'ocupado' THEN 'vendido'::public.propiedad_status
            ELSE NULL
        END AS status_from_metadata,
        CASE
            WHEN jsonb_typeof(m.metadata) = 'object' THEN
                COALESCE(m.metadata, '{}'::jsonb)
                    - 'status'
                    - 'pais_codigo'
                    - 'estado_cve'
                    - 'municipio_cve'
                    - 'codigo_postal'
                    - 'colonia'
                    - 'tipo'
                    - 'nombre'
                    - 'descripcion'
            ELSE COALESCE(m.metadata, '{}'::jsonb)
        END AS cleaned_metadata
    FROM public.propiedad_desarrollos_mix m
)
UPDATE public.propiedad_desarrollos_mix m
SET
    status = CASE
        WHEN m.status = 'disponible' AND mix_extracted.status_from_metadata IS NOT NULL
            THEN mix_extracted.status_from_metadata
        ELSE m.status
    END,
    metadata = COALESCE(mix_extracted.cleaned_metadata, '{}'::jsonb)
FROM mix_extracted
WHERE m.id = mix_extracted.id;

WITH mix_item_extracted AS (
    SELECT
        i.id,
        CASE lower(NULLIF(btrim(i.metadata->>'status'), ''))
            WHEN 'disponible' THEN 'disponible'::public.propiedad_status
            WHEN 'apartado' THEN 'apartado'::public.propiedad_status
            WHEN 'vendido' THEN 'vendido'::public.propiedad_status
            WHEN 'reservado' THEN 'reservado'::public.propiedad_status
            WHEN 'activo' THEN 'disponible'::public.propiedad_status
            WHEN 'libre' THEN 'disponible'::public.propiedad_status
            WHEN 'ocupado' THEN 'vendido'::public.propiedad_status
            ELSE NULL
        END AS status_from_metadata,
        CASE
            WHEN NULLIF(btrim(i.metadata->>'nivel'), '') ~ '^-?\d+$'
                THEN NULLIF(btrim(i.metadata->>'nivel'), '')::integer
            ELSE NULL
        END AS nivel_from_metadata,
        CASE
            WHEN NULLIF(btrim(i.metadata->>'altura'), '') ~ '^-?\d+(\.\d+)?$'
                THEN NULLIF(btrim(i.metadata->>'altura'), '')::numeric(9,2)
            ELSE NULL
        END AS altura_from_metadata,
        CASE
            WHEN jsonb_typeof(i.metadata) = 'object' THEN
                COALESCE(i.metadata, '{}'::jsonb)
                    - 'status'
                    - 'modo'
                    - 'nivel'
                    - 'altura'
                    - 'nombre'
                    - 'descripcion'
            ELSE COALESCE(i.metadata, '{}'::jsonb)
        END AS cleaned_metadata
    FROM public.propiedad_desarrollos_mix_items i
)
UPDATE public.propiedad_desarrollos_mix_items i
SET
    status = CASE
        WHEN i.status = 'disponible' AND mix_item_extracted.status_from_metadata IS NOT NULL
            THEN mix_item_extracted.status_from_metadata
        ELSE i.status
    END,
    nivel = COALESCE(i.nivel, mix_item_extracted.nivel_from_metadata),
    altura = COALESCE(i.altura, mix_item_extracted.altura_from_metadata),
    metadata = COALESCE(mix_item_extracted.cleaned_metadata, '{}'::jsonb)
FROM mix_item_extracted
WHERE i.id = mix_item_extracted.id;

COMMIT;
