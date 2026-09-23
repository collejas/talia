BEGIN;

CREATE OR REPLACE FUNCTION public.crm_delete_opportunity_with_notes(
    p_organizacion_id uuid,
    p_oportunidad_id uuid
)
RETURNS TABLE (storage_bucket text, storage_path text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_deleted_opportunities integer;
BEGIN
    PERFORM 1
    FROM public.oportunidades o
    WHERE o.organizacion_id = p_organizacion_id
      AND o.id = p_oportunidad_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'oportunidad_not_found' USING ERRCODE = 'P0002';
    END IF;

    RETURN QUERY
    SELECT a.storage_bucket, a.storage_path
    FROM public.nota_adjuntos a
    JOIN public.notas n
      ON n.id = a.nota_id
     AND n.organizacion_id = a.organizacion_id
    WHERE a.organizacion_id = p_organizacion_id
      AND lower(btrim(n.relacion_tipo)) = 'oportunidad'
      AND n.relacion_id = p_oportunidad_id;

    DELETE FROM public.notas n
    WHERE n.organizacion_id = p_organizacion_id
      AND lower(btrim(n.relacion_tipo)) = 'oportunidad'
      AND n.relacion_id = p_oportunidad_id;

    DELETE FROM public.oportunidades o
    WHERE o.organizacion_id = p_organizacion_id
      AND o.id = p_oportunidad_id;
    GET DIAGNOSTICS v_deleted_opportunities = ROW_COUNT;

    IF v_deleted_opportunities <> 1 THEN
        RAISE EXCEPTION 'oportunidad_not_found' USING ERRCODE = 'P0002';
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_delete_opportunity_with_notes(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_delete_opportunity_with_notes(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_delete_opportunity_with_notes(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.crm_delete_opportunity_with_notes(uuid, uuid) IS
'Elimina transaccionalmente las notas de una oportunidad y la oportunidad; devuelve las rutas de adjuntos para limpieza de Storage.';

COMMIT;
