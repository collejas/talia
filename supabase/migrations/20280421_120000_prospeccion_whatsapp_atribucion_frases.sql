CREATE TABLE IF NOT EXISTS public.prospeccion_whatsapp_atribucion_reglas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    nombre_regla text NOT NULL,
    canal_publicitario text NOT NULL,
    frase_objetivo text NOT NULL,
    frase_normalizada text,
    tipo_match text DEFAULT 'contiene'::text NOT NULL,
    campana_publicitaria text,
    adset text,
    anuncio text,
    prioridad integer DEFAULT 100 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_por uuid DEFAULT auth.uid(),
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT prospeccion_whatsapp_atribucion_reglas_pkey PRIMARY KEY (id),
    CONSTRAINT prospeccion_whatsapp_atribucion_reglas_org_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT prospeccion_whatsapp_atribucion_reglas_tipo_match_check
        CHECK (tipo_match = ANY (ARRAY['exacta'::text, 'contiene'::text, 'regex'::text])),
    CONSTRAINT prospeccion_whatsapp_atribucion_reglas_nombre_check
        CHECK (NULLIF(btrim(nombre_regla), '') IS NOT NULL),
    CONSTRAINT prospeccion_whatsapp_atribucion_reglas_frase_check
        CHECK (NULLIF(btrim(frase_objetivo), '') IS NOT NULL)
);

ALTER TABLE ONLY public.prospeccion_whatsapp_atribucion_reglas FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS prospeccion_wa_atrib_reglas_org_activo_prio_idx
    ON public.prospeccion_whatsapp_atribucion_reglas USING btree (organizacion_id, activo, prioridad ASC, creado_en ASC);

CREATE INDEX IF NOT EXISTS prospeccion_wa_atrib_reglas_org_canal_idx
    ON public.prospeccion_whatsapp_atribucion_reglas USING btree (organizacion_id, canal_publicitario, activo);

CREATE INDEX IF NOT EXISTS prospeccion_wa_atrib_reglas_org_frase_idx
    ON public.prospeccion_whatsapp_atribucion_reglas USING btree (organizacion_id, frase_normalizada);

CREATE TABLE IF NOT EXISTS public.prospeccion_whatsapp_atribucion_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    regla_id uuid,
    conversacion_id uuid NOT NULL,
    contacto_id uuid NOT NULL,
    mensaje_id text,
    frase_original text,
    frase_normalizada text,
    tipo_match text,
    canal_publicitario text,
    campana_publicitaria text,
    adset text,
    anuncio text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT prospeccion_whatsapp_atribucion_eventos_pkey PRIMARY KEY (id),
    CONSTRAINT prospeccion_whatsapp_atribucion_eventos_unique_conversacion
        UNIQUE (organizacion_id, conversacion_id),
    CONSTRAINT prospeccion_whatsapp_atribucion_eventos_org_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT prospeccion_whatsapp_atribucion_eventos_regla_fkey
        FOREIGN KEY (regla_id) REFERENCES public.prospeccion_whatsapp_atribucion_reglas(id) ON DELETE SET NULL,
    CONSTRAINT prospeccion_whatsapp_atribucion_eventos_conversacion_fkey
        FOREIGN KEY (conversacion_id) REFERENCES public.conversaciones(id) ON DELETE CASCADE,
    CONSTRAINT prospeccion_whatsapp_atribucion_eventos_contacto_fkey
        FOREIGN KEY (contacto_id) REFERENCES public.contactos(id) ON DELETE CASCADE,
    CONSTRAINT prospeccion_whatsapp_atribucion_eventos_tipo_match_check
        CHECK (tipo_match IS NULL OR tipo_match = ANY (ARRAY['exacta'::text, 'contiene'::text, 'regex'::text]))
);

