BEGIN;

-- Expone la manzana como feature independiente para que el drilldown pueda
-- mostrar su poligono antes de mostrar las unidades que contiene.
CREATE OR REPLACE FUNCTION public.crm_propiedades_geojson(
    p_organizacion uuid,
    p_nivel integer DEFAULT NULL,
    p_tipo uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
)
FROM (
    SELECT jsonb_build_object(
        'type', 'Feature', 'id', u.id, 'layer', 'unidad',
        'geometry', ST_AsGeoJSON(up.geom)::jsonb,
        'properties', jsonb_build_object(
            'nombre', u.nombre, 'unidad', u.unidad, 'status', u.status,
            'status_color', CASE u.status
                WHEN 'disponible' THEN '#2ECC71' WHEN 'apartado' THEN '#F1C40F'
                WHEN 'vendido' THEN '#E74C3C' WHEN 'reservado' THEN '#9B59B6'
                ELSE pt.color END,
            'tipo', pt.nombre, 'tipo_color', pt.color, 'tipo_id', pt.id,
            'nivel', c.nivel, 'nivel_id', c.id, 'capa_id', c.id,
            'capa_nombre', c.nombre, 'capa_status', c.status,
            'desarrollo_id', d.id, 'desarrollo_nombre', d.nombre,
            'desarrollo_tipo', d.tipo, 'desarrollo_status', d.status,
            'pais_codigo', d.pais_codigo, 'estado_cve', d.estado_cve,
            'municipio_cve', d.municipio_cve, 'codigo_postal', d.codigo_postal,
            'colonia', d.colonia, 'precio', u.precio, 'area_m2', u.area_m2,
            'metadata', u.metadata, 'linea_id', u.linea_id, 'linea_nombre', l.nombre,
            'familia_id', u.familia_id, 'familia_nombre', f.nombre,
            'modelo_id', u.modelo_id, 'modelo_nombre', m.nombre,
            'catalog_item_id', u.catalog_item_id, 'oportunidad_id', u.oportunidad_id,
            'manzana_id', u.manzana_id, 'manzana_nombre', man.nombre,
            'poligono_id', up.id, 'poligono_metadata', up.metadata,
            'color', COALESCE(up.color, pt.color, '#95A5A6'),
            'height', COALESCE(up.height, c.altura, 0),
            'min_height', COALESCE(up.min_height, 0),
            'levels', COALESCE(up.levels, c.nivel, 0)
        )
    ) AS feature
    FROM public.propiedad_unidades u
    JOIN public.propiedad_capas c ON c.id = u.nivel_id
    JOIN public.propiedad_desarrollos d ON d.id = COALESCE(u.desarrollo_id, c.desarrollo_id)
    LEFT JOIN public.propiedad_manzanas man ON man.id = u.manzana_id
    LEFT JOIN public.propiedad_tipos pt ON pt.id = u.tipo_id
    LEFT JOIN public.propiedad_poligonos up ON up.target_type = 'unidad' AND up.target_id = u.id
    LEFT JOIN public.lineas_de_negocio l ON l.id = u.linea_id
    LEFT JOIN public.familias_productos f ON f.id = u.familia_id
    LEFT JOIN public.modelos_productos m ON m.id = u.modelo_id
    WHERE d.organizacion_id = p_organizacion
      AND (p_nivel IS NULL OR c.nivel = p_nivel)
      AND (p_tipo IS NULL OR u.tipo_id = p_tipo)

    UNION ALL

    SELECT jsonb_build_object(
        'type', 'Feature', 'id', man.id, 'layer', 'manzana',
        'geometry', ST_AsGeoJSON(mp.geom)::jsonb,
        'properties', jsonb_build_object(
            'nombre', man.nombre, 'manzana_id', man.id,
            'status', man.status, 'descripcion', man.descripcion,
            'metadata', man.metadata, 'macrolote_id', c.id,
            'capa_id', c.id, 'nivel_id', c.id, 'nivel', c.nivel,
            'capa_nombre', c.nombre, 'desarrollo_id', d.id,
            'desarrollo_nombre', d.nombre, 'desarrollo_tipo', d.tipo,
            'desarrollo_status', d.status, 'pais_codigo', d.pais_codigo,
            'estado_cve', d.estado_cve, 'municipio_cve', d.municipio_cve,
            'codigo_postal', d.codigo_postal, 'colonia', d.colonia,
            'poligono_id', mp.id, 'poligono_metadata', mp.metadata,
            'color', COALESCE(mp.color, '#95A5A6'),
            'height', COALESCE(mp.height, c.altura, 0),
            'min_height', COALESCE(mp.min_height, 0),
            'levels', COALESCE(mp.levels, c.nivel, 0)
        )
    ) AS feature
    FROM public.propiedad_manzanas man
    JOIN public.propiedad_capas c ON c.id = man.macrolote_id
    JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
    LEFT JOIN public.propiedad_poligonos mp ON mp.target_type = 'manzana' AND mp.target_id = man.id
    WHERE d.organizacion_id = p_organizacion
      AND (p_nivel IS NULL OR c.nivel = p_nivel)

    UNION ALL

    SELECT jsonb_build_object(
        'type', 'Feature', 'id', c.id, 'layer', 'capa',
        'geometry', ST_AsGeoJSON(cp.geom)::jsonb,
        'properties', jsonb_build_object(
            'nombre', c.nombre, 'nivel', c.nivel, 'nivel_id', c.id,
            'capa_id', c.id, 'altura', c.altura, 'status', c.status,
            'desarrollo_id', d.id, 'desarrollo_nombre', d.nombre,
            'desarrollo_tipo', d.tipo, 'desarrollo_status', d.status,
            'pais_codigo', d.pais_codigo, 'estado_cve', d.estado_cve,
            'municipio_cve', d.municipio_cve, 'codigo_postal', d.codigo_postal,
            'colonia', d.colonia, 'metadata', c.metadata,
            'poligono_id', cp.id, 'poligono_metadata', cp.metadata,
            'color', COALESCE(cp.color, '#95A5A6'),
            'height', COALESCE(cp.height, c.altura, 0),
            'min_height', COALESCE(cp.min_height, 0),
            'levels', COALESCE(cp.levels, c.nivel, 0)
        )
    ) AS feature
    FROM public.propiedad_capas c
    JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
    LEFT JOIN public.propiedad_poligonos cp ON cp.target_type = 'capa' AND cp.target_id = c.id
    WHERE d.organizacion_id = p_organizacion
      AND (p_nivel IS NULL OR c.nivel = p_nivel)

    UNION ALL

    SELECT jsonb_build_object(
        'type', 'Feature', 'id', d.id, 'layer', 'desarrollo',
        'geometry', ST_AsGeoJSON(dp.geom)::jsonb,
        'properties', jsonb_build_object(
            'nombre', d.nombre, 'desarrollo_id', d.id, 'status', d.status,
            'desarrollo_tipo', d.tipo, 'pais_codigo', d.pais_codigo,
            'estado_cve', d.estado_cve, 'municipio_cve', d.municipio_cve,
            'codigo_postal', d.codigo_postal, 'colonia', d.colonia,
            'descripcion', d.descripcion, 'metadata', d.metadata,
            'poligono_id', dp.id, 'poligono_metadata', dp.metadata,
            'color', COALESCE(dp.color, '#95A5A6'),
            'height', COALESCE(dp.height, 0), 'min_height', COALESCE(dp.min_height, 0),
            'levels', COALESCE(dp.levels, 0)
        )
    ) AS feature
    FROM public.propiedad_desarrollos d
    LEFT JOIN public.propiedad_poligonos dp ON dp.target_type = 'desarrollo' AND dp.target_id = d.id
    WHERE d.organizacion_id = p_organizacion

    UNION ALL

    SELECT jsonb_build_object(
        'type', 'Feature', 'id', mx.id, 'layer', 'mix',
        'geometry', ST_AsGeoJSON(mp.geom)::jsonb,
        'properties', jsonb_build_object(
            'nombre', mx.nombre, 'status', mx.status,
            'desarrollo_tipo', mx.tipo, 'pais_codigo', mx.pais_codigo,
            'estado_cve', mx.estado_cve, 'municipio_cve', mx.municipio_cve,
            'codigo_postal', mx.codigo_postal, 'colonia', mx.colonia,
            'descripcion', mx.descripcion, 'metadata', mx.metadata,
            'poligono_id', mp.id, 'poligono_metadata', mp.metadata,
            'color', COALESCE(mp.color, '#95A5A6'),
            'height', COALESCE(mp.height, 0),
            'min_height', COALESCE(mp.min_height, 0),
            'levels', COALESCE(mp.levels, 0)
        )
    ) AS feature
    FROM public.propiedad_desarrollos_mix mx
    LEFT JOIN public.propiedad_poligonos mp ON mp.target_type = 'mix' AND mp.target_id = mx.id
    WHERE mx.organizacion_id = p_organizacion
) q;
$$;

GRANT EXECUTE ON FUNCTION public.crm_propiedades_geojson(uuid, integer, uuid)
    TO authenticated, service_role;

COMMIT;
