BEGIN;

ALTER TABLE public.propiedad_poligonos
    ADD COLUMN IF NOT EXISTS height numeric(9,2),
    ADD COLUMN IF NOT EXISTS min_height numeric(9,2),
    ADD COLUMN IF NOT EXISTS levels integer,
    ADD COLUMN IF NOT EXISTS color text;

COMMENT ON COLUMN public.propiedad_poligonos.height IS 'Altura principal del poligono 3D normalizada fuera de metadata.';
COMMENT ON COLUMN public.propiedad_poligonos.min_height IS 'Altura base del poligono 3D normalizada fuera de metadata.';
COMMENT ON COLUMN public.propiedad_poligonos.levels IS 'Niveles del volumen 3D normalizados fuera de metadata.';
COMMENT ON COLUMN public.propiedad_poligonos.color IS 'Color del poligono 3D normalizado fuera de metadata.';

WITH extracted AS (
    SELECT
        pp.id,
        CASE
            WHEN jsonb_typeof(pp.metadata) = 'object'
                 AND NULLIF(btrim(pp.metadata->>'height'), '') ~ '^-?\d+(\.\d+)?$'
                THEN NULLIF(btrim(pp.metadata->>'height'), '')::numeric(9,2)
            WHEN jsonb_typeof(pp.metadata) = 'object'
                 AND NULLIF(btrim(pp.metadata->>'altura'), '') ~ '^-?\d+(\.\d+)?$'
                THEN NULLIF(btrim(pp.metadata->>'altura'), '')::numeric(9,2)
            ELSE NULL
        END AS height_from_metadata,
        CASE
            WHEN jsonb_typeof(pp.metadata) = 'object'
                 AND NULLIF(btrim(pp.metadata->>'min_height'), '') ~ '^-?\d+(\.\d+)?$'
                THEN NULLIF(btrim(pp.metadata->>'min_height'), '')::numeric(9,2)
            WHEN jsonb_typeof(pp.metadata) = 'object'
                 AND NULLIF(btrim(pp.metadata->>'base'), '') ~ '^-?\d+(\.\d+)?$'
                THEN NULLIF(btrim(pp.metadata->>'base'), '')::numeric(9,2)
            ELSE NULL
        END AS min_height_from_metadata,
        CASE
            WHEN jsonb_typeof(pp.metadata) = 'object'
                 AND NULLIF(btrim(pp.metadata->>'levels'), '') ~ '^-?\d+$'
                THEN NULLIF(btrim(pp.metadata->>'levels'), '')::integer
            WHEN jsonb_typeof(pp.metadata) = 'object'
                 AND NULLIF(btrim(pp.metadata->>'nivel'), '') ~ '^-?\d+$'
                THEN NULLIF(btrim(pp.metadata->>'nivel'), '')::integer
            ELSE NULL
        END AS levels_from_metadata,
        CASE
            WHEN jsonb_typeof(pp.metadata) = 'object'
                THEN NULLIF(btrim(COALESCE(pp.metadata->>'color', pp.metadata->>'metadata_color')), '')
            ELSE NULL
        END AS color_from_metadata,
        CASE
            WHEN jsonb_typeof(pp.metadata) = 'object' THEN
                COALESCE(pp.metadata, '{}'::jsonb)
                    - 'height'
                    - 'altura'
                    - 'min_height'
                    - 'base'
                    - 'levels'
                    - 'nivel'
                    - 'color'
                    - 'metadata_color'
            ELSE COALESCE(pp.metadata, '{}'::jsonb)
        END AS cleaned_metadata
    FROM public.propiedad_poligonos pp
)
UPDATE public.propiedad_poligonos pp
SET
    height = COALESCE(pp.height, extracted.height_from_metadata),
    min_height = COALESCE(pp.min_height, extracted.min_height_from_metadata),
    levels = COALESCE(pp.levels, extracted.levels_from_metadata),
    color = COALESCE(NULLIF(btrim(pp.color), ''), extracted.color_from_metadata),
    metadata = COALESCE(extracted.cleaned_metadata, '{}'::jsonb)
FROM extracted
WHERE pp.id = extracted.id;

