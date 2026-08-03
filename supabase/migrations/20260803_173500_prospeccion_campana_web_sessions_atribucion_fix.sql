DROP FUNCTION IF EXISTS public.record_web_session(
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    uuid,
    uuid,
    uuid,
    text,
    uuid,
    jsonb,
    uuid
);

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
            v_tid := NULLIF(
                COALESCE(
                    substring(v_landing_url FROM '(?:\\?|&)(?:tid|template_id)=([0-9a-fA-F-]{36})'),
                    ''
                ),
                ''
            )::uuid;
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
        p_ip,
        p_user_agent,
        p_device_type,
        p_country_code,
        p_country_name,
        p_cve_ent,
        p_nom_ent,
        p_cve_mun,
        p_nom_mun,
        p_cvegeo,
        v_landing_url,
        v_referrer,
        v_referrer_host,
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
    ON CONFLICT (organizacion_id, session_id)
    DO UPDATE SET
        contacto_id = COALESCE(EXCLUDED.contacto_id, public.web_sessions.contacto_id),
        last_seen_at = now(),
        visit_count = public.web_sessions.visit_count + 1,
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
        updated_at = now()
    RETURNING id INTO v_session_uuid;

    RETURN v_session_uuid;
END;
$$;

DROP FUNCTION IF EXISTS public.prospeccion_envio_sesiones_utm(uuid[]);

