-- Asistente IA para plantillas de prospección.
--
-- Esta migración crea el catálogo explícito de variables, la configuración
-- central de prompts y la trazabilidad de generaciones. No duplica el texto
-- final de las plantillas existentes ni usa metadata/jsonb para estructura de
-- negocio.

BEGIN;

-- Apoyo para forzar que el ledger OpenAI relacionado pertenezca al mismo tenant.
CREATE UNIQUE INDEX IF NOT EXISTS openai_request_usage_org_id_id_key
    ON public.openai_request_usage (organizacion_id, id);

CREATE TABLE IF NOT EXISTS public.prospeccion_plantilla_ai_prompt_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL
        REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    canal text NOT NULL,
    prompt_id text NOT NULL,
    prompt_version text NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    actualizado_por uuid NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prospeccion_plantilla_ai_prompt_config_master_org_chk
        CHECK (
            organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
        ),
    CONSTRAINT prospeccion_plantilla_ai_prompt_config_canal_chk
        CHECK (canal IN ('correo', 'whatsapp')),
    CONSTRAINT prospeccion_plantilla_ai_prompt_config_prompt_id_chk
        CHECK (btrim(prompt_id) <> ''),
    CONSTRAINT prospeccion_plantilla_ai_prompt_config_prompt_version_chk
        CHECK (btrim(prompt_version) <> ''),
    CONSTRAINT prospeccion_plantilla_ai_prompt_config_org_user_fkey
        FOREIGN KEY (organizacion_id, actualizado_por)
        REFERENCES public.usuarios(organizacion_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT prospeccion_plantilla_ai_prompt_config_org_canal_key
        UNIQUE (organizacion_id, canal)
);

CREATE TABLE IF NOT EXISTS public.prospeccion_plantilla_ai_variables (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clave text NOT NULL,
    etiqueta text NOT NULL,
    descripcion text NOT NULL,
    tipo_dato text NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    orden integer NOT NULL DEFAULT 0,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prospeccion_plantilla_ai_variables_clave_key
        UNIQUE (clave),
    CONSTRAINT prospeccion_plantilla_ai_variables_clave_chk
        CHECK (btrim(clave) <> ''),
    CONSTRAINT prospeccion_plantilla_ai_variables_etiqueta_chk
        CHECK (btrim(etiqueta) <> ''),
    CONSTRAINT prospeccion_plantilla_ai_variables_tipo_dato_chk
        CHECK (tipo_dato IN ('texto', 'url', 'imagen')),
    CONSTRAINT prospeccion_plantilla_ai_variables_orden_chk
        CHECK (orden >= 0)
);

CREATE TABLE IF NOT EXISTS public.prospeccion_plantilla_ai_variable_canales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    variable_id uuid NOT NULL
        REFERENCES public.prospeccion_plantilla_ai_variables(id) ON DELETE CASCADE,
    canal text NOT NULL,
    permite_asunto boolean NOT NULL DEFAULT false,
    permite_cuerpo_texto boolean NOT NULL DEFAULT true,
    permite_cuerpo_html boolean NOT NULL DEFAULT false,
    permite_header_media boolean NOT NULL DEFAULT false,
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prospeccion_plantilla_ai_variable_canales_key
        UNIQUE (variable_id, canal),
    CONSTRAINT prospeccion_plantilla_ai_variable_canales_canal_chk
        CHECK (canal IN ('correo', 'whatsapp')),
    CONSTRAINT prospeccion_plantilla_ai_variable_canales_usage_chk
        CHECK (
            permite_asunto
            OR permite_cuerpo_texto
            OR permite_cuerpo_html
            OR permite_header_media
        )
);

