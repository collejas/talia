BEGIN;

CREATE OR REPLACE FUNCTION public.crm_propiedades_geojson(
    p_organizacion uuid,
    p_nivel integer DEFAULT NULL,
    p_tipo uuid DEFAULT NULL
) RETURNS jsonb
    LANGUAGE sql
    STABLE
AS $$
SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
)
FROM (
    SELECT jsonb_build_object(
        'type', 'Feature',
        'id', p.id,
        'geometry', ST_AsGeoJSON(p.geom)::jsonb,
        'properties', jsonb_build_object(
            'nombre', p.nombre,
            'status', p.status,
            'tipo', pt.nombre,
            'tipo_color', pt.color,
            'tipo_id', pt.id,
            'nivel', p.nivel,
            'height', p.height,
            'min_height', p.min_height,
            'levels', p.levels,
            'precio', p.precio,
            'area_m2', p.area_m2,
            'metadata', p.metadata
        )
    ) AS feature
    FROM public.propiedades p
    JOIN public.propiedad_tipos pt ON pt.id = p.tipo_id
    WHERE p.organizacion_id = p_organizacion
      AND (p_nivel IS NULL OR p.nivel = p_nivel)
      AND (p_tipo IS NULL OR p.tipo_id = p_tipo)
) q;
$$;

GRANT EXECUTE ON FUNCTION public.crm_propiedades_geojson(uuid, integer, uuid) TO authenticated, service_role;

COMMIT;
