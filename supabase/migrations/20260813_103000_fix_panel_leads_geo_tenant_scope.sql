-- The original SECURITY DEFINER function allowed service_role to bypass the
-- organization predicate. Keep its implementation private and expose a
-- tenant-scoped wrapper that always filters the returned opportunity IDs.

ALTER FUNCTION public.panel_leads_geo_base_ext(text, timestamptz, timestamptz)
    RENAME TO panel_leads_geo_base_ext_unscoped;

REVOKE ALL ON FUNCTION public.panel_leads_geo_base_ext_unscoped(text, timestamptz, timestamptz)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.panel_leads_geo_base_ext(
    p_canales text DEFAULT NULL::text,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS TABLE(
    lead_id uuid,
    contacto_id uuid,
    canal text,
    etapa_id uuid,
    etapa_codigo text,
    etapa_nombre text,
    etapa_categoria public.lead_categoria,
    etapa_orden integer,
    pais_codigo text,
    pais_nombre text,
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
WITH scope AS (
    SELECT COALESCE(
        NULLIF((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
        public.usuario_organizacion_id(auth.uid())
    ) AS organizacion_id
)
SELECT base.*
FROM public.panel_leads_geo_base_ext_unscoped(p_canales, p_from, p_to) AS base
JOIN public.oportunidades AS o ON o.id = base.lead_id
CROSS JOIN scope AS s
WHERE s.organizacion_id IS NOT NULL
  AND o.organizacion_id = s.organizacion_id;
$$;

REVOKE ALL ON FUNCTION public.panel_leads_geo_base_ext(text, timestamptz, timestamptz)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.panel_leads_geo_base_ext(text, timestamptz, timestamptz)
    TO authenticated, service_role;
