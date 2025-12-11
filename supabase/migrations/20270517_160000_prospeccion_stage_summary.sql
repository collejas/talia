BEGIN;

CREATE OR REPLACE FUNCTION public.prospeccion_stage_resumen()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH org AS (
        SELECT public.usuario_organizacion_id(auth.uid()) AS org_id
    )
    SELECT jsonb_build_object(
        'descubre', COALESCE((
            SELECT COUNT(*)::bigint
            FROM public.busquedas b
            JOIN org ON b.organizacion_id = org.org_id
            WHERE b.creado_en >= (now() - interval '30 days')
        ), 0),
        'enriquecer', COALESCE((
            SELECT COUNT(*)::bigint
            FROM public.prospeccion_prospectos p
            JOIN org ON p.organizacion_id = org.org_id
            WHERE COALESCE(p.lookup_status, 'pendiente') <> 'verificado'
        ), 0),
        'preparar', COALESCE((
            SELECT COUNT(*)::bigint
            FROM public.prospeccion_prospectos p
            JOIN org ON p.organizacion_id = org.org_id
            WHERE p.lookup_status = 'verificado'
        ), 0),
        'lanzar', COALESCE((
            SELECT COUNT(*)::bigint
            FROM public.prospeccion_contacto_batch c
            JOIN org ON c.organizacion_id = org.org_id
            WHERE c.estado = ANY (ARRAY['pendiente','en_proceso'])
        ), 0),
        'evaluar', COALESCE((
            SELECT COUNT(*)::bigint
            FROM public.prospeccion_contacto_batch c
            JOIN org ON c.organizacion_id = org.org_id
            WHERE c.estado = 'completado'
              AND c.creado_en >= (now() - interval '30 days')
        ), 0)
    );
$$;

REVOKE ALL ON FUNCTION public.prospeccion_stage_resumen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prospeccion_stage_resumen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.prospeccion_stage_resumen() TO service_role;

COMMIT;
