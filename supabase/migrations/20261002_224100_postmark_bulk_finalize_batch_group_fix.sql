-- Corrige la agrupacion de batches en la funcion set-based de finalizacion.
DO $do$
DECLARE
    v_definition text;
BEGIN
    SELECT pg_get_functiondef(
        'public.worker_finalize_postmark_envios_bulk(uuid,jsonb)'::regprocedure
    ) INTO v_definition;

    v_definition := replace(v_definition, 'GROUP BY b.id', 'GROUP BY b.batch_id');

    IF v_definition NOT LIKE '%GROUP BY b.batch_id%' THEN
        RAISE EXCEPTION 'No se encontro la agrupacion esperada de batches';
    END IF;

    EXECUTE v_definition;
END;
$do$;
