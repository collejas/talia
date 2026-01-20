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
        'id', u.id,
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
            'poligono_id', pp.id,
            'poligono_metadata', pp.metadata,
            'color', COALESCE(pp.metadata->> 'color', pt.color, '#95A5A6')
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
) q;
$$;

GRANT EXECUTE ON FUNCTION public.crm_propiedades_geojson(uuid, integer, uuid) TO authenticated, service_role;

COMMIT;