CREATE TABLE IF NOT EXISTS public.prospeccion_plantilla_ai_generaciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL
        REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    usuario_id uuid NOT NULL,
    campana_id uuid NULL,
    template_id uuid NULL,
    canal text NOT NULL,
    prompt_id text NOT NULL,
    prompt_version text NOT NULL,
    modelo text NOT NULL,
    instruccion_usuario text NOT NULL,
    tono text NULL,
    idioma text NULL,
    resultado_estado text NOT NULL DEFAULT 'solicitada',
    openai_request_id text NULL,
    openai_request_usage_id uuid NULL,
    input_tokens integer NULL,
    output_tokens integer NULL,
    costo_estimado numeric(18, 8) NULL,
    duracion_ms integer NULL,
    error_codigo text NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    finalizado_en timestamptz NULL,
    CONSTRAINT prospeccion_plantilla_ai_generaciones_org_id_key
        UNIQUE (organizacion_id, id),
    CONSTRAINT prospeccion_plantilla_ai_generaciones_usuario_org_fkey
        FOREIGN KEY (organizacion_id, usuario_id)
        REFERENCES public.usuarios(organizacion_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT prospeccion_plantilla_ai_generaciones_campana_org_fkey
        FOREIGN KEY (organizacion_id, campana_id)
        REFERENCES public.campanas(organizacion_id, id)
        ON DELETE SET NULL,
    CONSTRAINT prospeccion_plantilla_ai_generaciones_template_org_fkey
        FOREIGN KEY (organizacion_id, template_id)
        REFERENCES public.prospeccion_contacto_templates(organizacion_id, id)
        ON DELETE SET NULL,
    CONSTRAINT prospeccion_plantilla_ai_generaciones_openai_usage_org_fkey
        FOREIGN KEY (organizacion_id, openai_request_usage_id)
        REFERENCES public.openai_request_usage(organizacion_id, id)
        ON DELETE SET NULL,
    CONSTRAINT prospeccion_plantilla_ai_generaciones_canal_chk
        CHECK (canal IN ('correo', 'whatsapp')),
    CONSTRAINT prospeccion_plantilla_ai_generaciones_estado_chk
        CHECK (
            resultado_estado IN (
                'solicitada',
                'generada',
                'aceptada',
                'descartada',
                'error',
                'timeout',
                'respuesta_invalida'
            )
        ),
    CONSTRAINT prospeccion_plantilla_ai_generaciones_prompt_id_chk
        CHECK (btrim(prompt_id) <> ''),
    CONSTRAINT prospeccion_plantilla_ai_generaciones_prompt_version_chk
        CHECK (btrim(prompt_version) <> ''),
    CONSTRAINT prospeccion_plantilla_ai_generaciones_modelo_chk
        CHECK (btrim(modelo) <> ''),
    CONSTRAINT prospeccion_plantilla_ai_generaciones_instruction_chk
        CHECK (btrim(instruccion_usuario) <> ''),
    CONSTRAINT prospeccion_plantilla_ai_generaciones_nonnegative_chk
        CHECK (
            (input_tokens IS NULL OR input_tokens >= 0)
            AND (output_tokens IS NULL OR output_tokens >= 0)
            AND (costo_estimado IS NULL OR costo_estimado >= 0)
            AND (duracion_ms IS NULL OR duracion_ms >= 0)
        )
);

