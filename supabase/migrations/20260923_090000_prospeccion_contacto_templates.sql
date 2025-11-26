-- Tabla de plantillas para envíos de contacto
CREATE TABLE IF NOT EXISTS public.prospeccion_contacto_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canal text NOT NULL,
    slug text NOT NULL UNIQUE,
    nombre text NOT NULL,
    descripcion text,
    asunto text,
    cuerpo_texto text,
    cuerpo_html text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    activo boolean NOT NULL DEFAULT true,
    creado_por uuid DEFAULT auth.uid(),
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER t_prospeccion_contacto_templates_touch
    BEFORE UPDATE ON public.prospeccion_contacto_templates
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

ALTER TABLE public.prospeccion_contacto_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_contacto_templates'
          AND policyname = 'p_select_prospeccion_contacto_templates'
    ) THEN
        CREATE POLICY p_select_prospeccion_contacto_templates
            ON public.prospeccion_contacto_templates
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_contacto_templates'
          AND policyname = 'p_insert_prospeccion_contacto_templates'
    ) THEN
        CREATE POLICY p_insert_prospeccion_contacto_templates
            ON public.prospeccion_contacto_templates
            FOR INSERT
            TO authenticated
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_contacto_templates'
          AND policyname = 'p_update_prospeccion_contacto_templates'
    ) THEN
        CREATE POLICY p_update_prospeccion_contacto_templates
            ON public.prospeccion_contacto_templates
            FOR UPDATE
            TO authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END;
$$;

COMMENT ON TABLE public.prospeccion_contacto_templates IS 'Plantillas reutilizables para envíos de correo/WhatsApp/llamadas en prospección.';