CREATE OR REPLACE FUNCTION public.prospeccion_envio_sesiones_utm(
    p_envio_ids uuid[]
)
RETURNS TABLE (
    envio_id uuid,
    sesiones_utm bigint
)
LANGUAGE sql
STABLE
AS $$
WITH contexto_org AS (
    SELECT
      COALESCE(
        NULLIF((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
        public.usuario_organizacion_id(auth.uid())
      ) AS organizacion_id
),
targets AS (
    SELECT DISTINCT unnest(p_envio_ids) AS envio_id
),
sesion_signals AS (
    SELECT
        w.session_id,
        lower(COALESCE(NULLIF(btrim(w.utm_source), ''), substring(w.landing_url FROM '(?:\\?|&)utm_source=([^&#]+)'), '')) AS utm_source,
        lower(COALESCE(NULLIF(btrim(w.utm_medium), ''), substring(w.landing_url FROM '(?:\\?|&)utm_medium=([^&#]+)'), '')) AS utm_medium,
        COALESCE(
            w.eid,
            NULLIF(substring(w.landing_url FROM '(?:\\?|&)(?:eid|envio_id)=([0-9a-fA-F-]{36})'), '')::uuid
        ) AS envio_id,
        w.landing_url
    FROM public.web_sessions w
    CROSS JOIN contexto_org co
    WHERE w.organizacion_id = co.organizacion_id
      AND COALESCE(w.landing_url, '') <> ''
),
sesion_by_envio AS (
    SELECT
        envio_id,
        COUNT(DISTINCT session_id)::bigint AS sesiones
    FROM sesion_signals
    WHERE utm_source = 'prospeccion'
      AND utm_medium = 'email'
      AND envio_id IS NOT NULL
    GROUP BY envio_id
)
SELECT
    t.envio_id,
    COALESCE(s.sesiones, 0)::bigint AS sesiones_utm
FROM targets t
LEFT JOIN sesion_by_envio s ON s.envio_id = t.envio_id;
$$;

GRANT EXECUTE ON FUNCTION public.prospeccion_envio_sesiones_utm(uuid[]) TO authenticated;

DROP FUNCTION IF EXISTS public.prospeccion_campana_template_atribucion(uuid, integer);

CREATE OR REPLACE FUNCTION public.prospeccion_campana_template_atribucion(
    p_campana_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 200
)
RETURNS TABLE (
    campana_id uuid,
    campana_nombre text,
    canal text,
    template_id uuid,
    template_slug text,
    template_nombre text,
    envios_totales bigint,
    envios_enviados bigint,
    envios_entregados bigint,
    envios_fallidos bigint,
    envios_omitidos bigint,
    envios_respondidos bigint,
    brevo_aperturas bigint,
    brevo_clicks bigint,
    sesiones_utm bigint,
    tasa_entrega_pct numeric(5,2),
    tasa_respuesta_pct numeric(5,2),
    click_to_session_pct numeric(5,2)
)
LANGUAGE sql
STABLE
AS $$
WITH contexto_org AS (
    SELECT
      COALESCE(
        NULLIF((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
        public.usuario_organizacion_id(auth.uid())
      ) AS organizacion_id
),
envios_base AS (
    SELECT
        e.id AS envio_id,
        b.campana_id,
        b.organizacion_id,
        e.canal,
        lower(COALESCE(e.estado, 'pendiente')) AS estado,
        CASE
            WHEN COALESCE(e.payload->>'template_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                THEN (e.payload->>'template_id')::uuid
            ELSE NULL
        END AS template_uuid,
        lower(
            COALESCE(
                NULLIF(btrim(e.payload->'metadata'->>'template_slug'), ''),
                NULLIF(btrim(e.payload->>'template_slug'), '')
            )
        ) AS template_slug
    FROM public.prospeccion_contacto_envio e
    JOIN public.prospeccion_contacto_batch b ON b.id = e.batch_id
    CROSS JOIN contexto_org co
    WHERE e.organizacion_id = co.organizacion_id
      AND b.organizacion_id = co.organizacion_id
      AND (p_campana_id IS NULL OR b.campana_id = p_campana_id)
),
respuesta_por_envio AS (
    SELECT
        l.envio_id,
        BOOL_OR(
            lower(COALESCE(l.accion, l.detalle->>'action', l.estado, '')) = ANY (
                ARRAY['respuesta', 'respondio', 'respondido', 'reply', 'reply_inbound']
            )
            OR lower(COALESCE(l.detalle->>'direction', '')) = ANY (ARRAY['inbound', 'incoming'])
            OR COALESCE(l.detalle->>'respondio', '') = 'true'
            OR COALESCE(l.detalle->>'respuesta', '') <> ''
        ) AS respondio
    FROM public.prospeccion_contactos_log l
    CROSS JOIN contexto_org co
    WHERE l.organizacion_id = co.organizacion_id
      AND l.envio_id IS NOT NULL
    GROUP BY l.envio_id
),
brevo_por_envio AS (
    SELECT
        l.envio_id,
        CASE
            WHEN COUNT(*) FILTER (
                WHERE lower(COALESCE(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) = 'unique_opened'
            ) > 0 THEN 1
            WHEN COUNT(*) FILTER (
                WHERE lower(COALESCE(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) = 'opened'
            ) > 0 THEN 1
            ELSE 0
        END::bigint AS aperturas,
        CASE
            WHEN COUNT(*) FILTER (
                WHERE lower(COALESCE(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) = 'unique_click'
            ) > 0 THEN 1
            WHEN COUNT(*) FILTER (
                WHERE lower(COALESCE(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) = 'click'
            ) > 0 THEN 1
            ELSE 0
        END::bigint AS clicks
    FROM public.prospeccion_contactos_log l
    CROSS JOIN contexto_org co
    WHERE l.organizacion_id = co.organizacion_id
      AND l.envio_id IS NOT NULL
      AND l.canal = 'correo'
    GROUP BY l.envio_id
),
sesion_signals AS (
    SELECT
        w.session_id,
        lower(COALESCE(
            NULLIF(btrim(w.utm_source), ''),
            substring(w.landing_url FROM '(?:\\?|&)utm_source=([^&#]+)'),
            ''
        )) AS utm_source,
        lower(COALESCE(
            NULLIF(btrim(w.utm_medium), ''),
            substring(w.landing_url FROM '(?:\\?|&)utm_medium=([^&#]+)'),
            ''
        )) AS utm_medium,
        lower(COALESCE(
            NULLIF(btrim(w.utm_campaign), ''),
            substring(w.landing_url FROM '(?:\\?|&)utm_campaign=([^&#]+)'),
            ''
        )) AS utm_campaign,
        COALESCE(
            w.eid,
            NULLIF(substring(w.landing_url FROM '(?:\\?|&)(?:eid|envio_id)=([0-9a-fA-F-]{36})'), '')::uuid
        ) AS envio_id,
        COALESCE(
            w.tid,
            NULLIF(substring(w.landing_url FROM '(?:\\?|&)(?:tid|template_id)=([0-9a-fA-F-]{36})'), '')::uuid
        ) AS template_id
    FROM public.web_sessions w
    CROSS JOIN contexto_org co
    WHERE w.organizacion_id = co.organizacion_id
      AND (
        COALESCE(w.landing_url, '') <> ''
        OR COALESCE(w.utm_source, '') <> ''
        OR COALESCE(w.utm_medium, '') <> ''
        OR COALESCE(w.utm_campaign, '') <> ''
        OR w.eid IS NOT NULL
        OR w.tid IS NOT NULL
    )
),
sesion_por_envio AS (
    SELECT
        envio_id,
        COUNT(DISTINCT session_id)::bigint AS sesiones
    FROM sesion_signals
    WHERE utm_source = 'prospeccion'
      AND utm_medium = 'email'
      AND envio_id IS NOT NULL
    GROUP BY envio_id
),
sesion_por_whatsapp AS (
    SELECT
        w.campana_id,
        w.template_id,
        COUNT(DISTINCT w.session_id)::bigint AS sesiones
    FROM sesion_signals w
    WHERE w.utm_source = 'prospeccion'
      AND w.utm_medium = 'whatsapp_cta'
      AND w.template_id IS NOT NULL
      AND NULLIF(w.utm_campaign, '') IS NOT NULL
    GROUP BY w.campana_id, w.template_id
),
sesion_atribucion_email AS (
    SELECT
        eb.campana_id,
        c.nombre AS campana_nombre,
        eb.canal,
        eb.template_uuid AS template_id,
        COALESCE(lower(t.slug), eb.template_slug) AS template_slug,
        COALESCE(t.nombre, COALESCE(t.slug, eb.template_slug), 'Plantilla sin nombre') AS template_nombre,
        eb.twilio_content_sid,
        COALESCE(SUM(se.sesiones), 0)::bigint AS sesiones
    FROM envios_base eb
    LEFT JOIN public.campanas c ON c.id = eb.campana_id
    LEFT JOIN public.prospeccion_contacto_templates t
      ON t.organizacion_id = eb.organizacion_id
     AND t.id = eb.template_uuid
    LEFT JOIN sesion_por_envio se ON se.envio_id = eb.envio_id
    WHERE eb.canal = 'correo'
    GROUP BY
      eb.campana_id,
      c.nombre,
      eb.canal,
      eb.template_uuid,
      COALESCE(lower(t.slug), eb.template_slug),
      COALESCE(t.nombre, COALESCE(t.slug, eb.template_slug), 'Plantilla sin nombre'),
      eb.twilio_content_sid
),
sesion_atribucion_whatsapp AS (
    SELECT
        eb.campana_id,
        c.nombre AS campana_nombre,
        eb.canal,
        eb.template_uuid AS template_id,
        COALESCE(lower(t.slug), eb.template_slug) AS template_slug,
        COALESCE(t.nombre, COALESCE(t.slug, eb.template_slug), 'Plantilla sin nombre') AS template_nombre,
        eb.twilio_content_sid,
        COALESCE(SUM(spw.sesiones), 0)::bigint AS sesiones
    FROM envios_base eb
    LEFT JOIN public.campanas c ON c.id = eb.campana_id
    LEFT JOIN public.prospeccion_contacto_templates t
      ON t.organizacion_id = eb.organizacion_id
     AND t.id = eb.template_uuid
    LEFT JOIN sesion_por_whatsapp spw
      ON spw.campana_id = eb.campana_id
     AND spw.template_id IS NOT DISTINCT FROM eb.template_uuid
    WHERE eb.canal = 'whatsapp'
    GROUP BY
      eb.campana_id,
      c.nombre,
      eb.canal,
      eb.template_uuid,
      COALESCE(lower(t.slug), eb.template_slug),
      COALESCE(t.nombre, COALESCE(t.slug, eb.template_slug), 'Plantilla sin nombre'),
      eb.twilio_content_sid
),
sesion_atribucion AS (
    SELECT * FROM sesion_atribucion_email
    UNION ALL
    SELECT * FROM sesion_atribucion_whatsapp
),
agg_envios AS (
    SELECT
        eb.campana_id,
        c.nombre AS campana_nombre,
        eb.canal,
        eb.template_uuid AS template_id,
        COALESCE(lower(t.slug), eb.template_slug) AS template_slug,
        COALESCE(t.nombre, COALESCE(t.slug, eb.template_slug), 'Plantilla sin nombre') AS template_nombre,
        eb.twilio_content_sid,
        COUNT(*)::bigint AS envios_totales,
        COUNT(*) FILTER (WHERE eb.estado IN ('enviado', 'entregado', 'leido', 'completado', 'respondido'))::bigint AS envios_enviados,
        COUNT(*) FILTER (WHERE eb.estado IN ('entregado', 'leido', 'completado', 'respondido'))::bigint AS envios_entregados,
        COUNT(*) FILTER (WHERE eb.estado IN ('fallido', 'error', 'failed', 'undelivered'))::bigint AS envios_fallidos,
        COUNT(*) FILTER (WHERE eb.estado = 'omitido')::bigint AS envios_omitidos,
        COUNT(*) FILTER (WHERE COALESCE(r.respondio, FALSE))::bigint AS envios_respondidos,
        COALESCE(SUM(bp.aperturas), 0)::bigint AS brevo_aperturas,
        COALESCE(SUM(bp.clicks), 0)::bigint AS brevo_clicks
    FROM envios_base eb
    LEFT JOIN public.campanas c ON c.id = eb.campana_id
    LEFT JOIN public.prospeccion_contacto_templates t
      ON t.organizacion_id = eb.organizacion_id
     AND t.id = eb.template_uuid
    LEFT JOIN respuesta_por_envio r ON r.envio_id = eb.envio_id
    LEFT JOIN brevo_por_envio bp ON bp.envio_id = eb.envio_id
    GROUP BY
      eb.campana_id,
      c.nombre,
      eb.canal,
      eb.template_uuid,
      COALESCE(lower(t.slug), eb.template_slug),
      COALESCE(t.nombre, COALESCE(t.slug, eb.template_slug), 'Plantilla sin nombre'),
      eb.twilio_content_sid
)
SELECT
    a.campana_id,
    a.campana_nombre,
    a.canal,
    a.template_id,
    a.template_slug,
    a.template_nombre,
    a.twilio_content_sid,
    a.envios_totales,
    a.envios_enviados,
    a.envios_entregados,
    a.envios_fallidos,
    a.envios_omitidos,
    a.envios_respondidos,
    a.brevo_aperturas,
    a.brevo_clicks,
    COALESCE(sa.sesiones, 0)::bigint AS sesiones_utm,
    CASE
        WHEN a.envios_totales = 0 THEN 0
        ELSE ROUND((a.envios_entregados::numeric * 100.0) / a.envios_totales::numeric, 2)
    END AS tasa_entrega_pct,
    CASE
        WHEN a.envios_totales = 0 THEN 0
        ELSE ROUND((a.envios_respondidos::numeric * 100.0) / a.envios_totales::numeric, 2)
    END AS tasa_respuesta_pct,
    CASE
        WHEN COALESCE(sa.sesiones, 0) = 0 THEN 0
        ELSE ROUND((a.brevo_clicks::numeric * 100.0) / sa.sesiones::numeric, 2)
    END AS click_to_session_pct
FROM agg_envios a
LEFT JOIN sesion_atribucion sa
  ON sa.campana_id IS NOT DISTINCT FROM a.campana_id
 AND sa.canal IS NOT DISTINCT FROM a.canal
 AND sa.template_id IS NOT DISTINCT FROM a.template_id
 AND sa.template_slug IS NOT DISTINCT FROM a.template_slug
 AND sa.twilio_content_sid IS NOT DISTINCT FROM a.twilio_content_sid
ORDER BY a.envios_totales DESC, a.campana_nombre NULLS LAST, a.template_nombre, a.twilio_content_sid NULLS LAST
LIMIT GREATEST(1, COALESCE(p_limit, 200))
OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.prospeccion_campana_template_atribucion(uuid, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.prospeccion_campana_template_atribucion_rango(uuid, integer, timestamptz, timestamptz, integer);

CREATE OR REPLACE FUNCTION public.prospeccion_campana_template_atribucion_rango(
    p_campana_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 200,
    p_date_from timestamptz DEFAULT NULL,
    p_date_to timestamptz DEFAULT NULL,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    campana_id uuid,
    campana_nombre text,
    canal text,
    template_id uuid,
    template_slug text,
    template_nombre text,
    twilio_content_sid text,
    envios_totales bigint,
    envios_enviados bigint,
    envios_entregados bigint,
    envios_fallidos bigint,
    envios_omitidos bigint,
    envios_respondidos bigint,
    brevo_aperturas bigint,
    brevo_clicks bigint,
    sesiones_utm bigint,
    tasa_entrega_pct numeric(5,2),
    tasa_respuesta_pct numeric(5,2),
    click_to_session_pct numeric(5,2)
)
LANGUAGE sql
STABLE
AS $$
WITH contexto_org AS (
    SELECT
      COALESCE(
        NULLIF((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
        public.usuario_organizacion_id(auth.uid())
      ) AS organizacion_id
),
envios_base AS (
    SELECT
        e.id AS envio_id,
        b.campana_id,
        b.organizacion_id,
        e.canal,
        lower(COALESCE(e.estado, 'pendiente')) AS estado,
        CASE
            WHEN COALESCE(e.payload->>'template_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                THEN (e.payload->>'template_id')::uuid
            ELSE NULL
        END AS template_uuid,
        lower(
            COALESCE(
                NULLIF(btrim(e.payload->'metadata'->>'template_slug'), ''),
                NULLIF(btrim(e.payload->>'template_slug'), '')
            )
        ) AS template_slug,
        NULLIF(
            btrim(
                COALESCE(
                    e.detalle->>'template_sid',
                    e.payload->'metadata'->>'template_sid',
                    e.payload->>'template_sid'
                )
            ),
            ''
        ) AS twilio_content_sid,
        COALESCE(e.procesado_en, e.creado_en, e.programado_en) AS event_ts
    FROM public.prospeccion_contacto_envio e
    JOIN public.prospeccion_contacto_batch b ON b.id = e.batch_id
    CROSS JOIN contexto_org co
    WHERE e.organizacion_id = co.organizacion_id
      AND b.organizacion_id = co.organizacion_id
      AND (p_campana_id IS NULL OR b.campana_id = p_campana_id)
      AND (p_date_from IS NULL OR COALESCE(e.procesado_en, e.creado_en, e.programado_en) >= p_date_from)
      AND (p_date_to IS NULL OR COALESCE(e.procesado_en, e.creado_en, e.programado_en) <= p_date_to)
),
respuesta_por_envio AS (
    SELECT
        l.envio_id,
        BOOL_OR(
            lower(COALESCE(l.accion, l.detalle->>'action', l.estado, '')) = ANY (
                ARRAY['respuesta', 'respondio', 'respondido', 'reply', 'reply_inbound']
            )
            OR lower(COALESCE(l.detalle->>'direction', '')) = ANY (ARRAY['inbound', 'incoming'])
            OR COALESCE(l.detalle->>'respondio', '') = 'true'
            OR COALESCE(l.detalle->>'respuesta', '') <> ''
        ) AS respondio
    FROM public.prospeccion_contactos_log l
    CROSS JOIN contexto_org co
    WHERE l.organizacion_id = co.organizacion_id
      AND l.envio_id IS NOT NULL
    GROUP BY l.envio_id
),
brevo_por_envio AS (
    SELECT
        l.envio_id,
        CASE
            WHEN COUNT(*) FILTER (
                WHERE lower(COALESCE(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) = 'unique_opened'
            ) > 0 THEN 1
            WHEN COUNT(*) FILTER (
                WHERE lower(COALESCE(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) = 'opened'
            ) > 0 THEN 1
            ELSE 0
        END::bigint AS aperturas,
        CASE
            WHEN COUNT(*) FILTER (
                WHERE lower(COALESCE(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) = 'unique_click'
            ) > 0 THEN 1
            WHEN COUNT(*) FILTER (
                WHERE lower(COALESCE(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) = 'click'
            ) > 0 THEN 1
            ELSE 0
        END::bigint AS clicks
    FROM public.prospeccion_contactos_log l
    CROSS JOIN contexto_org co
    WHERE l.organizacion_id = co.organizacion_id
      AND l.envio_id IS NOT NULL
      AND l.canal = 'correo'
    GROUP BY l.envio_id
),
sesion_signals AS (
    SELECT
        w.session_id,
        lower(COALESCE(
            NULLIF(btrim(w.utm_source), ''),
            substring(w.landing_url FROM '(?:\\?|&)utm_source=([^&#]+)'),
            ''
        )) AS utm_source,
        lower(COALESCE(
            NULLIF(btrim(w.utm_medium), ''),
            substring(w.landing_url FROM '(?:\\?|&)utm_medium=([^&#]+)'),
            ''
        )) AS utm_medium,
        lower(COALESCE(
            NULLIF(btrim(w.utm_campaign), ''),
            substring(w.landing_url FROM '(?:\\?|&)utm_campaign=([^&#]+)'),
            ''
        )) AS utm_campaign,
        COALESCE(
            w.eid,
            NULLIF(substring(w.landing_url FROM '(?:\\?|&)(?:eid|envio_id)=([0-9a-fA-F-]{36})'), '')::uuid
        ) AS envio_id,
        COALESCE(
            w.tid,
            NULLIF(substring(w.landing_url FROM '(?:\\?|&)(?:tid|template_id)=([0-9a-fA-F-]{36})'), '')::uuid
        ) AS template_id
    FROM public.web_sessions w
    CROSS JOIN contexto_org co
    WHERE w.organizacion_id = co.organizacion_id
      AND (
        COALESCE(w.landing_url, '') <> ''
        OR COALESCE(w.utm_source, '') <> ''
        OR COALESCE(w.utm_medium, '') <> ''
        OR COALESCE(w.utm_campaign, '') <> ''
        OR w.eid IS NOT NULL
        OR w.tid IS NOT NULL
      )
),
sesion_por_envio AS (
    SELECT
        envio_id,
        COUNT(DISTINCT session_id)::bigint AS sesiones
    FROM sesion_signals
    WHERE utm_source = 'prospeccion'
      AND utm_medium = 'email'
      AND envio_id IS NOT NULL
    GROUP BY envio_id
),
sesion_por_whatsapp AS (
    SELECT
        w.campana_id,
        w.template_id,
        COUNT(DISTINCT w.session_id)::bigint AS sesiones
    FROM sesion_signals w
    WHERE w.utm_source = 'prospeccion'
      AND w.utm_medium = 'whatsapp_cta'
      AND w.template_id IS NOT NULL
      AND NULLIF(w.utm_campaign, '') IS NOT NULL
    GROUP BY w.campana_id, w.template_id
),
sesion_atribucion_email AS (
    SELECT
        eb.campana_id,
        c.nombre AS campana_nombre,
        eb.canal,
        eb.template_uuid AS template_id,
        COALESCE(lower(t.slug), eb.template_slug) AS template_slug,
        COALESCE(t.nombre, COALESCE(t.slug, eb.template_slug), 'Plantilla sin nombre') AS template_nombre,
        eb.twilio_content_sid,
        COALESCE(SUM(se.sesiones), 0)::bigint AS sesiones
    FROM envios_base eb
    LEFT JOIN public.campanas c ON c.id = eb.campana_id
    LEFT JOIN public.prospeccion_contacto_templates t
      ON t.organizacion_id = eb.organizacion_id
     AND t.id = eb.template_uuid
    LEFT JOIN sesion_por_envio se ON se.envio_id = eb.envio_id
    WHERE eb.canal = 'correo'
    GROUP BY
      eb.campana_id,
      c.nombre,
      eb.canal,
      eb.template_uuid,
      COALESCE(lower(t.slug), eb.template_slug),
      COALESCE(t.nombre, COALESCE(t.slug, eb.template_slug), 'Plantilla sin nombre'),
      eb.twilio_content_sid
),
sesion_atribucion_whatsapp AS (
    SELECT
        eb.campana_id,
        c.nombre AS campana_nombre,
        eb.canal,
        eb.template_uuid AS template_id,
        COALESCE(lower(t.slug), eb.template_slug) AS template_slug,
        COALESCE(t.nombre, COALESCE(t.slug, eb.template_slug), 'Plantilla sin nombre') AS template_nombre,
        eb.twilio_content_sid,
        COALESCE(SUM(spw.sesiones), 0)::bigint AS sesiones
    FROM envios_base eb
    LEFT JOIN public.campanas c ON c.id = eb.campana_id
    LEFT JOIN public.prospeccion_contacto_templates t
      ON t.organizacion_id = eb.organizacion_id
     AND t.id = eb.template_uuid
    LEFT JOIN sesion_por_whatsapp spw
      ON spw.campana_id = eb.campana_id
     AND spw.template_id IS NOT DISTINCT FROM eb.template_uuid
    WHERE eb.canal = 'whatsapp'
    GROUP BY
      eb.campana_id,
      c.nombre,
      eb.canal,
      eb.template_uuid,
      COALESCE(lower(t.slug), eb.template_slug),
      COALESCE(t.nombre, COALESCE(t.slug, eb.template_slug), 'Plantilla sin nombre'),
      eb.twilio_content_sid
),
sesion_atribucion AS (
    SELECT * FROM sesion_atribucion_email
    UNION ALL
    SELECT * FROM sesion_atribucion_whatsapp
),
agg_envios AS (
    SELECT
        eb.campana_id,
        c.nombre AS campana_nombre,
        eb.canal,
        eb.template_uuid AS template_id,
        COALESCE(lower(t.slug), eb.template_slug) AS template_slug,
        COALESCE(t.nombre, COALESCE(t.slug, eb.template_slug), 'Plantilla sin nombre') AS template_nombre,
        eb.twilio_content_sid,
        COUNT(*)::bigint AS envios_totales,
        COUNT(*) FILTER (WHERE eb.estado IN ('enviado', 'entregado', 'leido', 'completado', 'respondido'))::bigint AS envios_enviados,
        COUNT(*) FILTER (WHERE eb.estado IN ('entregado', 'leido', 'completado', 'respondido'))::bigint AS envios_entregados,
        COUNT(*) FILTER (WHERE eb.estado IN ('fallido', 'error', 'failed', 'undelivered'))::bigint AS envios_fallidos,
        COUNT(*) FILTER (WHERE eb.estado = 'omitido')::bigint AS envios_omitidos,
        COUNT(*) FILTER (WHERE COALESCE(r.respondio, FALSE))::bigint AS envios_respondidos,
        COALESCE(SUM(bp.aperturas), 0)::bigint AS brevo_aperturas,
        COALESCE(SUM(bp.clicks), 0)::bigint AS brevo_clicks
    FROM envios_base eb
    LEFT JOIN public.campanas c ON c.id = eb.campana_id
    LEFT JOIN public.prospeccion_contacto_templates t
      ON t.organizacion_id = eb.organizacion_id
     AND t.id = eb.template_uuid
    LEFT JOIN respuesta_por_envio r ON r.envio_id = eb.envio_id
    LEFT JOIN brevo_por_envio bp ON bp.envio_id = eb.envio_id
    GROUP BY
      eb.campana_id,
      c.nombre,
      eb.canal,
      eb.template_uuid,
      COALESCE(lower(t.slug), eb.template_slug),
      COALESCE(t.nombre, COALESCE(t.slug, eb.template_slug), 'Plantilla sin nombre'),
      eb.twilio_content_sid
)
SELECT
    a.campana_id,
    a.campana_nombre,
    a.canal,
    a.template_id,
    a.template_slug,
    a.template_nombre,
    a.twilio_content_sid,
    a.envios_totales,
    a.envios_enviados,
    a.envios_entregados,
    a.envios_fallidos,
    a.envios_omitidos,
    a.envios_respondidos,
    a.brevo_aperturas,
    a.brevo_clicks,
    COALESCE(sa.sesiones, 0)::bigint AS sesiones_utm,
    CASE
        WHEN a.envios_totales = 0 THEN 0
        ELSE ROUND((a.envios_entregados::numeric * 100.0) / a.envios_totales::numeric, 2)
    END AS tasa_entrega_pct,
    CASE
        WHEN a.envios_totales = 0 THEN 0
        ELSE ROUND((a.envios_respondidos::numeric * 100.0) / a.envios_totales::numeric, 2)
    END AS tasa_respuesta_pct,
    CASE
        WHEN COALESCE(sa.sesiones, 0) = 0 THEN 0
        ELSE ROUND((a.brevo_clicks::numeric * 100.0) / sa.sesiones::numeric, 2)
    END AS click_to_session_pct
FROM agg_envios a
LEFT JOIN sesion_atribucion sa
  ON sa.campana_id IS NOT DISTINCT FROM a.campana_id
 AND sa.canal IS NOT DISTINCT FROM a.canal
 AND sa.template_id IS NOT DISTINCT FROM a.template_id
 AND sa.template_slug IS NOT DISTINCT FROM a.template_slug
 AND sa.twilio_content_sid IS NOT DISTINCT FROM a.twilio_content_sid
ORDER BY a.envios_totales DESC, a.campana_nombre NULLS LAST, a.template_nombre, a.twilio_content_sid NULLS LAST
LIMIT GREATEST(1, COALESCE(p_limit, 200))
OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.prospeccion_campana_template_atribucion_rango(uuid, integer, timestamptz, timestamptz, integer) TO authenticated;

UPDATE public.web_sessions
SET tid = NULLIF(
    COALESCE(
        substring(landing_url FROM '(?:\\?|&)(?:tid|template_id)=([0-9a-fA-F-]{36})'),
        ''
    ),
    ''
)::uuid
WHERE utm_source = 'prospeccion'
  AND utm_medium = 'whatsapp_cta'
  AND tid IS NULL
  AND COALESCE(landing_url, '') ~* '(?:\\?|&)(?:tid|template_id)=[0-9a-fA-F-]{36}';
