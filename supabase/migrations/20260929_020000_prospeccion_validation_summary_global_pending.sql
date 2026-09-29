BEGIN;

CREATE OR REPLACE FUNCTION public.prospeccion_enriquecimiento_resumen()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH org AS (
        SELECT public.usuario_organizacion_id(auth.uid()) AS org_id
    )
    SELECT jsonb_build_object(
        'total_prospectos', COUNT(*)::bigint,
        'telefonos_pendientes', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.phone), '') IS NOT NULL
              AND COALESCE(NULLIF(btrim(p.lookup_status), ''), 'pendiente') = 'pendiente'
        )::bigint,
        'correos_pendientes', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.email), '') IS NOT NULL
              AND COALESCE(NULLIF(btrim(p.email_lookup_status), ''), 'pendiente') = 'pendiente'
        )::bigint,
        'sitios_web_pendientes', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.website), '') IS NOT NULL
              AND COALESCE(NULLIF(btrim(p.website_lookup_status), ''), 'pendiente') = 'pendiente'
        )::bigint
    )
    FROM public.prospeccion_prospectos p
    JOIN org ON p.organizacion_id = org.org_id;
$$;

REVOKE ALL ON FUNCTION public.prospeccion_enriquecimiento_resumen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prospeccion_enriquecimiento_resumen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.prospeccion_enriquecimiento_resumen() TO service_role;

COMMIT;
