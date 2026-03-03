BEGIN;

CREATE TABLE IF NOT EXISTS public.web_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organizacion_id uuid NOT NULL,
    session_id text NOT NULL,
    visitor_id text,
    contacto_id uuid,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    visit_count integer DEFAULT 1 NOT NULL,
    ip text,
    user_agent text,
    device_type text,
    country_code text,
    country_name text,
    cve_ent text,
    nom_ent text,
    cve_mun text,
    nom_mun text,
    cvegeo text,
    landing_url text,
    referrer text,
    referrer_host text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text,
    eid uuid,
    cid uuid,
    tid uuid,
    source_class text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT web_sessions_pkey PRIMARY KEY (id),
    CONSTRAINT web_sessions_org_session_key UNIQUE (organizacion_id, session_id),
    CONSTRAINT web_sessions_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT web_sessions_contacto_id_fkey
        FOREIGN KEY (contacto_id) REFERENCES public.contactos(id) ON DELETE SET NULL
);

ALTER TABLE ONLY public.web_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.web_sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.web_sessions IS
'Sesiones web first-party por tenant para atribucion de trafico y conversion.';

CREATE INDEX IF NOT EXISTS web_sessions_org_last_seen_idx
    ON public.web_sessions USING btree (organizacion_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS web_sessions_org_source_class_idx
    ON public.web_sessions USING btree (organizacion_id, source_class, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS web_sessions_org_utm_idx
    ON public.web_sessions USING btree (organizacion_id, utm_source, utm_medium, utm_campaign);

CREATE INDEX IF NOT EXISTS web_sessions_org_geo_idx
    ON public.web_sessions USING btree (organizacion_id, cve_ent, cvegeo);

CREATE INDEX IF NOT EXISTS web_sessions_org_eid_idx
    ON public.web_sessions USING btree (organizacion_id, eid);

CREATE INDEX IF NOT EXISTS web_sessions_metadata_gin_idx
    ON public.web_sessions USING gin (metadata);

DROP TRIGGER IF EXISTS t_web_sessions_set_org ON public.web_sessions;
CREATE TRIGGER t_web_sessions_set_org
BEFORE INSERT ON public.web_sessions
FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS t_web_sessions_touch ON public.web_sessions;
CREATE TRIGGER t_web_sessions_touch
BEFORE UPDATE ON public.web_sessions
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'web_sessions'
          AND policyname = 'web_sessions_admin_all'
    ) THEN
        CREATE POLICY web_sessions_admin_all
        ON public.web_sessions
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
          AND tablename = 'web_sessions'
          AND policyname = 'web_sessions_member_org'
    ) THEN
        CREATE POLICY web_sessions_member_org
        ON public.web_sessions
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

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.web_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.web_sessions TO service_role;