CREATE TABLE IF NOT EXISTS public.prospeccion_plantilla_ai_generacion_variables (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    generacion_id uuid NOT NULL,
    variable_id uuid NOT NULL
        REFERENCES public.prospeccion_plantilla_ai_variables(id) ON DELETE RESTRICT,
    seleccionada_por_usuario boolean NOT NULL DEFAULT true,
    utilizada_por_modelo boolean NOT NULL DEFAULT false,
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prospeccion_plantilla_ai_generacion_variables_org_generation_fkey
        FOREIGN KEY (organizacion_id, generacion_id)
        REFERENCES public.prospeccion_plantilla_ai_generaciones(organizacion_id, id)
        ON DELETE CASCADE,
    CONSTRAINT prospeccion_plantilla_ai_generacion_variables_key
        UNIQUE (generacion_id, variable_id),
    CONSTRAINT prospeccion_plantilla_ai_generacion_variables_org_key
        UNIQUE (organizacion_id, id)
);

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_ai_prompt_config_org_active_canal_idx
    ON public.prospeccion_plantilla_ai_prompt_config (organizacion_id, activo, canal);

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_ai_variable_canales_canal_active_idx
    ON public.prospeccion_plantilla_ai_variable_canales (canal, activo, variable_id);

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_ai_generaciones_org_created_idx
    ON public.prospeccion_plantilla_ai_generaciones (organizacion_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_ai_generaciones_org_channel_created_idx
    ON public.prospeccion_plantilla_ai_generaciones (organizacion_id, canal, creado_en DESC);

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_ai_generaciones_org_status_created_idx
    ON public.prospeccion_plantilla_ai_generaciones (organizacion_id, resultado_estado, creado_en DESC);

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_ai_generaciones_prompt_version_idx
    ON public.prospeccion_plantilla_ai_generaciones (prompt_id, prompt_version, creado_en DESC);

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_ai_generaciones_usuario_created_idx
    ON public.prospeccion_plantilla_ai_generaciones (organizacion_id, usuario_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_ai_generaciones_campana_created_idx
    ON public.prospeccion_plantilla_ai_generaciones (organizacion_id, campana_id, creado_en DESC)
    WHERE campana_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_ai_generaciones_template_created_idx
    ON public.prospeccion_plantilla_ai_generaciones (organizacion_id, template_id, creado_en DESC)
    WHERE template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_ai_generacion_variables_generation_idx
    ON public.prospeccion_plantilla_ai_generacion_variables (organizacion_id, generacion_id);

CREATE INDEX IF NOT EXISTS prospeccion_plantilla_ai_generacion_variables_variable_used_idx
    ON public.prospeccion_plantilla_ai_generacion_variables (variable_id, utilizada_por_modelo);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 't_prospeccion_plantilla_ai_prompt_config_touch'
          AND tgrelid = 'public.prospeccion_plantilla_ai_prompt_config'::regclass
    ) THEN
        CREATE TRIGGER t_prospeccion_plantilla_ai_prompt_config_touch
            BEFORE UPDATE ON public.prospeccion_plantilla_ai_prompt_config
            FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 't_prospeccion_plantilla_ai_variables_touch'
          AND tgrelid = 'public.prospeccion_plantilla_ai_variables'::regclass
    ) THEN
        CREATE TRIGGER t_prospeccion_plantilla_ai_variables_touch
            BEFORE UPDATE ON public.prospeccion_plantilla_ai_variables
            FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 't_prospeccion_plantilla_ai_variable_canales_touch'
          AND tgrelid = 'public.prospeccion_plantilla_ai_variable_canales'::regclass
    ) THEN
        CREATE TRIGGER t_prospeccion_plantilla_ai_variable_canales_touch
            BEFORE UPDATE ON public.prospeccion_plantilla_ai_variable_canales
            FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
    END IF;
END;
$$;

INSERT INTO public.prospeccion_plantilla_ai_variables
    (clave, etiqueta, descripcion, tipo_dato, orden)
VALUES
    ('display_name', 'Nombre visible', 'Nombre visible o nombre de presentación del prospecto.', 'texto', 10),
    ('nombre', 'Nombre', 'Nombre del prospecto.', 'texto', 20),
    ('titulo', 'Título', 'Título o tratamiento del prospecto.', 'texto', 30),
    ('primer_apellido', 'Primer apellido', 'Primer apellido del prospecto.', 'texto', 40),
    ('segundo_apellido', 'Segundo apellido', 'Segundo apellido del prospecto.', 'texto', 50),
    ('empresa', 'Empresa', 'Empresa o negocio del prospecto.', 'texto', 60),
    ('email', 'Correo', 'Correo electrónico del prospecto.', 'texto', 70),
    ('telefono', 'Teléfono', 'Teléfono del prospecto.', 'texto', 80),
    ('segmento', 'Segmento', 'Segmento o giro comercial del prospecto.', 'texto', 90),
    ('canal_origen', 'Canal de origen', 'Canal por el que se obtuvo el prospecto.', 'texto', 100),
    ('logo_url', 'Logo URL', 'URL pública del logo del tenant.', 'imagen', 110),
    ('hero_image_url', 'Imagen principal', 'URL pública de la imagen principal.', 'imagen', 120),
    ('product_image_1_url', 'Producto 1', 'URL pública de la primera imagen de producto.', 'imagen', 130),
    ('product_image_2_url', 'Producto 2', 'URL pública de la segunda imagen de producto.', 'imagen', 140),
    ('product_image_3_url', 'Producto 3', 'URL pública de la tercera imagen de producto.', 'imagen', 150),
    ('product_image_4_url', 'Producto 4', 'URL pública de la cuarta imagen de producto.', 'imagen', 160),
    ('warranty_image_url', 'Imagen de garantía', 'URL pública de la imagen de garantía.', 'imagen', 170),
    ('tracking_url', 'Tracking URL', 'URL de seguimiento generada por la plataforma.', 'url', 180),
    ('website_url', 'Website URL', 'URL pública del sitio web del tenant.', 'url', 190),
    ('booking_url', 'Booking URL', 'URL pública para agendar una cita.', 'url', 200),
    ('booking_link_text', 'Texto del enlace de agenda', 'Texto visible del enlace para agendar.', 'texto', 210)
