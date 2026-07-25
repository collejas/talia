BEGIN;

-- Cuarto nivel de la jerarquia comercial/geografica:
-- desarrollo -> macrolote (propiedad_capas) -> manzana -> unidad.
CREATE TABLE IF NOT EXISTS public.propiedad_manzanas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    macrolote_id uuid NOT NULL REFERENCES public.propiedad_capas(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    descripcion text,
    status public.propiedad_status NOT NULL DEFAULT 'disponible',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT propiedad_manzanas_nombre_chk CHECK (btrim(nombre) <> '')
);

CREATE INDEX IF NOT EXISTS ix_propiedad_manzanas_macrolote
    ON public.propiedad_manzanas (macrolote_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_propiedad_manzanas_macrolote_nombre
    ON public.propiedad_manzanas (macrolote_id, lower(btrim(nombre)));

ALTER TABLE public.propiedad_unidades
    ADD COLUMN IF NOT EXISTS manzana_id uuid
    REFERENCES public.propiedad_manzanas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_propiedad_unidades_manzana
    ON public.propiedad_unidades (manzana_id);

ALTER TABLE public.propiedad_manzanas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS propiedad_manzanas_admin_all ON public.propiedad_manzanas;
CREATE POLICY propiedad_manzanas_admin_all
    ON public.propiedad_manzanas
    FOR ALL TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

DROP POLICY IF EXISTS propiedad_manzanas_member_org ON public.propiedad_manzanas;
CREATE POLICY propiedad_manzanas_member_org
    ON public.propiedad_manzanas
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.propiedad_capas c
            JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
            WHERE c.id = propiedad_manzanas.macrolote_id
              AND d.organizacion_id = public.usuario_organizacion_id(auth.uid())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.propiedad_capas c
            JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
            WHERE c.id = propiedad_manzanas.macrolote_id
              AND d.organizacion_id = public.usuario_organizacion_id(auth.uid())
        )
    );

CREATE OR REPLACE FUNCTION public.crm_propiedad_hierarquia(p_organizacion uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(jsonb_build_object(
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
        'poligono_id', dp.id,
        'geom', ST_AsGeoJSON(dp.geom)::jsonb,
        'capas', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', c.id,
                'nombre', c.nombre,
                'nivel', c.nivel,
                'altura', c.altura,
                'status', c.status,
                'metadata', c.metadata,
                'poligono_id', cp.id,
                'geom', ST_AsGeoJSON(cp.geom)::jsonb,
                'manzanas', (
                    SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'id', m.id,
                        'nombre', m.nombre,
                        'descripcion', m.descripcion,
                        'status', m.status,
                        'metadata', m.metadata,
                        'poligono_id', mp.id,
                        'geom', ST_AsGeoJSON(mp.geom)::jsonb,
                        'unidades', (
                            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                'id', u.id, 'unidad', u.unidad, 'nombre', u.nombre,
                                'status', u.status, 'precio', u.precio,
                                'area_m2', u.area_m2, 'tipo_id', u.tipo_id,
                                'descripcion', u.descripcion, 'metadata', u.metadata,
                                'poligono_id', up.id, 'geom', ST_AsGeoJSON(up.geom)::jsonb
                            ) ORDER BY u.unidad), '[]'::jsonb)
                            FROM public.propiedad_unidades u
                            LEFT JOIN public.propiedad_poligonos up
                              ON up.target_type = 'unidad' AND up.target_id = u.id
                            WHERE u.manzana_id = m.id
                        )
                    ) ORDER BY m.nombre), '[]'::jsonb)
                    FROM public.propiedad_manzanas m
                    LEFT JOIN public.propiedad_poligonos mp
                      ON mp.target_type = 'manzana' AND mp.target_id = m.id
                    WHERE m.macrolote_id = c.id
                ),
                'unidades', (
                    SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'id', u.id, 'unidad', u.unidad, 'nombre', u.nombre,
                        'status', u.status, 'precio', u.precio,
                        'area_m2', u.area_m2, 'tipo_id', u.tipo_id,
                        'descripcion', u.descripcion, 'metadata', u.metadata,
                        'poligono_id', up.id, 'geom', ST_AsGeoJSON(up.geom)::jsonb
                    ) ORDER BY u.unidad), '[]'::jsonb)
                    FROM public.propiedad_unidades u
                    LEFT JOIN public.propiedad_poligonos up
                      ON up.target_type = 'unidad' AND up.target_id = u.id
                    WHERE u.nivel_id = c.id AND u.manzana_id IS NULL
                )
            ) ORDER BY c.nivel, c.nombre), '[]'::jsonb)
            FROM public.propiedad_capas c
            LEFT JOIN public.propiedad_poligonos cp
              ON cp.target_type = 'capa' AND cp.target_id = c.id
            WHERE c.desarrollo_id = d.id
        )
    ) ORDER BY d.nombre), '[]'::jsonb)
)
FROM public.propiedad_desarrollos d
LEFT JOIN public.propiedad_poligonos dp
  ON dp.target_type = 'desarrollo' AND dp.target_id = d.id
