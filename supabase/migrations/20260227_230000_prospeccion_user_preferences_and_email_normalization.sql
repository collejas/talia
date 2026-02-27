-- Preferencias de UI por usuario para prospección (tabla de prospectos)
CREATE TABLE IF NOT EXISTS public.prospeccion_user_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    usuario_id uuid DEFAULT auth.uid() NOT NULL,
    modulo text NOT NULL,
    clave text NOT NULL,
    valor jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.prospeccion_user_preferences FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.prospeccion_user_preferences IS 'Preferencias de interfaz por usuario para módulos de prospección.';

ALTER TABLE ONLY public.prospeccion_user_preferences
    ADD CONSTRAINT prospeccion_user_preferences_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.prospeccion_user_preferences
    ADD CONSTRAINT prospeccion_user_preferences_org_fkey FOREIGN KEY (organizacion_id)
    REFERENCES public.organizaciones(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.prospeccion_user_preferences
    ADD CONSTRAINT prospeccion_user_preferences_user_fkey FOREIGN KEY (usuario_id)
    REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_user_preferences_org_user_mod_key
    ON public.prospeccion_user_preferences USING btree (organizacion_id, usuario_id, modulo, clave);

CREATE INDEX IF NOT EXISTS prospeccion_user_preferences_org_idx
    ON public.prospeccion_user_preferences USING btree (organizacion_id, modulo, actualizado_en DESC);

DROP TRIGGER IF EXISTS t_prospeccion_user_preferences_set_org ON public.prospeccion_user_preferences;
CREATE TRIGGER t_prospeccion_user_preferences_set_org
BEFORE INSERT ON public.prospeccion_user_preferences
FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_prospeccion_user_preferences_touch ON public.prospeccion_user_preferences;
CREATE TRIGGER t_prospeccion_user_preferences_touch
BEFORE UPDATE ON public.prospeccion_user_preferences
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

ALTER TABLE public.prospeccion_user_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_user_preferences'
          AND policyname = 'prospeccion_user_preferences_admin_all'
    ) THEN
        CREATE POLICY prospeccion_user_preferences_admin_all
        ON public.prospeccion_user_preferences
        TO authenticated
        USING (
            public.es_admin(auth.uid())
            AND organizacion_id = public.usuario_organizacion_id(auth.uid())
            AND usuario_id = auth.uid()
        )
        WITH CHECK (
            public.es_admin(auth.uid())
            AND organizacion_id = public.usuario_organizacion_id(auth.uid())
            AND usuario_id = auth.uid()
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'prospeccion_user_preferences'
          AND policyname = 'prospeccion_user_preferences_member_own'
    ) THEN
        CREATE POLICY prospeccion_user_preferences_member_own
        ON public.prospeccion_user_preferences
        TO authenticated
        USING (
            organizacion_id = public.usuario_organizacion_id(auth.uid())
            AND usuario_id = auth.uid()
        )
        WITH CHECK (
            organizacion_id = public.usuario_organizacion_id(auth.uid())
            AND usuario_id = auth.uid()
        );
    END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.prospeccion_user_preferences TO authenticated;

-- Normalización de correo en persistencia de prospectos (insert/update)
CREATE OR REPLACE FUNCTION public.tg_prospecto_normalize_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.email IS NOT NULL THEN
        NEW.email := NULLIF(lower(btrim(NEW.email)), '');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_prospeccion_prospectos_normalize_email ON public.prospeccion_prospectos;
CREATE TRIGGER t_prospeccion_prospectos_normalize_email
BEFORE INSERT OR UPDATE OF email ON public.prospeccion_prospectos
FOR EACH ROW EXECUTE FUNCTION public.tg_prospecto_normalize_email();

UPDATE public.prospeccion_prospectos
SET email = lower(btrim(email))
WHERE email IS NOT NULL
  AND email <> lower(btrim(email));