ON CONFLICT (clave) DO UPDATE
SET etiqueta = EXCLUDED.etiqueta,
    descripcion = EXCLUDED.descripcion,
    tipo_dato = EXCLUDED.tipo_dato,
    orden = EXCLUDED.orden,
    actualizado_en = now();

INSERT INTO public.prospeccion_plantilla_ai_variable_canales
    (variable_id, canal, permite_asunto, permite_cuerpo_texto, permite_cuerpo_html, permite_header_media)
SELECT v.id,
       c.canal,
       c.permite_asunto,
       c.permite_cuerpo_texto,
       c.permite_cuerpo_html,
       (v.tipo_dato = 'imagen' AND c.canal = 'whatsapp') AS permite_header_media
FROM public.prospeccion_plantilla_ai_variables v
JOIN (
    VALUES
        ('display_name', 'correo', true, true, true),
        ('nombre', 'correo', true, true, true),
        ('titulo', 'correo', true, true, true),
        ('primer_apellido', 'correo', true, true, true),
        ('segundo_apellido', 'correo', true, true, true),
        ('empresa', 'correo', true, true, true),
        ('email', 'correo', false, true, true),
        ('telefono', 'correo', false, true, true),
        ('segmento', 'correo', false, true, true),
        ('canal_origen', 'correo', false, true, true),
        ('logo_url', 'correo', false, false, true),
        ('hero_image_url', 'correo', false, false, true),
        ('product_image_1_url', 'correo', false, false, true),
        ('product_image_2_url', 'correo', false, false, true),
        ('product_image_3_url', 'correo', false, false, true),
        ('product_image_4_url', 'correo', false, false, true),
        ('warranty_image_url', 'correo', false, false, true),
        ('tracking_url', 'correo', false, true, true),
        ('website_url', 'correo', false, true, true),
        ('booking_url', 'correo', false, true, true),
        ('booking_link_text', 'correo', false, true, true),
        ('display_name', 'whatsapp', false, true, false),
        ('nombre', 'whatsapp', false, true, false),
        ('titulo', 'whatsapp', false, true, false),
        ('primer_apellido', 'whatsapp', false, true, false),
        ('segundo_apellido', 'whatsapp', false, true, false),
        ('empresa', 'whatsapp', false, true, false),
        ('email', 'whatsapp', false, true, false),
        ('telefono', 'whatsapp', false, true, false),
        ('segmento', 'whatsapp', false, true, false),
        ('canal_origen', 'whatsapp', false, true, false),
        ('logo_url', 'whatsapp', false, false, false),
        ('hero_image_url', 'whatsapp', false, false, false),
        ('product_image_1_url', 'whatsapp', false, false, false),
        ('product_image_2_url', 'whatsapp', false, false, false),
        ('product_image_3_url', 'whatsapp', false, false, false),
        ('product_image_4_url', 'whatsapp', false, false, false),
        ('warranty_image_url', 'whatsapp', false, false, false),
        ('tracking_url', 'whatsapp', false, true, false),
        ('website_url', 'whatsapp', false, true, false),
        ('booking_url', 'whatsapp', false, true, false),
        ('booking_link_text', 'whatsapp', false, true, false)
) AS c(clave, canal, permite_asunto, permite_cuerpo_texto, permite_cuerpo_html)
    ON c.clave = v.clave
ON CONFLICT (variable_id, canal) DO UPDATE
SET permite_asunto = EXCLUDED.permite_asunto,
    permite_cuerpo_texto = EXCLUDED.permite_cuerpo_texto,
    permite_cuerpo_html = EXCLUDED.permite_cuerpo_html,
    permite_header_media = EXCLUDED.permite_header_media,
    actualizado_en = now();

