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
        'geom', ST_AsGeoJSON(d.geom)::jsonb,
        'capas', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', c.id,
                    'nombre', c.nombre,
                    'nivel', c.nivel,
                    'altura', c.altura,
                    'status', c.metadata ->> 'status',
                    'metadata', c.metadata,
                    'geom', ST_AsGeoJSON(c.geom)::jsonb,
                    'unidades', (
                        SELECT COALESCE(jsonb_agg(
                            jsonb_build_object(
                                'id', u.id,
                                'unidad', u.unidad,
                                'status', u.status,
                                'precio', u.precio,
                                'area_m2', u.area_m2,
                                'metadata', u.metadata,
                                'geom', ST_AsGeoJSON(u.geom)::jsonb
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
