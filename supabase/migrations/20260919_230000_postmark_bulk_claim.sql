BEGIN;

-- Reclama hasta 500 envíos pendientes en una sola operación del worker.
-- El JSONB sólo transporta temporalmente ids e intentos ya calculados por el
-- worker; el estado operativo permanece en columnas explícitas.
CREATE OR REPLACE FUNCTION public.worker_claim_prospeccion_envios_bulk(
    p_organizacion_id uuid,
    p_items jsonb
)
RETURNS TABLE (
    envio_id uuid,
    claimed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_item record;
    v_updated_id uuid;
BEGIN
    IF p_organizacion_id IS NULL
       OR p_items IS NULL
       OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) < 1
       OR jsonb_array_length(p_items) > 500 THEN
        RAISE EXCEPTION 'postmark_bulk_claim_invalid_input'
            USING ERRCODE = '22023';
    END IF;

    FOR v_item IN
        SELECT *
        FROM jsonb_to_recordset(p_items) AS x(
            envio_id uuid,
            intento_actual integer
        )
    LOOP
        IF v_item.envio_id IS NULL
           OR v_item.intento_actual IS NULL
           OR v_item.intento_actual < 1 THEN
            RAISE EXCEPTION 'postmark_bulk_claim_invalid_item'
                USING ERRCODE = '22023';
        END IF;

        v_updated_id := NULL;
        UPDATE public.prospeccion_contacto_envio AS e
        SET estado = 'procesando',
            intento_actual = v_item.intento_actual
        WHERE e.id = v_item.envio_id
          AND e.organizacion_id = p_organizacion_id
          AND e.estado = 'pendiente'
        RETURNING e.id INTO v_updated_id;

        envio_id := v_item.envio_id;
        claimed := v_updated_id IS NOT NULL;
        RETURN NEXT;
    END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.worker_claim_prospeccion_envios_bulk(uuid, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_claim_prospeccion_envios_bulk(uuid, jsonb)
    TO service_role;

COMMENT ON FUNCTION public.worker_claim_prospeccion_envios_bulk IS
    'Reclama hasta 500 envios Postmark pendientes por tenant de forma atomica.';

COMMIT;