CREATE OR REPLACE FUNCTION public.record_web_session(
    p_session_id text,
    p_landing_url text DEFAULT NULL::text,
    p_referrer text DEFAULT NULL::text,
    p_ip text DEFAULT NULL::text,
    p_user_agent text DEFAULT NULL::text,
    p_device_type text DEFAULT NULL::text,
    p_country_code text DEFAULT NULL::text,
    p_country_name text DEFAULT NULL::text,
    p_cve_ent text DEFAULT NULL::text,
    p_nom_ent text DEFAULT NULL::text,
    p_cve_mun text DEFAULT NULL::text,
    p_nom_mun text DEFAULT NULL::text,
    p_cvegeo text DEFAULT NULL::text,
    p_utm_source text DEFAULT NULL::text,
    p_utm_medium text DEFAULT NULL::text,
    p_utm_campaign text DEFAULT NULL::text,
    p_utm_term text DEFAULT NULL::text,
    p_utm_content text DEFAULT NULL::text,
    p_eid uuid DEFAULT NULL::uuid,
    p_cid uuid DEFAULT NULL::uuid,
    p_tid uuid DEFAULT NULL::uuid,
    p_source_class text DEFAULT NULL::text,
    p_contacto_id uuid DEFAULT NULL::uuid,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_organizacion_id uuid DEFAULT NULL::uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_org uuid;
    v_session_id text;
    v_referrer text;
    v_landing_url text;
    v_referrer_host text;
    v_utm_source text;
    v_utm_medium text;
    v_utm_campaign text;
    v_utm_term text;
    v_utm_content text;
    v_source_class text;
    v_eid uuid := p_eid;
    v_cid uuid := p_cid;
    v_tid uuid := p_tid;
    v_session_uuid uuid;
BEGIN
    v_session_id := NULLIF(btrim(p_session_id), '');
    IF v_session_id IS NULL THEN
        RAISE EXCEPTION 'session_id requerido' USING ERRCODE = '22023';
    END IF;

    v_org := p_organizacion_id;
    IF v_org IS NULL THEN
        BEGIN
            v_org := public.usuario_organizacion_id(auth.uid());
        EXCEPTION
            WHEN others THEN
                v_org := NULL;
        END;
    END IF;
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'organizacion_id requerido (no se pudo inferir el tenant)'
            USING ERRCODE = '23514';
    END IF;

    v_referrer := NULLIF(btrim(p_referrer), '');
    v_landing_url := NULLIF(btrim(p_landing_url), '');
    v_utm_source := NULLIF(lower(btrim(p_utm_source)), '');
    v_utm_medium := NULLIF(lower(btrim(p_utm_medium)), '');
    v_utm_campaign := NULLIF(lower(btrim(p_utm_campaign)), '');
    v_utm_term := NULLIF(lower(btrim(p_utm_term)), '');
    v_utm_content := NULLIF(lower(btrim(p_utm_content)), '');

    IF v_landing_url IS NOT NULL THEN
        IF v_utm_source IS NULL THEN
            v_utm_source := NULLIF(lower(substring(v_landing_url FROM '(?:\\?|&)utm_source=([^&#]+)')), '');
        END IF;
        IF v_utm_medium IS NULL THEN
            v_utm_medium := NULLIF(lower(substring(v_landing_url FROM '(?:\\?|&)utm_medium=([^&#]+)')), '');
        END IF;
        IF v_utm_campaign IS NULL THEN
            v_utm_campaign := NULLIF(lower(substring(v_landing_url FROM '(?:\\?|&)utm_campaign=([^&#]+)')), '');
        END IF;
        IF v_utm_term IS NULL THEN
            v_utm_term := NULLIF(lower(substring(v_landing_url FROM '(?:\\?|&)utm_term=([^&#]+)')), '');
        END IF;
        IF v_utm_content IS NULL THEN
            v_utm_content := NULLIF(lower(substring(v_landing_url FROM '(?:\\?|&)utm_content=([^&#]+)')), '');
        END IF;
    END IF;

    IF v_eid IS NULL AND v_landing_url IS NOT NULL THEN
        BEGIN
            v_eid := NULLIF(substring(v_landing_url FROM '(?:\\?|&)(?:eid|envio_id)=([0-9a-fA-F-]{36})'), '')::uuid;
        EXCEPTION
            WHEN others THEN
                v_eid := NULL;
        END;
    END IF;

    IF v_cid IS NULL AND v_landing_url IS NOT NULL THEN
        BEGIN
            v_cid := NULLIF(substring(v_landing_url FROM '(?:\\?|&)cid=([0-9a-fA-F-]{36})'), '')::uuid;
        EXCEPTION
            WHEN others THEN
                v_cid := NULL;
        END;
    END IF;

    IF v_tid IS NULL AND v_landing_url IS NOT NULL THEN
        BEGIN
            v_tid := NULLIF(substring(v_landing_url FROM '(?:\\?|&)tid=([0-9a-fA-F-]{36})'), '')::uuid;
        EXCEPTION
            WHEN others THEN
                v_tid := NULL;
        END;
    END IF;

    v_referrer_host := NULL;
    IF v_referrer IS NOT NULL THEN
        v_referrer_host := NULLIF((regexp_match(v_referrer, '^(?:[a-z]+://)?([^/?#]+)'))[1], '');
        IF v_referrer_host IS NULL THEN
            v_referrer_host := NULLIF(v_referrer, '');
        END IF;
    END IF;

    v_source_class := NULLIF(lower(btrim(p_source_class)), '');
    IF v_source_class IS NULL THEN
        IF v_utm_source IS NOT NULL OR v_utm_medium IS NOT NULL OR v_utm_campaign IS NOT NULL THEN
            v_source_class := 'campaign';
        ELSIF v_referrer IS NULL THEN
            v_source_class := 'direct';
        ELSIF v_referrer ~* 'google\\.' THEN
            v_source_class := 'organic_search';
        ELSIF v_referrer ~* '(facebook|instagram|twitter|t\\.co|linkedin)\\.' THEN
            v_source_class := 'organic_social';
        ELSE
            v_source_class := 'referral';
        END IF;
    END IF;

    INSERT INTO public.web_sessions (
        organizacion_id,
        session_id,
        contacto_id,
        first_seen_at,
        last_seen_at,
        visit_count,
        ip,
        user_agent,
        device_type,
        country_code,
        country_name,
        cve_ent,
        nom_ent,
        cve_mun,
        nom_mun,
        cvegeo,
        landing_url,
        referrer,
        referrer_host,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        eid,
        cid,
        tid,
        source_class,
        metadata
    )
    VALUES (
        v_org,
        v_session_id,
        p_contacto_id,
        now(),
        now(),
        1,
        NULLIF(btrim(p_ip), ''),
        NULLIF(btrim(p_user_agent), ''),
        NULLIF(lower(btrim(p_device_type)), ''),
        NULLIF(upper(btrim(p_country_code)), ''),
        NULLIF(btrim(p_country_name), ''),
        NULLIF(LPAD(REGEXP_REPLACE(COALESCE(p_cve_ent, ''), '\\D', '', 'g'), 2, '0'), ''),
        NULLIF(btrim(p_nom_ent), ''),
        NULLIF(LPAD(REGEXP_REPLACE(COALESCE(p_cve_mun, ''), '\\D', '', 'g'), 3, '0'), ''),
        NULLIF(btrim(p_nom_mun), ''),
        NULLIF(LPAD(REGEXP_REPLACE(COALESCE(p_cvegeo, ''), '\\D', '', 'g'), 5, '0'), ''),
        v_landing_url,
        v_referrer,
        NULLIF(lower(v_referrer_host), ''),
        v_utm_source,
        v_utm_medium,
        v_utm_campaign,
        v_utm_term,
        v_utm_content,
        v_eid,
        v_cid,
        v_tid,
        v_source_class,
        COALESCE(p_metadata, '{}'::jsonb)
    )
    ON CONFLICT (organizacion_id, session_id) DO UPDATE
      SET contacto_id = COALESCE(EXCLUDED.contacto_id, public.web_sessions.contacto_id),
          last_seen_at = now(),
          visit_count = COALESCE(public.web_sessions.visit_count, 0) + 1,
          ip = COALESCE(EXCLUDED.ip, public.web_sessions.ip),
          user_agent = COALESCE(EXCLUDED.user_agent, public.web_sessions.user_agent),
          device_type = COALESCE(EXCLUDED.device_type, public.web_sessions.device_type),
          country_code = COALESCE(EXCLUDED.country_code, public.web_sessions.country_code),
          country_name = COALESCE(EXCLUDED.country_name, public.web_sessions.country_name),
          cve_ent = COALESCE(EXCLUDED.cve_ent, public.web_sessions.cve_ent),
          nom_ent = COALESCE(EXCLUDED.nom_ent, public.web_sessions.nom_ent),
          cve_mun = COALESCE(EXCLUDED.cve_mun, public.web_sessions.cve_mun),
          nom_mun = COALESCE(EXCLUDED.nom_mun, public.web_sessions.nom_mun),
          cvegeo = COALESCE(EXCLUDED.cvegeo, public.web_sessions.cvegeo),
          landing_url = COALESCE(EXCLUDED.landing_url, public.web_sessions.landing_url),
          referrer = COALESCE(EXCLUDED.referrer, public.web_sessions.referrer),
          referrer_host = COALESCE(EXCLUDED.referrer_host, public.web_sessions.referrer_host),
          utm_source = COALESCE(EXCLUDED.utm_source, public.web_sessions.utm_source),
          utm_medium = COALESCE(EXCLUDED.utm_medium, public.web_sessions.utm_medium),
          utm_campaign = COALESCE(EXCLUDED.utm_campaign, public.web_sessions.utm_campaign),
          utm_term = COALESCE(EXCLUDED.utm_term, public.web_sessions.utm_term),
          utm_content = COALESCE(EXCLUDED.utm_content, public.web_sessions.utm_content),
          eid = COALESCE(EXCLUDED.eid, public.web_sessions.eid),
          cid = COALESCE(EXCLUDED.cid, public.web_sessions.cid),
          tid = COALESCE(EXCLUDED.tid, public.web_sessions.tid),
          source_class = COALESCE(EXCLUDED.source_class, public.web_sessions.source_class),
          metadata = COALESCE(public.web_sessions.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
          actualizado_en = now()
    RETURNING id INTO v_session_uuid;

    RETURN v_session_uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.record_web_session(
    text, text, text, text, text, text, text, text, text, text, text, text, text,
    text, text, text, text, text, uuid, uuid, uuid, text, uuid, jsonb, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_web_session(
    text, text, text, text, text, text, text, text, text, text, text, text, text,
    text, text, text, text, text, uuid, uuid, uuid, text, uuid, jsonb, uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.record_web_session(
    text, text, text, text, text, text, text, text, text, text, text, text, text,
    text, text, text, text, text, uuid, uuid, uuid, text, uuid, jsonb, uuid
) IS 'Registra/actualiza sesion web first-party y normaliza fuente/utm por tenant.';

COMMIT;
