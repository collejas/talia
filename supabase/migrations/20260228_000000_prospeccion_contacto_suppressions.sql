CREATE TABLE IF NOT EXISTS public.prospeccion_contacto_suppressions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    canal text NOT NULL,
    prospecto_id uuid,
    email text,
    phone_e164 text,
    motivo text,
    origen text DEFAULT 'manual'::text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_por uuid DEFAULT auth.uid(),
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT prospeccion_contacto_suppressions_canal_check
        CHECK (canal = ANY (ARRAY['correo'::text, 'whatsapp'::text, 'llamada'::text, 'all'::text])),
    CONSTRAINT prospeccion_contacto_suppressions_phone_e164_check
        CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[0-9]{7,15}$'::text),
    CONSTRAINT prospeccion_contacto_suppressions_target_required
        CHECK (prospecto_id IS NOT NULL OR email IS NOT NULL OR phone_e164 IS NOT NULL)
);

ALTER TABLE ONLY public.prospeccion_contacto_suppressions FORCE ROW LEVEL SECURITY;

ALTER TABLE ONLY public.prospeccion_contacto_suppressions
    ADD CONSTRAINT prospeccion_contacto_suppressions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.prospeccion_contacto_suppressions
    ADD CONSTRAINT prospeccion_contacto_suppressions_org_fkey
    FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.prospeccion_contacto_suppressions
    ADD CONSTRAINT prospeccion_contacto_suppressions_prospecto_org_fkey
    FOREIGN KEY (organizacion_id, prospecto_id)
    REFERENCES public.prospeccion_prospectos(organizacion_id, id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS prospeccion_contacto_suppressions_org_idx
    ON public.prospeccion_contacto_suppressions USING btree (organizacion_id, activo, canal, creado_en DESC);

CREATE INDEX IF NOT EXISTS prospeccion_contacto_suppressions_prospecto_idx
    ON public.prospeccion_contacto_suppressions USING btree (organizacion_id, prospecto_id, activo);

CREATE INDEX IF NOT EXISTS prospeccion_contacto_suppressions_email_idx
    ON public.prospeccion_contacto_suppressions USING btree (organizacion_id, email, activo);

CREATE INDEX IF NOT EXISTS prospeccion_contacto_suppressions_phone_idx
    ON public.prospeccion_contacto_suppressions USING btree (organizacion_id, phone_e164, activo);

CREATE OR REPLACE FUNCTION public.tg_prospeccion_contacto_suppressions_normalize()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.email IS NOT NULL THEN
        NEW.email := NULLIF(lower(btrim(NEW.email)), '');
    END IF;
    IF NEW.phone_e164 IS NOT NULL THEN
        NEW.phone_e164 := NULLIF(btrim(NEW.phone_e164), '');
    END IF;
    IF NEW.motivo IS NOT NULL THEN
        NEW.motivo := NULLIF(btrim(NEW.motivo), '');
    END IF;
    IF NEW.origen IS NOT NULL THEN
        NEW.origen := NULLIF(btrim(NEW.origen), '');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_prospeccion_contacto_suppressions_set_org ON public.prospeccion_contacto_suppressions;
CREATE TRIGGER t_prospeccion_contacto_suppressions_set_org
BEFORE INSERT ON public.prospeccion_contacto_suppressions
FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_prospeccion_contacto_suppressions_touch ON public.prospeccion_contacto_suppressions;
CREATE TRIGGER t_prospeccion_contacto_suppressions_touch
BEFORE UPDATE ON public.prospeccion_contacto_suppressions
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS t_prospeccion_contacto_suppressions_normalize ON public.prospeccion_contacto_suppressions;
CREATE TRIGGER t_prospeccion_contacto_suppressions_normalize
BEFORE INSERT OR UPDATE ON public.prospeccion_contacto_suppressions
FOR EACH ROW EXECUTE FUNCTION public.tg_prospeccion_contacto_suppressions_normalize();

ALTER TABLE public.prospeccion_contacto_suppressions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_contacto_suppressions'
          AND policyname = 'prospeccion_contacto_suppressions_admin_all'
    ) THEN
        CREATE POLICY prospeccion_contacto_suppressions_admin_all
        ON public.prospeccion_contacto_suppressions
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
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_contacto_suppressions'
          AND policyname = 'prospeccion_contacto_suppressions_member_org'
    ) THEN
        CREATE POLICY prospeccion_contacto_suppressions_member_org
        ON public.prospeccion_contacto_suppressions
        TO authenticated
        USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
        WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));
    END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.prospeccion_contacto_suppressions TO authenticated;
