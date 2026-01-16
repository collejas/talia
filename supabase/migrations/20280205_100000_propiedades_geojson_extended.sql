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
            'metadata', p.metadata,
            'linea_id', p.linea_id,
            'linea_nombre', l.nombre,
            'familia_id', p.familia_id,
            'familia_nombre', f.nombre,
            'modelo_id', p.modelo_id,
            'modelo_nombre', m.nombre,
            'pais_codigo', p.pais_codigo,
            'estado_cve', p.estado_cve,
            'municipio_cve', p.municipio_cve,
            'codigo_postal', p.codigo_postal,
            'colonia', p.colonia
        )
    ) AS feature
    FROM public.propiedades p
    JOIN public.propiedad_tipos pt ON pt.id = p.tipo_id
    LEFT JOIN public.lineas_de_negocio l ON l.id = p.linea_id
    LEFT JOIN public.familias_productos f ON f.id = p.familia_id
    LEFT JOIN public.modelos_productos m ON m.id = p.modelo_id
    WHERE p.organizacion_id = p_organizacion
      AND (p_nivel IS NULL OR p.nivel = p_nivel)
      AND (p_tipo IS NULL OR p.tipo_id = p_tipo)
) q;
$$;

GRANT EXECUTE ON FUNCTION public.crm_propiedades_geojson(uuid, integer, uuid) TO authenticated, service_role;

COMMIT;
