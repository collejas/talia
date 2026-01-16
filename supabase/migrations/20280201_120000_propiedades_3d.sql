BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'propiedad_status'
          AND typnamespace = 'public'::regnamespace
    ) THEN
        CREATE TYPE public.propiedad_status AS ENUM ('disponible', 'apartado', 'vendido', 'reservado');
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.propiedad_tipos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    descripcion text,
    color text NOT NULL DEFAULT '#FFFFFF',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.propiedad_tipos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policy
        WHERE polname = 'propiedad_tipos_admin_all'
          AND polrelid = 'public.propiedad_tipos'::regclass
    ) THEN
        CREATE POLICY propiedad_tipos_admin_all
            ON public.propiedad_tipos
            FOR ALL
            TO authenticated
            USING (public.es_admin(auth.uid()))
            WITH CHECK (public.es_admin(auth.uid()));
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policy
        WHERE polname = 'propiedad_tipos_member_org'
          AND polrelid = 'public.propiedad_tipos'::regclass
    ) THEN
        CREATE POLICY propiedad_tipos_member_org
            ON public.propiedad_tipos
            FOR ALL
            TO authenticated
            USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
            WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.propiedad_tipos WHERE nombre = 'lote') THEN
        INSERT INTO public.propiedad_tipos (organizacion_id, nombre, descripcion, color)
        VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'lote', 'Terrenos sin construcción', '#2ECC71');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.propiedad_tipos WHERE nombre = 'casa') THEN
        INSERT INTO public.propiedad_tipos (organizacion_id, nombre, descripcion, color)
        VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'casa', 'Residencias unifamiliares', '#3498DB');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.propiedad_tipos WHERE nombre = 'departamento') THEN
        INSERT INTO public.propiedad_tipos (organizacion_id, nombre, descripcion, color)
        VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'departamento', 'Unidades verticales', '#9B59B6');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.propiedad_tipos WHERE nombre = 'local comercial') THEN
        INSERT INTO public.propiedad_tipos (organizacion_id, nombre, descripcion, color)
        VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'local comercial', 'Espacios comerciales', '#E67E22');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.propiedad_tipos WHERE nombre = 'oficina') THEN
        INSERT INTO public.propiedad_tipos (organizacion_id, nombre, descripcion, color)
        VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'oficina', 'Espacios corporativos', '#1ABC9C');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.propiedad_tipos WHERE nombre = 'consultorio') THEN
        INSERT INTO public.propiedad_tipos (organizacion_id, nombre, descripcion, color)
        VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'consultorio', 'Espacios médicos', '#E74C3C');
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.propiedades (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    tipo_id uuid NOT NULL REFERENCES public.propiedad_tipos(id) ON DELETE RESTRICT,
    nombre text NOT NULL,
    descripcion text,
    status public.propiedad_status NOT NULL DEFAULT 'disponible',
    precio numeric(14,2),
    nivel integer,
    height numeric(9,2),
    min_height numeric(9,2),
    levels integer,
    area_m2 numeric(10,2),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    geom geometry(MultiPolygonZ,4326) NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_propiedades_organizacion_status ON public.propiedades (organizacion_id, status);
CREATE INDEX IF NOT EXISTS ix_propiedades_tipo ON public.propiedades (tipo_id);
CREATE INDEX IF NOT EXISTS ix_propiedades_geom ON public.propiedades USING gist (geom);

ALTER TABLE public.propiedades ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policy
        WHERE polname = 'propiedades_admin_all'
          AND polrelid = 'public.propiedades'::regclass
    ) THEN
        CREATE POLICY propiedades_admin_all
            ON public.propiedades
            FOR ALL
            TO authenticated
            USING (public.es_admin(auth.uid()))
            WITH CHECK (public.es_admin(auth.uid()));
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policy
        WHERE polname = 'propiedades_member_org'
          AND polrelid = 'public.propiedades'::regclass
    ) THEN
        CREATE POLICY propiedades_member_org
            ON public.propiedades
            FOR ALL
            TO authenticated
            USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
            WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.propiedad_niveles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    propiedad_id uuid NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
    nivel integer NOT NULL,
    nombre text,
    descripcion text,
    altura numeric(9,2),
    geom geometry(PolygonZ,4326) NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_propiedad_niveles_propiedad ON public.propiedad_niveles (propiedad_id, nivel);
CREATE INDEX IF NOT EXISTS ix_propiedad_niveles_geom ON public.propiedad_niveles USING gist (geom);

