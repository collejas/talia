BEGIN;

CREATE TABLE public.webchat_visitantes (
    session_id text PRIMARY KEY,
    registrado_en timestamptz DEFAULT now() NOT NULL,
    ultimo_evento_en timestamptz DEFAULT now() NOT NULL,
    ip text,
    device_type text,
    geo jsonb,
    cve_ent text,
    nom_ent text,
    cve_mun text,
    nom_mun text,
    cvegeo text
);

CREATE INDEX idx_webchat_visitantes_estado ON public.webchat_visitantes (cve_ent);
CREATE INDEX idx_webchat_visitantes_cvegeo ON public.webchat_visitantes (cvegeo);

ALTER TABLE public.webchat_visitantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY webchat_visitantes_service_role
    ON public.webchat_visitantes
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.record_webchat_visitante(
    p_session_id text,
    p_ip text DEFAULT NULL,
    p_device_type text DEFAULT NULL,
    p_geo jsonb DEFAULT NULL,
    p_cve_ent text DEFAULT NULL,
    p_nom_ent text DEFAULT NULL,
    p_cve_mun text DEFAULT NULL,
    p_nom_mun text DEFAULT NULL,
    p_cvegeo text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.webchat_visitantes (
        session_id,
        ip,
        device_type,
        geo,
        cve_ent,
        nom_ent,
        cve_mun,
        nom_mun,
        cvegeo,
        registrado_en,
        ultimo_evento_en
    )
    VALUES (
        p_session_id,
        NULLIF(p_ip, ''),
        NULLIF(p_device_type, ''),
        CASE WHEN p_geo IS NULL OR p_geo = '{}'::jsonb THEN NULL ELSE p_geo END,
        NULLIF(p_cve_ent, ''),
        NULLIF(p_nom_ent, ''),
        NULLIF(p_cve_mun, ''),
        NULLIF(p_nom_mun, ''),
        NULLIF(p_cvegeo, ''),
        now(),
        now()
    )
    ON CONFLICT (session_id) DO UPDATE
      SET ip = COALESCE(EXCLUDED.ip, public.webchat_visitantes.ip),
          device_type = COALESCE(EXCLUDED.device_type, public.webchat_visitantes.device_type),
          geo = COALESCE(EXCLUDED.geo, public.webchat_visitantes.geo),
          cve_ent = COALESCE(EXCLUDED.cve_ent, public.webchat_visitantes.cve_ent),
          nom_ent = COALESCE(EXCLUDED.nom_ent, public.webchat_visitantes.nom_ent),
          cve_mun = COALESCE(EXCLUDED.cve_mun, public.webchat_visitantes.cve_mun),
          nom_mun = COALESCE(EXCLUDED.nom_mun, public.webchat_visitantes.nom_mun),
          cvegeo = COALESCE(EXCLUDED.cvegeo, public.webchat_visitantes.cvegeo),
          ultimo_evento_en = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_webchat_visitante(text, text, text, jsonb, text, text, text, text, text)
    TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.panel_visitantes_sin_chat_base(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS TABLE(
    session_id text,
    closed_at timestamptz,
    cve_ent text,
    nom_ent text,
    cve_mun text,
    nom_mun text,
    cvegeo text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH closures AS (
        SELECT sc.session_id, sc.closed_at
        FROM public.webchat_session_closures sc
        WHERE (p_from IS NULL OR sc.closed_at >= p_from)
          AND (p_to IS NULL OR sc.closed_at <= p_to)
    ),
    filtered AS (
        SELECT c.session_id, c.closed_at
        FROM closures c
        LEFT JOIN public.mensajes m
          ON m.datos ->> 'session_id' = c.session_id
         AND m.direccion = 'entrante'
        WHERE m.id IS NULL
    )
    SELECT
        f.session_id,
        f.closed_at,
        v.cve_ent,
        v.nom_ent,
        v.cve_mun,
        v.nom_mun,
        COALESCE(v.cvegeo, CASE
            WHEN v.cve_ent IS NOT NULL AND v.cve_mun IS NOT NULL THEN v.cve_ent || v.cve_mun
            ELSE NULL
        END) AS cvegeo
    FROM filtered f
    LEFT JOIN public.webchat_visitantes v
      ON v.session_id = f.session_id;
$$;

GRANT EXECUTE ON FUNCTION public.panel_visitantes_sin_chat_base(timestamptz, timestamptz)
    TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.panel_visitantes_sin_chat_estados(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH base AS (
        SELECT * FROM public.panel_visitantes_sin_chat_base(p_from, p_to)
    ),
    summary AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE cve_ent IS NOT NULL) AS ubicados,
            COUNT(*) FILTER (WHERE cve_ent IS NULL) AS sin_ubicacion
        FROM base
    ),
    grouped AS (
        SELECT
            cve_ent,
            MAX(nom_ent) AS nombre,
            COUNT(*) AS total
        FROM base
        WHERE cve_ent IS NOT NULL
        GROUP BY cve_ent
    )
    SELECT jsonb_build_object(
        'totals', jsonb_build_object(
            'total', COALESCE(summary.total, 0),
            'ubicados', COALESCE(summary.ubicados, 0),
            'sin_ubicacion', COALESCE(summary.sin_ubicacion, 0)
        ),
        'items', (
            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'cve_ent', grouped.cve_ent,
                        'nombre', grouped.nombre,
                        'total', grouped.total,
                        'por_canal', jsonb_build_object('visitantes', grouped.total)
                    )
                    ORDER BY grouped.cve_ent
                ),
                '[]'::jsonb
            )
            FROM grouped
        )
    )
    FROM summary;