ALTER TABLE public.prospeccion_plantilla_ai_prompt_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccion_plantilla_ai_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccion_plantilla_ai_variable_canales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccion_plantilla_ai_generaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccion_plantilla_ai_generacion_variables ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.prospeccion_plantilla_ai_prompt_config TO authenticated;
GRANT SELECT ON public.prospeccion_plantilla_ai_variables TO authenticated;
GRANT SELECT ON public.prospeccion_plantilla_ai_variable_canales TO authenticated;
GRANT SELECT ON public.prospeccion_plantilla_ai_generaciones TO authenticated;
GRANT SELECT ON public.prospeccion_plantilla_ai_generacion_variables TO authenticated;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_plantilla_ai_prompt_config'
          AND policyname = 'prospeccion_plantilla_ai_prompt_config_owner_select'
    ) THEN
        CREATE POLICY prospeccion_plantilla_ai_prompt_config_owner_select
            ON public.prospeccion_plantilla_ai_prompt_config
            FOR SELECT TO authenticated
            USING (
                organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
                AND public.es_owner((SELECT auth.uid()))
                AND public.usuario_organizacion_id((SELECT auth.uid())) = organizacion_id
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_plantilla_ai_prompt_config'
          AND policyname = 'prospeccion_plantilla_ai_prompt_config_owner_write'
    ) THEN
        CREATE POLICY prospeccion_plantilla_ai_prompt_config_owner_write
            ON public.prospeccion_plantilla_ai_prompt_config
            FOR ALL TO authenticated
            USING (
                organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
                AND public.es_owner((SELECT auth.uid()))
                AND public.usuario_organizacion_id((SELECT auth.uid())) = organizacion_id
            )
            WITH CHECK (
                organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
                AND public.es_owner((SELECT auth.uid()))
                AND public.usuario_organizacion_id((SELECT auth.uid())) = organizacion_id
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_plantilla_ai_variables'
          AND policyname = 'prospeccion_plantilla_ai_variables_authenticated_select'
    ) THEN
        CREATE POLICY prospeccion_plantilla_ai_variables_authenticated_select
            ON public.prospeccion_plantilla_ai_variables
            FOR SELECT TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_plantilla_ai_variable_canales'
          AND policyname = 'prospeccion_plantilla_ai_variable_canales_authenticated_select'
    ) THEN
        CREATE POLICY prospeccion_plantilla_ai_variable_canales_authenticated_select
            ON public.prospeccion_plantilla_ai_variable_canales
            FOR SELECT TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_plantilla_ai_generaciones'
          AND policyname = 'prospeccion_plantilla_ai_generaciones_org_select'
    ) THEN
        CREATE POLICY prospeccion_plantilla_ai_generaciones_org_select
            ON public.prospeccion_plantilla_ai_generaciones
            FOR SELECT TO authenticated
            USING (
                organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_plantilla_ai_generacion_variables'
          AND policyname = 'prospeccion_plantilla_ai_generacion_variables_org_select'
    ) THEN
        CREATE POLICY prospeccion_plantilla_ai_generacion_variables_org_select
            ON public.prospeccion_plantilla_ai_generacion_variables
            FOR SELECT TO authenticated
            USING (
                organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
            );
    END IF;
END;
$$;

COMMENT ON TABLE public.prospeccion_plantilla_ai_prompt_config IS
    'Configuracion central de los prompts IA de plantillas, editable por el tenant propietario.';
COMMENT ON TABLE public.prospeccion_plantilla_ai_variables IS
    'Catalogo explicito de variables permitidas para plantillas IA de prospeccion.';
COMMENT ON TABLE public.prospeccion_plantilla_ai_variable_canales IS
    'Reglas de uso de variables por canal y campo de plantilla.';
COMMENT ON TABLE public.prospeccion_plantilla_ai_generaciones IS
    'Historial multi-tenant de solicitudes, resultados, versiones y consumo del asistente IA.';
COMMENT ON TABLE public.prospeccion_plantilla_ai_generacion_variables IS
    'Variables seleccionadas y utilizadas en cada generacion IA.';

COMMIT;
