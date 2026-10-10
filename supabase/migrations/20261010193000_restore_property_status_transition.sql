-- Revierte únicamente el cambio accidental de transición operativa.
DO $migration$
DECLARE
    v_definition text;
BEGIN
    SELECT pg_get_functiondef(
        'public.crm_confirmar_pedido_venta(uuid,uuid,uuid,date,text,date)'::regprocedure
    ) INTO v_definition;

    IF v_definition IS NULL THEN
        RAISE EXCEPTION 'crm_confirmar_pedido_venta_not_found';
    END IF;

    v_definition := replace(
        v_definition,
        'SET status = CASE WHEN u.status IN (''apartado''::public.propiedad_status, ''reservado''::public.propiedad_status)
                             THEN u.status ELSE ''apartado''::public.propiedad_status END,',
        'SET status = CASE WHEN u.status = ''apartado''::public.propiedad_status
                             THEN u.status ELSE ''reservado''::public.propiedad_status END,'
    );

    IF v_definition NOT LIKE '%ELSE ''reservado''::public.propiedad_status END%' THEN
        RAISE EXCEPTION 'property_status_transition_pattern_not_found';
    END IF;

    EXECUTE v_definition;
END;
$migration$;