CREATE OR REPLACE FUNCTION public.crm_propiedades_geojson(
    p_organizacion uuid,
    p_nivel integer DEFAULT NULL,
    p_tipo uuid DEFAULT NULL
) RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path = public, pg_temp
AS $$
WITH unidad_features AS (
    SELECT jsonb_build_object(
        'type', 'Feature',
        'id', u.id,
        'layer', 'unidad',
        'geometry', ST_AsGeoJSON(pp.geom)::jsonb,
        'properties', jsonb_build_object(
            'nombre', u.nombre,
            'unidad', u.unidad,
            'status', u.status,
            'status_color', CASE u.status
                WHEN 'disponible' THEN '#2ECC71'
                WHEN 'apartado' THEN '#F1C40F'
                WHEN 'vendido' THEN '#E74C3C'
                WHEN 'reservado' THEN '#9B59B6'
                ELSE pt.color
            END,
            'tipo', pt.nombre,
            'tipo_color', pt.color,
            'tipo_id', pt.id,
            'nivel', c.nivel,
            'altura', c.altura,
            'capa_nombre', c.nombre,
            'desarrollo_id', d.id,
            'desarrollo_nombre', d.nombre,
            'desarrollo_tipo', d.tipo,
            'desarrollo_status', d.status,
            'pais_codigo', d.pais_codigo,
            'estado_cve', d.estado_cve,
            'municipio_cve', d.municipio_cve,
            'codigo_postal', d.codigo_postal,
            'colonia', d.colonia,
            'precio', u.precio,
            'area_m2', u.area_m2,
            'metadata', u.metadata,
            'linea_id', u.linea_id,
            'linea_nombre', l.nombre,
            'familia_id', u.familia_id,
            'familia_nombre', f.nombre,
            'modelo_id', u.modelo_id,
            'modelo_nombre', m.nombre,
            'catalog_item_id', u.catalog_item_id,
            'oportunidad_id', u.oportunidad_id,
            'poligono_id', pp.id,
            'poligono_metadata', pp.metadata,
            'color', COALESCE(pp.color, NULLIF(btrim(pp.metadata->>'color'), ''), pt.color, '#95A5A6'),
            'height', COALESCE(
                pp.height,
                c.altura,
                CASE
                    WHEN NULLIF(btrim(pp.metadata->>'height'), '') ~ '^-?\d+(\.\d+)?$'
                        THEN NULLIF(btrim(pp.metadata->>'height'), '')::numeric(9,2)
                    WHEN NULLIF(btrim(pp.metadata->>'altura'), '') ~ '^-?\d+(\.\d+)?$'
                        THEN NULLIF(btrim(pp.metadata->>'altura'), '')::numeric(9,2)
                    ELSE NULL
                END,
                0
            ),
            'min_height', COALESCE(
                pp.min_height,
                CASE
                    WHEN NULLIF(btrim(pp.metadata->>'min_height'), '') ~ '^-?\d+(\.\d+)?$'
                        THEN NULLIF(btrim(pp.metadata->>'min_height'), '')::numeric(9,2)
                    WHEN NULLIF(btrim(pp.metadata->>'base'), '') ~ '^-?\d+(\.\d+)?$'
                        THEN NULLIF(btrim(pp.metadata->>'base'), '')::numeric(9,2)
                    ELSE NULL
                END,
                0
            ),
            'levels', COALESCE(
                pp.levels,
                CASE
                    WHEN NULLIF(btrim(pp.metadata->>'levels'), '') ~ '^-?\d+$'
                        THEN NULLIF(btrim(pp.metadata->>'levels'), '')::integer
                    WHEN NULLIF(btrim(pp.metadata->>'nivel'), '') ~ '^-?\d+$'
                        THEN NULLIF(btrim(pp.metadata->>'nivel'), '')::integer
                    ELSE NULL
                END,
                c.nivel,
                0
            )
        )
    ) AS feature
    FROM public.propiedad_unidades u
    JOIN public.propiedad_capas c ON c.id = u.nivel_id
    JOIN public.propiedad_desarrollos d ON d.id = COALESCE(u.desarrollo_id, c.desarrollo_id)
    LEFT JOIN public.propiedad_tipos pt ON pt.id = u.tipo_id
    LEFT JOIN public.propiedad_poligonos pp ON pp.target_type = 'unidad' AND pp.target_id = u.id
    LEFT JOIN public.lineas_de_negocio l ON l.id = u.linea_id
    LEFT JOIN public.familias_productos f ON f.id = u.familia_id
    LEFT JOIN public.modelos_productos m ON m.id = u.modelo_id
    WHERE d.organizacion_id = p_organizacion
      AND (p_nivel IS NULL OR c.nivel = p_nivel)
      AND (p_tipo IS NULL OR u.tipo_id = p_tipo)
),
capa_features AS (
    SELECT jsonb_build_object(
        'type', 'Feature',
        'id', c.id,
        'layer', 'capa',
        'geometry', ST_AsGeoJSON(pp.geom)::jsonb,
        'properties', jsonb_build_object(
            'nombre', c.nombre,
            'nivel', c.nivel,
            'altura', c.altura,
            'status', (c.metadata->>'status')::public.propiedad_status,
            'desarrollo_id', c.desarrollo_id,
            'desarrollo_nombre', d.nombre,
            'desarrollo_tipo', d.tipo,
            'desarrollo_status', d.status,
            'pais_codigo', d.pais_codigo,
            'estado_cve', d.estado_cve,
            'municipio_cve', d.municipio_cve,
            'metadata', c.metadata,
            'poligono_id', pp.id,
            'poligono_metadata', pp.metadata,
            'color', COALESCE(pp.color, NULLIF(btrim(pp.metadata->>'color'), ''), '#95A5A6'),
            'height', COALESCE(
                pp.height,
                c.altura,
                CASE
                    WHEN NULLIF(btrim(pp.metadata->>'height'), '') ~ '^-?\d+(\.\d+)?$'
                        THEN NULLIF(btrim(pp.metadata->>'height'), '')::numeric(9,2)
                    WHEN NULLIF(btrim(pp.metadata->>'altura'), '') ~ '^-?\d+(\.\d+)?$'
                        THEN NULLIF(btrim(pp.metadata->>'altura'), '')::numeric(9,2)
                    ELSE NULL
                END,
                0
            ),
            'min_height', COALESCE(
                pp.min_height,
                CASE
                    WHEN NULLIF(btrim(pp.metadata->>'min_height'), '') ~ '^-?\d+(\.\d+)?$'
                        THEN NULLIF(btrim(pp.metadata->>'min_height'), '')::numeric(9,2)
                    WHEN NULLIF(btrim(pp.metadata->>'base'), '') ~ '^-?\d+(\.\d+)?$'
                        THEN NULLIF(btrim(pp.metadata->>'base'), '')::numeric(9,2)
                    ELSE NULL
                END,
                0
            ),
            'levels', COALESCE(
                pp.levels,
                CASE
                    WHEN NULLIF(btrim(pp.metadata->>'levels'), '') ~ '^-?\d+$'
                        THEN NULLIF(btrim(pp.metadata->>'levels'), '')::integer
                    ELSE NULL
                END,
                c.nivel,
                0
            )
        )
    ) AS feature
    FROM public.propiedad_capas c
    JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
    LEFT JOIN public.propiedad_poligonos pp ON pp.target_type = 'capa' AND pp.target_id = c.id
    WHERE d.organizacion_id = p_organizacion
      AND (p_nivel IS NULL OR c.nivel = p_nivel)
),
desarrollo_features AS (
    SELECT jsonb_build_object(
        'type', 'Feature',
        'id', d.id,
        'layer', 'desarrollo',
        'geometry', ST_AsGeoJSON(pp.geom)::jsonb,
        'properties', jsonb_build_object(
            'nombre', d.nombre,
            'status', d.status,
            'desarrollo_tipo', d.tipo,
            'pais_codigo', d.pais_codigo,
            'estado_cve', d.estado_cve,
            'municipio_cve', d.municipio_cve,
            'descripcion', d.descripcion,
            'metadata', d.metadata,
            'poligono_id', pp.id,
            'poligono_metadata', pp.metadata,
            'color', COALESCE(pp.color, NULLIF(btrim(pp.metadata->>'color'), ''), '#95A5A6'),
            'height', COALESCE(
                pp.height,
                CASE
                    WHEN NULLIF(btrim(pp.metadata->>'height'), '') ~ '^-?\d+(\.\d+)?$'
                        THEN NULLIF(btrim(pp.metadata->>'height'), '')::numeric(9,2)
                    WHEN NULLIF(btrim(pp.metadata->>'altura'), '') ~ '^-?\d+(\.\d+)?$'
                        THEN NULLIF(btrim(pp.metadata->>'altura'), '')::numeric(9,2)
                    ELSE NULL
                END,
                0
            ),
            'min_height', COALESCE(
                pp.min_height,
                CASE
                    WHEN NULLIF(btrim(pp.metadata->>'min_height'), '') ~ '^-?\d+(\.\d+)?$'
                        THEN NULLIF(btrim(pp.metadata->>'min_height'), '')::numeric(9,2)
                    WHEN NULLIF(btrim(pp.metadata->>'base'), '') ~ '^-?\d+(\.\d+)?$'
                        THEN NULLIF(btrim(pp.metadata->>'base'), '')::numeric(9,2)
                    ELSE NULL
                END,
                0
            ),
            'levels', COALESCE(
                pp.levels,
                CASE
                    WHEN NULLIF(btrim(pp.metadata->>'levels'), '') ~ '^-?\d+$'
                        THEN NULLIF(btrim(pp.metadata->>'levels'), '')::integer
                    WHEN NULLIF(btrim(pp.metadata->>'nivel'), '') ~ '^-?\d+$'
                        THEN NULLIF(btrim(pp.metadata->>'nivel'), '')::integer
                    ELSE NULL
                END,
                0
            )
        )
    ) AS feature
    FROM public.propiedad_desarrollos d
    LEFT JOIN public.propiedad_poligonos pp ON pp.target_type = 'desarrollo' AND pp.target_id = d.id
    WHERE d.organizacion_id = p_organizacion
),
mix_features AS (
    SELECT jsonb_build_object(
        'type', 'Feature',
        'id', m.id,
        'layer', 'mix',
        'geometry', ST_AsGeoJSON(pp.geom)::jsonb,
        'properties', jsonb_build_object(
            'nombre', m.nombre,
            'status', m.status,
            'desarrollo_tipo', m.tipo,
            'pais_codigo', m.pais_codigo,
            'estado_cve', m.estado_cve,
            'municipio_cve', m.municipio_cve,
            'descripcion', m.descripcion,
            'metadata', m.metadata,
            'poligono_id', pp.id,
            'poligono_metadata', pp.metadata,
            'color', COALESCE(pp.color, NULLIF(btrim(pp.metadata->>'color'), ''), '#95A5A6'),
            'height', COALESCE(
                pp.height,
                NULLIF(btrim(pp.metadata->>'height'), '')::numeric,
                NULLIF(btrim(pp.metadata->>'altura'), '')::numeric,
                0
            ),
            'min_height', COALESCE(
                pp.min_height,
                NULLIF(btrim(pp.metadata->>'base'), '')::numeric,
                NULLIF(btrim(pp.metadata->>'min_height'), '')::numeric,
                0
            ),
            'levels', COALESCE(
                pp.levels,
                NULLIF(btrim(pp.metadata->>'levels'), '')::int,
                NULLIF(btrim(pp.metadata->>'nivel'), '')::int,
                0
            )
        )
    ) AS feature
    FROM public.propiedad_desarrollos_mix m
    LEFT JOIN public.propiedad_poligonos pp ON pp.target_type = 'mix' AND pp.target_id = m.id
    WHERE m.organizacion_id = p_organizacion
),
combined_features AS (
    SELECT feature FROM unidad_features
    UNION ALL
    SELECT feature FROM capa_features
    UNION ALL
    SELECT feature FROM desarrollo_features
    UNION ALL
    SELECT feature FROM mix_features
)
SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
) FROM combined_features;
$$;

GRANT EXECUTE ON FUNCTION public.crm_propiedades_geojson(uuid, integer, uuid) TO authenticated, service_role;

COMMIT;
