BEGIN;

-- Tabla para “listas inteligentes” de prospectos (filtros reutilizables)
CREATE TABLE IF NOT EXISTS public.prospeccion_contacto_listas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    descripcion text,
    filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
    total_estimado integer,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_por uuid DEFAULT auth.uid(),
    actualizado_por uuid,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.prospeccion_contacto_listas IS 'Listas inteligentes de prospectos (filtros guardados por organización).';

CREATE INDEX IF NOT EXISTS prospeccion_contacto_listas_org_idx
    ON public.prospeccion_contacto_listas (organizacion_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS prospeccion_contacto_listas_nombre_idx
    ON public.prospeccion_contacto_listas (organizacion_id, lower(nombre));

ALTER TABLE public.prospeccion_contacto_listas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prospeccion_contacto_listas' AND policyname = 'prospeccion_contacto_listas_admin_all'
    ) THEN
        CREATE POLICY prospeccion_contacto_listas_admin_all
            ON public.prospeccion_contacto_listas
            FOR ALL
            TO authenticated
            USING (public.es_admin(auth.uid()))
            WITH CHECK (public.es_admin(auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prospeccion_contacto_listas' AND policyname = 'prospeccion_contacto_listas_member_org'
    ) THEN
        CREATE POLICY prospeccion_contacto_listas_member_org
            ON public.prospeccion_contacto_listas
            FOR ALL
            TO authenticated
            USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
            WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));
    END IF;
END;
$$;

CREATE TRIGGER t_prospeccion_contacto_listas_set_org
    BEFORE INSERT ON public.prospeccion_contacto_listas
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();

CREATE TRIGGER t_prospeccion_contacto_listas_touch
    BEFORE UPDATE ON public.prospeccion_contacto_listas
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

-- Nuevos campos en batches para vincular campañas/wizard
ALTER TABLE public.prospeccion_contacto_batch
    ADD COLUMN IF NOT EXISTS campana_id uuid REFERENCES public.campanas(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS lista_id uuid REFERENCES public.prospeccion_contacto_listas(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS titulo text,
    ADD COLUMN IF NOT EXISTS programacion jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS prospeccion_contacto_batch_campana_idx
    ON public.prospeccion_contacto_batch (organizacion_id, campana_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS prospeccion_contacto_batch_lista_idx
    ON public.prospeccion_contacto_batch (organizacion_id, lista_id, creado_en DESC);

COMMENT ON COLUMN public.prospeccion_contacto_batch.titulo IS 'Nombre amigable del lote/wizard mostrado en la UI.';
COMMENT ON COLUMN public.prospeccion_contacto_batch.programacion IS 'JSON con programaciones por canal (wizard multicanal).';

COMMIT;