ALTER TABLE ONLY public.prospeccion_whatsapp_atribucion_eventos FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS prospeccion_wa_atrib_eventos_org_fecha_idx
    ON public.prospeccion_whatsapp_atribucion_eventos USING btree (organizacion_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS prospeccion_wa_atrib_eventos_org_regla_idx
    ON public.prospeccion_whatsapp_atribucion_eventos USING btree (organizacion_id, regla_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS prospeccion_wa_atrib_eventos_org_contacto_idx
    ON public.prospeccion_whatsapp_atribucion_eventos USING btree (organizacion_id, contacto_id, creado_en DESC);

CREATE OR REPLACE FUNCTION public.tg_prospeccion_whatsapp_atribucion_reglas_normalize()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.nombre_regla := NULLIF(btrim(NEW.nombre_regla), '');
    NEW.canal_publicitario := NULLIF(btrim(NEW.canal_publicitario), '');
    NEW.frase_objetivo := NULLIF(btrim(NEW.frase_objetivo), '');
    NEW.tipo_match := COALESCE(NULLIF(lower(btrim(NEW.tipo_match)), ''), 'contiene');

    IF NEW.campana_publicitaria IS NOT NULL THEN
        NEW.campana_publicitaria := NULLIF(btrim(NEW.campana_publicitaria), '');
    END IF;
    IF NEW.adset IS NOT NULL THEN
        NEW.adset := NULLIF(btrim(NEW.adset), '');
    END IF;
    IF NEW.anuncio IS NOT NULL THEN
        NEW.anuncio := NULLIF(btrim(NEW.anuncio), '');
    END IF;

    NEW.frase_normalizada := CASE
        WHEN NEW.frase_objetivo IS NULL THEN NULL
        ELSE lower(NEW.frase_objetivo)
    END;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_prospeccion_whatsapp_atribucion_eventos_normalize()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.frase_original IS NOT NULL THEN
        NEW.frase_original := NULLIF(btrim(NEW.frase_original), '');
    END IF;
    IF NEW.frase_normalizada IS NOT NULL THEN
        NEW.frase_normalizada := NULLIF(lower(btrim(NEW.frase_normalizada)), '');
    END IF;
    IF NEW.tipo_match IS NOT NULL THEN
        NEW.tipo_match := NULLIF(lower(btrim(NEW.tipo_match)), '');
    END IF;
    IF NEW.canal_publicitario IS NOT NULL THEN
        NEW.canal_publicitario := NULLIF(btrim(NEW.canal_publicitario), '');
    END IF;
    IF NEW.campana_publicitaria IS NOT NULL THEN
        NEW.campana_publicitaria := NULLIF(btrim(NEW.campana_publicitaria), '');
    END IF;
    IF NEW.adset IS NOT NULL THEN
        NEW.adset := NULLIF(btrim(NEW.adset), '');
    END IF;
    IF NEW.anuncio IS NOT NULL THEN
        NEW.anuncio := NULLIF(btrim(NEW.anuncio), '');
    END IF;
    IF NEW.mensaje_id IS NOT NULL THEN
        NEW.mensaje_id := NULLIF(btrim(NEW.mensaje_id), '');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_prospeccion_wa_atrib_reglas_set_org ON public.prospeccion_whatsapp_atribucion_reglas;
CREATE TRIGGER t_prospeccion_wa_atrib_reglas_set_org
BEFORE INSERT ON public.prospeccion_whatsapp_atribucion_reglas
FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_prospeccion_wa_atrib_reglas_touch ON public.prospeccion_whatsapp_atribucion_reglas;
CREATE TRIGGER t_prospeccion_wa_atrib_reglas_touch
BEFORE UPDATE ON public.prospeccion_whatsapp_atribucion_reglas
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS t_prospeccion_wa_atrib_reglas_normalize ON public.prospeccion_whatsapp_atribucion_reglas;
CREATE TRIGGER t_prospeccion_wa_atrib_reglas_normalize
BEFORE INSERT OR UPDATE ON public.prospeccion_whatsapp_atribucion_reglas
FOR EACH ROW EXECUTE FUNCTION public.tg_prospeccion_whatsapp_atribucion_reglas_normalize();

DROP TRIGGER IF EXISTS t_prospeccion_wa_atrib_eventos_set_org ON public.prospeccion_whatsapp_atribucion_eventos;
CREATE TRIGGER t_prospeccion_wa_atrib_eventos_set_org
BEFORE INSERT ON public.prospeccion_whatsapp_atribucion_eventos
FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_prospeccion_wa_atrib_eventos_normalize ON public.prospeccion_whatsapp_atribucion_eventos;
CREATE TRIGGER t_prospeccion_wa_atrib_eventos_normalize
BEFORE INSERT ON public.prospeccion_whatsapp_atribucion_eventos
FOR EACH ROW EXECUTE FUNCTION public.tg_prospeccion_whatsapp_atribucion_eventos_normalize();

ALTER TABLE public.prospeccion_whatsapp_atribucion_reglas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccion_whatsapp_atribucion_eventos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_whatsapp_atribucion_reglas'
          AND policyname = 'prospeccion_wa_atrib_reglas_admin_all'
    ) THEN
        CREATE POLICY prospeccion_wa_atrib_reglas_admin_all
        ON public.prospeccion_whatsapp_atribucion_reglas
        TO authenticated
        USING (
            public.es_admin(auth.uid())
            AND organizacion_id = public.usuario_organizacion_id(auth.uid())
        )
        WITH CHECK (
            public.es_admin(auth.uid())
            AND organizacion_id = public.usuario_organizacion_id(auth.uid())
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_whatsapp_atribucion_reglas'
          AND policyname = 'prospeccion_wa_atrib_reglas_member_org'
    ) THEN
        CREATE POLICY prospeccion_wa_atrib_reglas_member_org
        ON public.prospeccion_whatsapp_atribucion_reglas
        TO authenticated
        USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
        WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_whatsapp_atribucion_eventos'
          AND policyname = 'prospeccion_wa_atrib_eventos_admin_all'
    ) THEN
        CREATE POLICY prospeccion_wa_atrib_eventos_admin_all
        ON public.prospeccion_whatsapp_atribucion_eventos
        TO authenticated
        USING (
            public.es_admin(auth.uid())
            AND organizacion_id = public.usuario_organizacion_id(auth.uid())
        )
        WITH CHECK (
            public.es_admin(auth.uid())
            AND organizacion_id = public.usuario_organizacion_id(auth.uid())
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_whatsapp_atribucion_eventos'
          AND policyname = 'prospeccion_wa_atrib_eventos_member_org'
    ) THEN
        CREATE POLICY prospeccion_wa_atrib_eventos_member_org
        ON public.prospeccion_whatsapp_atribucion_eventos
        TO authenticated
        USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
        WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));
    END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.prospeccion_whatsapp_atribucion_reglas TO authenticated;
GRANT SELECT ON TABLE public.prospeccion_whatsapp_atribucion_eventos TO authenticated;

COMMENT ON TABLE public.prospeccion_whatsapp_atribucion_reglas IS
'Reglas por tenant para atribuir conversaciones entrantes de WhatsApp a campañas publicitarias por frase.';

COMMENT ON TABLE public.prospeccion_whatsapp_atribucion_eventos IS
'Eventos inmutables de atribución aplicada en WhatsApp; uno por conversación para evitar duplicados.';
