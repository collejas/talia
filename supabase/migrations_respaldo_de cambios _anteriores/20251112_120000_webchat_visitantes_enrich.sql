BEGIN;

ALTER TABLE public.webchat_visitantes
    ADD COLUMN IF NOT EXISTS visit_count integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS referrer text,
    ADD COLUMN IF NOT EXISTS landing_url text;

UPDATE public.webchat_visitantes
   SET visit_count = COALESCE(visit_count, 1)
 WHERE visit_count IS NULL;

CREATE OR REPLACE FUNCTION public.record_webchat_visitante(
    p_session_id text,
    p_ip text DEFAULT NULL,
    p_device_type text DEFAULT NULL,
    p_geo jsonb DEFAULT NULL,
    p_cve_ent text DEFAULT NULL,
    p_nom_ent text DEFAULT NULL,
    p_cve_mun text DEFAULT NULL,
    p_nom_mun text DEFAULT NULL,
    p_cvegeo text DEFAULT NULL,
    p_referrer text DEFAULT NULL,
    p_landing_url text DEFAULT NULL
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
        referrer,
        landing_url,
        visit_count,
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
        NULLIF(p_referrer, ''),
        NULLIF(p_landing_url, ''),
        1,
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
          referrer = COALESCE(EXCLUDED.referrer, public.webchat_visitantes.referrer),
          landing_url = COALESCE(EXCLUDED.landing_url, public.webchat_visitantes.landing_url),
          ultimo_evento_en = now(),
          visit_count = COALESCE(public.webchat_visitantes.visit_count, 0) + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_webchat_visitante(text, text, text, jsonb, text, text, text, text, text, text, text)
    TO postgres, service_role;

COMMIT;
