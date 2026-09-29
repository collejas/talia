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

        'telefonos_verificados', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.phone), '') IS NOT NULL
              AND COALESCE(NULLIF(btrim(p.lookup_status), ''), 'pendiente') = 'verificado'
        )::bigint,
        'telefonos_pendientes', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.phone), '') IS NOT NULL
              AND COALESCE(NULLIF(btrim(p.lookup_status), ''), 'pendiente') = 'pendiente'
        )::bigint,
        'telefonos_errores', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.phone), '') IS NOT NULL
              AND COALESCE(NULLIF(btrim(p.lookup_status), ''), 'pendiente') = 'error'
        )::bigint,
        'telefonos_sin_numero', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.phone), '') IS NULL
        )::bigint,

        'correos_validos', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.email), '') IS NOT NULL
              AND COALESCE(NULLIF(btrim(p.email_lookup_status), ''), 'pendiente') = 'valido'
        )::bigint,
        'correos_invalidos', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.email), '') IS NOT NULL
              AND COALESCE(NULLIF(btrim(p.email_lookup_status), ''), 'pendiente') = 'invalido'
        )::bigint,
        'correos_dudosos', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.email), '') IS NOT NULL
              AND COALESCE(NULLIF(btrim(p.email_lookup_status), ''), 'pendiente') = 'dudoso'
        )::bigint,
        'correos_pendientes', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.email), '') IS NOT NULL
              AND COALESCE(NULLIF(btrim(p.email_lookup_status), ''), 'pendiente') = 'pendiente'
        )::bigint,
        'correos_errores', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.email), '') IS NOT NULL
              AND COALESCE(NULLIF(btrim(p.email_lookup_status), ''), 'pendiente') = 'error'
        )::bigint,
        'correos_sin_email', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.email), '') IS NULL
        )::bigint,

        'sitios_web_validos', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.website), '') IS NOT NULL
              AND COALESCE(NULLIF(btrim(p.website_lookup_status), ''), 'pendiente') = 'valido'
        )::bigint,
        'sitios_web_invalidos', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.website), '') IS NOT NULL
              AND COALESCE(NULLIF(btrim(p.website_lookup_status), ''), 'pendiente') = 'invalido'
        )::bigint,
        'sitios_web_dudosos', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.website), '') IS NOT NULL
              AND COALESCE(NULLIF(btrim(p.website_lookup_status), ''), 'pendiente') = 'dudoso'
        )::bigint,
        'sitios_web_pendientes', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.website), '') IS NOT NULL
              AND COALESCE(NULLIF(btrim(p.website_lookup_status), ''), 'pendiente') = 'pendiente'
        )::bigint,
        'sitios_web_errores', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.website), '') IS NOT NULL
              AND COALESCE(NULLIF(btrim(p.website_lookup_status), ''), 'pendiente') = 'error'
        )::bigint,
        'sitios_web_sin_sitio', COUNT(*) FILTER (
            WHERE NULLIF(btrim(p.website), '') IS NULL
        )::bigint
    )
    FROM public.prospeccion_prospectos p
    JOIN org ON p.organizacion_id = org.org_id;
$$;

REVOKE ALL ON FUNCTION public.prospeccion_enriquecimiento_resumen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prospeccion_enriquecimiento_resumen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.prospeccion_enriquecimiento_resumen() TO service_role;

COMMIT;
