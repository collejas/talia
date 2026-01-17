BEGIN;

CREATE TABLE IF NOT EXISTS public.propiedad_poligonos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    target_type text NOT NULL CHECK (target_type IN ('desarrollo', 'capa', 'unidad')),
    target_id uuid NOT NULL,
    geom geometry(MultiPolygonZ,4326) NOT NULL,
    status public.propiedad_status NOT NULL DEFAULT 'disponible',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (target_type, target_id)
);

CREATE INDEX IF NOT EXISTS ix_propiedad_poligonos_organizacion ON public.propiedad_poligonos (organizacion_id);
CREATE INDEX IF NOT EXISTS ix_propiedad_poligonos_target ON public.propiedad_poligonos (target_type, target_id);
CREATE INDEX IF NOT EXISTS ix_propiedad_poligonos_geom ON public.propiedad_poligonos USING gist (geom);

ALTER TABLE public.propiedad_poligonos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policy
        WHERE polname = 'propiedad_poligonos_admin_all'
          AND polrelid = 'public.propiedad_poligonos'::regclass
    ) THEN
        CREATE POLICY propiedad_poligonos_admin_all
            ON public.propiedad_poligonos
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
        WHERE polname = 'propiedad_poligonos_member_org'
          AND polrelid = 'public.propiedad_poligonos'::regclass
    ) THEN
        CREATE POLICY propiedad_poligonos_member_org
            ON public.propiedad_poligonos
            FOR ALL
            TO authenticated
            USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
            WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'propiedad_poligonos_touch_updated_at'
    ) THEN
        EXECUTE $trigger$
            CREATE TRIGGER propiedad_poligonos_touch_updated_at
            BEFORE UPDATE ON public.propiedad_poligonos
            FOR EACH ROW
            EXECUTE FUNCTION public.tg_touch_updated_at()
        $trigger$;
    END IF;
END;
$$;

COMMIT;
