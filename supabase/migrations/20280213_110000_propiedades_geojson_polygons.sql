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
) FROM (
    SELECT jsonb_build_object(
        'type', 'Feature',
        'id', u.id,
        'geometry', ST_AsGeoJSON(pp.geom)::jsonb,
        'properties', jsonb_build_object(
            'nombre', u.nombre,
            'unidad', u.unidad,
            'status', u.status,
            'tipo', pt.nombre,
            'tipo_color', pt.color,
            'nivel', c.nivel,
            'desarrollo_id', d.id,
            'capa_id', c.id,
            'precio', u.precio,
            'area_m2', u.area_m2,
            'metadata', u.metadata,
            'linea_id', u.linea_id,
            'familia_id', u.familia_id,
            'modelo_id', u.modelo_id,
            'poligono_id', pp.id
        )
    ) AS feature
    FROM public.propiedad_unidades u
    JOIN public.propiedad_capas c ON c.id = u.nivel_id
    JOIN public.propiedad_desarrollos d ON d.id = COALESCE(u.desarrollo_id, c.desarrollo_id)
    LEFT JOIN public.propiedad_tipos pt ON pt.id = u.tipo_id
    LEFT JOIN public.propiedad_poligonos pp ON pp.target_type = 'unidad' AND pp.target_id = u.id
    WHERE d.organizacion_id = p_organizacion
      AND (p_nivel IS NULL OR c.nivel = p_nivel)
      AND (p_tipo IS NULL OR u.tipo_id = p_tipo)
) q;
$$;

GRANT EXECUTE ON FUNCTION public.crm_propiedades_geojson(uuid, integer, uuid) TO authenticated, service_role;

COMMIT;
