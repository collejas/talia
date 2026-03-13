BEGIN;

CREATE TABLE IF NOT EXISTS public.web_booking_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    booking_session_id text NOT NULL,
    contacto_id uuid,
    campana_id uuid,
    template_id uuid,
    envio_id uuid,
    calendar_booking_id uuid,
    source text,
    landing_url text,
    referrer text,
    ip text,
    user_agent text,
    accept_language text,
    country_code text,
    country_name text,
    cve_ent text,
    nom_ent text,
    cve_mun text,
    nom_mun text,
    cvegeo text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    booked_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT web_booking_sessions_pkey PRIMARY KEY (id),
    CONSTRAINT web_booking_sessions_org_session_key UNIQUE (organizacion_id, booking_session_id),
    CONSTRAINT web_booking_sessions_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT web_booking_sessions_contacto_id_fkey
        FOREIGN KEY (contacto_id) REFERENCES public.contactos(id) ON DELETE SET NULL,
    CONSTRAINT web_booking_sessions_calendar_booking_id_fkey
        FOREIGN KEY (calendar_booking_id) REFERENCES public.calendar_bookings(id) ON DELETE SET NULL
);

ALTER TABLE ONLY public.web_booking_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.web_booking_sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.web_booking_sessions IS
'Sesiones de agenda publica para atribuir visitas y citas confirmadas por campana/template/envio.';

CREATE INDEX IF NOT EXISTS web_booking_sessions_org_opened_idx
    ON public.web_booking_sessions USING btree (organizacion_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS web_booking_sessions_org_campaign_template_idx
    ON public.web_booking_sessions USING btree (organizacion_id, campana_id, template_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS web_booking_sessions_calendar_booking_idx
    ON public.web_booking_sessions USING btree (calendar_booking_id);

CREATE INDEX IF NOT EXISTS web_booking_sessions_org_utm_idx
    ON public.web_booking_sessions USING btree (organizacion_id, utm_source, utm_medium, utm_campaign);

CREATE INDEX IF NOT EXISTS web_booking_sessions_metadata_gin_idx
    ON public.web_booking_sessions USING gin (metadata);

DROP TRIGGER IF EXISTS t_web_booking_sessions_set_org ON public.web_booking_sessions;
CREATE TRIGGER t_web_booking_sessions_set_org
BEFORE INSERT ON public.web_booking_sessions
FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_web_booking_sessions_touch ON public.web_booking_sessions;
CREATE TRIGGER t_web_booking_sessions_touch
BEFORE UPDATE ON public.web_booking_sessions
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'web_booking_sessions'
          AND policyname = 'web_booking_sessions_admin_all'
    ) THEN
        CREATE POLICY web_booking_sessions_admin_all
        ON public.web_booking_sessions
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
          AND tablename = 'web_booking_sessions'
          AND policyname = 'web_booking_sessions_member_org'
    ) THEN
        CREATE POLICY web_booking_sessions_member_org
        ON public.web_booking_sessions
        TO authenticated
        USING (
            organizacion_id = public.usuario_organizacion_id(auth.uid())
        )
        WITH CHECK (
            organizacion_id = public.usuario_organizacion_id(auth.uid())
        );
    END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.web_booking_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.web_booking_sessions TO service_role;

COMMIT;
