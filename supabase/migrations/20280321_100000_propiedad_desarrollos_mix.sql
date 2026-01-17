-- Migration para soportar desarrollos mixtos

CREATE TYPE propiedad_desarrollo_modo AS ENUM ('horizontal', 'vertical');

CREATE TABLE propiedad_desarrollos_mix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id UUID NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  tipo property_desarrollo_tipo NOT NULL DEFAULT 'mixto',
  status propiedad_status NOT NULL DEFAULT 'disponible',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  pais_codigo TEXT,
  estado_cve TEXT,
  municipio_cve TEXT,
  codigo_postal TEXT,
  colonia TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE propiedad_desarrollos_mix_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mix_id UUID NOT NULL REFERENCES propiedad_desarrollos_mix(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  modo propiedad_desarrollo_modo NOT NULL,
  descripcion TEXT,
  nivel INTEGER,
  altura NUMERIC,
  status propiedad_status NOT NULL DEFAULT 'disponible',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  desarrollo_id UUID NOT NULL REFERENCES propiedad_desarrollos(id) ON DELETE CASCADE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX propiedad_desarrollos_mix_organizacion_idx ON propiedad_desarrollos_mix(organizacion_id);
CREATE INDEX propiedad_desarrollos_mix_items_mix_idx ON propiedad_desarrollos_mix_items(mix_id);

ALTER TABLE propiedad_poligonos DROP CONSTRAINT IF EXISTS propiedad_poligonos_target_type_check;
ALTER TABLE propiedad_poligonos ADD CONSTRAINT propiedad_poligonos_target_type_check CHECK ((target_type = ANY (ARRAY['desarrollo'::text, 'capa'::text, 'unidad'::text, 'mix'::text])));

CREATE OR REPLACE FUNCTION public.crm_propiedad_hierarquia(p_organizacion uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
WITH desarrollos AS (
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
),
mixtos AS (
    SELECT jsonb_build_object(
        'id', m.id,
        'nombre', m.nombre,
        'tipo', m.tipo,
        'status', m.status,
        'metadata', m.metadata,
        'poligono_id', (
            SELECT pp.id
            FROM public.propiedad_poligonos pp
            WHERE pp.target_type = 'mix' AND pp.target_id = m.id
            LIMIT 1
        ),
        'geom', (
            SELECT ST_AsGeoJSON(pp.geom)::jsonb
            FROM public.propiedad_poligonos pp
            WHERE pp.target_type = 'mix' AND pp.target_id = m.id
            LIMIT 1
        ),
        'items', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', i.id,
                    'modo', i.modo,
                    'status', i.status,
                    'metadata', i.metadata,
                    'desarrollo_id', i.desarrollo_id
                )
            ), '[]'::jsonb)
            FROM public.propiedad_desarrollos_mix_items i
            WHERE i.mix_id = m.id
        )
    ) AS desarrollo
    FROM public.propiedad_desarrollos_mix m
    WHERE m.organizacion_id = p_organizacion
)
SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(desarrollo), '[]'::jsonb)
) FROM (
    SELECT desarrollo FROM desarrollos
    UNION ALL
    SELECT desarrollo FROM mixtos
) q;
$function$
;
