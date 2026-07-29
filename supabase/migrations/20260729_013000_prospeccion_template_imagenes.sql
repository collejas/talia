-- Recursos gráficos explícitos y tenant-safe para plantillas de correo.

CREATE UNIQUE INDEX IF NOT EXISTS logos_organizacion_id_id_key
    ON public.logos (organizacion_id, id);

CREATE TABLE IF NOT EXISTS public.prospeccion_contacto_template_imagenes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    template_id uuid NOT NULL,
    logo_id uuid NOT NULL,
    variable_clave text NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prospeccion_contacto_template_imagenes_variable_check
        CHECK (
            variable_clave IN (
                'logo_url',
                'hero_image_url',
                'product_image_1_url',
                'product_image_2_url',
                'product_image_3_url',
                'product_image_4_url',
                'warranty_image_url'
            )
        ),
    CONSTRAINT prospeccion_contacto_template_imagenes_template_fkey
        FOREIGN KEY (organizacion_id, template_id)
        REFERENCES public.prospeccion_contacto_templates (organizacion_id, id)
        ON DELETE CASCADE,
    CONSTRAINT prospeccion_contacto_template_imagenes_logo_fkey
        FOREIGN KEY (organizacion_id, logo_id)
        REFERENCES public.logos (organizacion_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT prospeccion_contacto_template_imagenes_variable_unique
        UNIQUE (organizacion_id, template_id, variable_clave)
);

CREATE INDEX IF NOT EXISTS prospeccion_contacto_template_imagenes_template_idx
    ON public.prospeccion_contacto_template_imagenes (organizacion_id, template_id);

CREATE INDEX IF NOT EXISTS prospeccion_contacto_template_imagenes_logo_idx
    ON public.prospeccion_contacto_template_imagenes (organizacion_id, logo_id);

DROP TRIGGER IF EXISTS prospeccion_contacto_template_imagenes_touch
    ON public.prospeccion_contacto_template_imagenes;
CREATE TRIGGER prospeccion_contacto_template_imagenes_touch
    BEFORE UPDATE ON public.prospeccion_contacto_template_imagenes
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

ALTER TABLE public.prospeccion_contacto_template_imagenes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prospeccion_contacto_template_imagenes_member_org
    ON public.prospeccion_contacto_template_imagenes;
CREATE POLICY prospeccion_contacto_template_imagenes_member_org
    ON public.prospeccion_contacto_template_imagenes
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.prospeccion_contacto_template_imagenes
    TO authenticated, service_role;

COMMENT ON TABLE public.prospeccion_contacto_template_imagenes IS
    'Asigna recursos gráficos tenant-scoped a variables explícitas de plantillas de prospección.';
COMMENT ON COLUMN public.prospeccion_contacto_template_imagenes.variable_clave IS
    'Variable soportada en cuerpo_html, por ejemplo hero_image_url o product_image_1_url.';