ALTER TABLE public.propiedad_niveles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policy
        WHERE polname = 'propiedad_niveles_admin_all'
          AND polrelid = 'public.propiedad_niveles'::regclass
    ) THEN
        CREATE POLICY propiedad_niveles_admin_all
            ON public.propiedad_niveles
            FOR ALL
            TO authenticated
            USING (public.es_admin(auth.uid()))
            WITH CHECK (public.es_admin(auth.uid()));
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policy
        WHERE polname = 'propiedad_niveles_member_org'
          AND polrelid = 'public.propiedad_niveles'::regclass
    ) THEN
        CREATE POLICY propiedad_niveles_member_org
            ON public.propiedad_niveles
            FOR ALL
            TO authenticated
            USING (exists (select 1 from public.propiedades p where p.id = propiedad_id and p.organizacion_id = public.usuario_organizacion_id(auth.uid())))
            WITH CHECK (exists (select 1 from public.propiedades p where p.id = propiedad_id and p.organizacion_id = public.usuario_organizacion_id(auth.uid())));
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.propiedad_departamentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nivel_id uuid NOT NULL REFERENCES public.propiedad_niveles(id) ON DELETE CASCADE,
    unidad text NOT NULL,
    status public.propiedad_status NOT NULL DEFAULT 'disponible',
    precio numeric(14,2),
    area_m2 numeric(10,2),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    geom geometry(PolygonZ,4326) NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_propiedad_departamentos_nivel ON public.propiedad_departamentos (nivel_id, status);
CREATE INDEX IF NOT EXISTS ix_propiedad_departamentos_geom ON public.propiedad_departamentos USING gist (geom);

ALTER TABLE public.propiedad_departamentos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policy
        WHERE polname = 'propiedad_departamentos_admin_all'
          AND polrelid = 'public.propiedad_departamentos'::regclass
    ) THEN
        CREATE POLICY propiedad_departamentos_admin_all
            ON public.propiedad_departamentos
            FOR ALL
            TO authenticated
            USING (public.es_admin(auth.uid()))
            WITH CHECK (public.es_admin(auth.uid()));
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policy
        WHERE polname = 'propiedad_departamentos_member_org'
          AND polrelid = 'public.propiedad_departamentos'::regclass
    ) THEN
        CREATE POLICY propiedad_departamentos_member_org
            ON public.propiedad_departamentos
            FOR ALL
            TO authenticated
            USING (exists (select 1 from public.propiedad_niveles n join public.propiedades p on p.id = n.propiedad_id where n.id = nivel_id and p.organizacion_id = public.usuario_organizacion_id(auth.uid())))
            WITH CHECK (exists (select 1 from public.propiedad_niveles n join public.propiedades p on p.id = n.propiedad_id where n.id = nivel_id and p.organizacion_id = public.usuario_organizacion_id(auth.uid())));
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'propiedades_touch_updated_at'
    ) THEN
        EXECUTE $trigger$
            CREATE TRIGGER propiedades_touch_updated_at
            BEFORE UPDATE ON public.propiedades
            FOR EACH ROW
            EXECUTE FUNCTION public.tg_touch_updated_at()
        $trigger$;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'propiedad_niveles_touch_updated_at'
    ) THEN
        EXECUTE $trigger$
            CREATE TRIGGER propiedad_niveles_touch_updated_at
            BEFORE UPDATE ON public.propiedad_niveles
            FOR EACH ROW
            EXECUTE FUNCTION public.tg_touch_updated_at()
        $trigger$;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'propiedad_departamentos_touch_updated_at'
    ) THEN
        EXECUTE $trigger$
            CREATE TRIGGER propiedad_departamentos_touch_updated_at
            BEFORE UPDATE ON public.propiedad_departamentos
            FOR EACH ROW
            EXECUTE FUNCTION public.tg_touch_updated_at()
        $trigger$;
    END IF;
END;
$$;

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
        'geometry', ST_AsGeoJSON(u.geom)::jsonb,
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
            'modelo_id', u.modelo_id
        )
    ) AS feature
    FROM public.propiedad_unidades u
    JOIN public.propiedad_capas c ON c.id = u.nivel_id
    JOIN public.propiedad_desarrollos d ON d.id = COALESCE(u.desarrollo_id, c.desarrollo_id)
    LEFT JOIN public.propiedad_tipos pt ON pt.id = u.tipo_id
    WHERE d.organizacion_id = p_organizacion
      AND (p_nivel IS NULL OR c.nivel = p_nivel)
      AND (p_tipo IS NULL OR u.tipo_id = p_tipo)
) q;
$$;

GRANT EXECUTE ON FUNCTION public.crm_propiedades_geojson(uuid, integer, uuid) TO authenticated, service_role;

COMMIT;
