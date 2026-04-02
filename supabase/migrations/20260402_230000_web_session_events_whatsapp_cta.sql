BEGIN;

CREATE TABLE IF NOT EXISTS public.web_session_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    session_id text NOT NULL,
    event_type text NOT NULL,
    cta_id text,
    hero_variant text,
    location_href text,
    referrer text,
    user_agent text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT web_session_events_pkey PRIMARY KEY (id),
    CONSTRAINT web_session_events_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE
);

ALTER TABLE ONLY public.web_session_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.web_session_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS web_session_events_org_created_idx
    ON public.web_session_events USING btree (organizacion_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS web_session_events_org_type_created_idx
    ON public.web_session_events USING btree (organizacion_id, event_type, creado_en DESC);

CREATE INDEX IF NOT EXISTS web_session_events_org_cta_idx
    ON public.web_session_events USING btree (organizacion_id, cta_id);

CREATE INDEX IF NOT EXISTS web_session_events_org_variant_idx
    ON public.web_session_events USING btree (organizacion_id, hero_variant);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'web_session_events'
          AND policyname = 'web_session_events_admin_all'
    ) THEN
        CREATE POLICY web_session_events_admin_all
        ON public.web_session_events
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
          AND tablename = 'web_session_events'
          AND policyname = 'web_session_events_member_org'
    ) THEN
        CREATE POLICY web_session_events_member_org
        ON public.web_session_events
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

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.web_session_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.web_session_events TO service_role;

COMMIT;