$$;

GRANT EXECUTE ON FUNCTION public.panel_visitantes_sin_chat_estados(timestamptz, timestamptz)
    TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.panel_visitantes_sin_chat_municipios(
    p_estado text,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH state_code AS (
        SELECT LPAD(REGEXP_REPLACE(COALESCE(p_estado, ''), '\\D', '', 'g'), 2, '0') AS code
    ),
    base AS (
        SELECT b.*
        FROM public.panel_visitantes_sin_chat_base(p_from, p_to) b
        JOIN state_code s ON b.cve_ent = s.code
    ),
    summary AS (
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE cvegeo IS NOT NULL) AS ubicados,
            COUNT(*) FILTER (WHERE cvegeo IS NULL) AS sin_ubicacion
        FROM base
    ),
    grouped AS (
        SELECT
            cvegeo,
            MAX(nom_mun) AS nombre,
            COUNT(*) AS total
        FROM base
        WHERE cvegeo IS NOT NULL
        GROUP BY cvegeo
    ),
    estado_info AS (
        SELECT MAX(cve_ent) AS cve_ent, MAX(nom_ent) AS nombre FROM base
    )
    SELECT jsonb_build_object(
        'estado', jsonb_build_object(
            'cve_ent', COALESCE((SELECT cve_ent FROM estado_info), (SELECT code FROM state_code)),
            'nombre', (SELECT nombre FROM estado_info)
        ),
        'totals', jsonb_build_object(
            'total', COALESCE(summary.total, 0),
            'ubicados', COALESCE(summary.ubicados, 0),
            'sin_ubicacion', COALESCE(summary.sin_ubicacion, 0)
        ),
        'items', (
            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'cvegeo', grouped.cvegeo,
                        'nombre', grouped.nombre,
                        'total', grouped.total,
                        'por_canal', jsonb_build_object('visitantes', grouped.total)
                    )
                    ORDER BY grouped.cvegeo
                ),
                '[]'::jsonb
            )
            FROM grouped
        )
    )
    FROM summary, state_code;
$$;

GRANT EXECUTE ON FUNCTION public.panel_visitantes_sin_chat_municipios(text, timestamptz, timestamptz)
    TO postgres, service_role;

COMMIT;
