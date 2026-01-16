BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type
        WHERE typname = 'property_desarrollo_tipo'
          AND typnamespace = 'public'::regnamespace
    ) THEN
        CREATE TYPE public.property_desarrollo_tipo AS ENUM ('horizontal', 'vertical');
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.propiedad_desarrollos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    descripcion text,
    tipo public.property_desarrollo_tipo NOT NULL DEFAULT 'horizontal',
    status public.propiedad_status NOT NULL DEFAULT 'disponible',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    pais_codigo text,
    estado_cve text,
    municipio_cve text,
    codigo_postal text,
    colonia text,
    geom geometry(MultiPolygonZ,4326) NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_propiedad_desarrollos_organizacion_status
    ON public.propiedad_desarrollos (organizacion_id, status);
CREATE INDEX IF NOT EXISTS ix_propiedad_desarrollos_geom
    ON public.propiedad_desarrollos USING gist (geom);

ALTER TABLE public.propiedad_desarrollos ENABLE ROW LEVEL SECURITY;

CREATE POLICY propiedad_desarrollos_admin_all
    ON public.propiedad_desarrollos
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY propiedad_desarrollos_member_org
    ON public.propiedad_desarrollos
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

ALTER TABLE public.propiedad_capas
    ADD COLUMN IF NOT EXISTS desarrollo_id uuid REFERENCES public.propiedad_desarrollos(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS ix_propiedad_capas_desarrollo
    ON public.propiedad_capas (desarrollo_id);

ALTER TABLE public.propiedades
    ADD COLUMN IF NOT EXISTS desarrollo_id uuid REFERENCES public.propiedad_desarrollos(id),
    ADD COLUMN IF NOT EXISTS capa_id uuid REFERENCES public.propiedad_capas(id),
    ADD COLUMN IF NOT EXISTS unidad_id uuid REFERENCES public.propiedad_unidades(id);

CREATE INDEX IF NOT EXISTS ix_propiedades_desarrollo
    ON public.propiedades (desarrollo_id);
CREATE INDEX IF NOT EXISTS ix_propiedades_capa
    ON public.propiedades (capa_id);
CREATE INDEX IF NOT EXISTS ix_propiedades_unidad
    ON public.propiedades (unidad_id);

ALTER TABLE public.propiedades ENABLE ROW LEVEL SECURITY;

ALTER POLICY propiedades_member_org
    ON public.propiedades
    USING (
        organizacion_id = public.usuario_organizacion_id(auth.uid())
        OR EXISTS (
            SELECT 1
            FROM public.propiedad_desarrollos d
            WHERE d.id = desarrollo_id
              AND d.organizacion_id = public.usuario_organizacion_id(auth.uid())
        )
    )
    WITH CHECK (
        organizacion_id = public.usuario_organizacion_id(auth.uid())
        OR EXISTS (
            SELECT 1
            FROM public.propiedad_desarrollos d
            WHERE d.id = desarrollo_id
              AND d.organizacion_id = public.usuario_organizacion_id(auth.uid())
        )
    );

COMMIT;
