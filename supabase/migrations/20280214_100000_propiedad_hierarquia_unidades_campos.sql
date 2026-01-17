BEGIN;

CREATE OR REPLACE FUNCTION public.crm_propiedad_hierarquia(p_organizacion uuid)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
AS $$
SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(desarrollo), '[]'::jsonb)
) FROM (
    SELECT jsonb_build_object(
        'id', d.id,
        'nombre', d.nombre,
        'tipo', d.tipo,
        'status', d.status,
        'pais_codigo', d.pais_codigo,
        'estado_cve', d.estado_cve,
        'municipio_cve', d.municipio_cve,
        'codigo_postal', d.codigo_postal,
        'colonia', d.colonia,
        'metadata', d.metadata,
        'poligono_id', (
            SELECT pp.id
            FROM public.propiedad_poligonos pp
            WHERE pp.target_type = 'desarrollo' AND pp.target_id = d.id
            LIMIT 1
        ),
        'geom', (
            SELECT ST_AsGeoJSON(pp.geom)::jsonb
            FROM public.propiedad_poligonos pp
            WHERE pp.target_type = 'desarrollo' AND pp.target_id = d.id
            LIMIT 1
        ),
        'capas', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', c.id,
                    'nombre', c.nombre,
                    'nivel', c.nivel,
                    'altura', c.altura,
                    'status', c.metadata ->> 'status',
                    'metadata', c.metadata,
                    'poligono_id', (
                        SELECT pp.id
                        FROM public.propiedad_poligonos pp
                        WHERE pp.target_type = 'capa' AND pp.target_id = c.id
                        LIMIT 1
                    ),
                    'geom', (
                        SELECT ST_AsGeoJSON(pp.geom)::jsonb
                        FROM public.propiedad_poligonos pp
                        WHERE pp.target_type = 'capa' AND pp.target_id = c.id
                        LIMIT 1
                    ),
                    'unidades', (
                        SELECT COALESCE(jsonb_agg(
                            jsonb_build_object(
                                'id', u.id,
                                'unidad', u.unidad,
                                'nombre', u.nombre,
                                'status', u.status,
                                'tipo_id', u.tipo_id,
                                'precio', u.precio,
                                'area_m2', u.area_m2,
                                'linea_id', u.linea_id,
                                'familia_id', u.familia_id,
                                'modelo_id', u.modelo_id,
                                'descripcion', u.descripcion,
                                'metadata', u.metadata,
                                'poligono_id', (
                                    SELECT pp.id
                                    FROM public.propiedad_poligonos pp
                                    WHERE pp.target_type = 'unidad' AND pp.target_id = u.id
                                    LIMIT 1
                                ),
                                'geom', (
                                    SELECT ST_AsGeoJSON(pp.geom)::jsonb
                                    FROM public.propiedad_poligonos pp
                                    WHERE pp.target_type = 'unidad' AND pp.target_id = u.id
                                    LIMIT 1
                                )
                            )
                            ORDER BY u.unidad
                        ), '[]'::jsonb)
                        FROM public.propiedad_unidades u
                        WHERE u.nivel_id = c.id
                    )
                )
                ORDER BY c.nivel
            ), '[]'::jsonb)
            FROM public.propiedad_capas c
            WHERE c.desarrollo_id = d.id
        )
    ) AS desarrollo
    FROM public.propiedad_desarrollos d
    WHERE d.organizacion_id = p_organizacion
) q;
$$;

GRANT EXECUTE ON FUNCTION public.crm_propiedad_hierarquia(uuid) TO authenticated, service_role;

COMMIT;
