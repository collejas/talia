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
        'telefonos_pendientes', COALESCE((
            SELECT COUNT(*)::bigint
            FROM public.prospeccion_prospectos p
            JOIN org ON p.organizacion_id = org.org_id
            WHERE COALESCE(p.lookup_status, 'pendiente') = ANY (ARRAY['pendiente','sin_numero','error'])
        ), 0),
        'sin_email', COALESCE((
            SELECT COUNT(*)::bigint
            FROM public.prospeccion_prospectos p
            JOIN org ON p.organizacion_id = org.org_id
            WHERE p.email IS NULL OR btrim(p.email) = ''
        ), 0),
        'datos_incompletos', COALESCE((
            SELECT COUNT(*)::bigint
            FROM public.prospeccion_prospectos p
            JOIN org ON p.organizacion_id = org.org_id
            WHERE (p.phone IS NULL OR btrim(p.phone) = '')
               OR (p.website IS NULL OR btrim(p.website) = '')
               OR (p.segmento IS NULL OR btrim(p.segmento) = '')
        ), 0)
    );
$$;

REVOKE ALL ON FUNCTION public.prospeccion_enriquecimiento_resumen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prospeccion_enriquecimiento_resumen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.prospeccion_enriquecimiento_resumen() TO service_role;

COMMIT;