WHERE d.organizacion_id = p_organizacion;
$$;

GRANT EXECUTE ON FUNCTION public.crm_propiedad_hierarquia(uuid) TO authenticated, service_role;

-- Mantener la funcion geojson existente y extenderla sin duplicar su contrato
-- comercial/3D. Las unidades conservan nivel_id como macrolote y agregan
-- manzana_id como padre inmediato cuando corresponda.
ALTER FUNCTION public.crm_propiedades_geojson(uuid, integer, uuid)
    RENAME TO crm_propiedades_geojson_base;

CREATE OR REPLACE FUNCTION public.crm_propiedades_geojson(
    p_organizacion uuid,
    p_nivel integer DEFAULT NULL,
    p_tipo uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
WITH base AS (
    SELECT public.crm_propiedades_geojson_base(p_organizacion, p_nivel, p_tipo) AS payload
), patched AS (
    SELECT CASE
        WHEN feature->>'layer' = 'unidad' AND u.manzana_id IS NOT NULL THEN
            jsonb_set(
                jsonb_set(
                    jsonb_set(feature, '{properties,manzana_id}', to_jsonb(u.manzana_id::text), true),
                    '{properties,parent_id}', to_jsonb(u.manzana_id::text), true
                ),
                '{properties,manzana_nombre}', to_jsonb(m.nombre), true
            )
        ELSE feature
    END AS feature
    FROM base
    CROSS JOIN LATERAL jsonb_array_elements(base.payload->'features') AS item(feature)
    LEFT JOIN public.propiedad_unidades u
      ON feature->>'layer' = 'unidad'
     AND feature->>'id' = u.id::text
    LEFT JOIN public.propiedad_manzanas m ON m.id = u.manzana_id
), manzana_features AS (
    SELECT jsonb_build_object(
        'type', 'Feature',
        'id', m.id,
        'layer', 'manzana',
        'geometry', ST_AsGeoJSON(pp.geom)::jsonb,
        'properties', jsonb_build_object(
            'nombre', m.nombre,
            'manzana_id', m.id,
            'parent_id', m.macrolote_id,
            'capa_id', m.macrolote_id,
            'nivel_id', m.macrolote_id,
            'nivel', c.nivel,
            'status', m.status,
            'status_color', CASE m.status
                WHEN 'disponible' THEN '#2ECC71'
                WHEN 'apartado' THEN '#F1C40F'
                WHEN 'vendido' THEN '#E74C3C'
                WHEN 'reservado' THEN '#9B59B6'
                ELSE '#95A5A6'
            END,
            'desarrollo_id', d.id,
            'desarrollo_nombre', d.nombre,
            'capa_nombre', c.nombre,
            'color', COALESCE(pp.color, '#95A5A6'),
            'height', COALESCE(pp.height, 0),
            'min_height', COALESCE(pp.min_height, 0),
            'levels', COALESCE(pp.levels, 0),
            'poligono_id', pp.id,
            'poligono_metadata', pp.metadata
        )
    ) AS feature
    FROM public.propiedad_manzanas m
    JOIN public.propiedad_capas c ON c.id = m.macrolote_id
    JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
    LEFT JOIN public.propiedad_poligonos pp
      ON pp.target_type = 'manzana' AND pp.target_id = m.id
    WHERE d.organizacion_id = p_organizacion
      AND (p_nivel IS NULL OR c.nivel = p_nivel)
)
SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(
        (SELECT jsonb_agg(feature) FROM (
            SELECT feature FROM patched
            UNION ALL
            SELECT feature FROM manzana_features
        ) all_features),
        '[]'::jsonb
    )
);
$$;

GRANT EXECUTE ON FUNCTION public.crm_propiedades_geojson(uuid, integer, uuid) TO authenticated, service_role;

COMMIT;
