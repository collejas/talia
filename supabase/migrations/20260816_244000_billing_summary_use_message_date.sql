BEGIN;

-- Los periodos deben usar la fecha real de mensajes, no la fecha en que un
-- backfill insertó posteriormente el registro en cobro_mensajes.
DO $patch$
DECLARE
    v_oid oid;
    v_definition text;
    v_signature text;
    v_from_old text := $old$
    FROM public.cobro_mensajes cm
    CROSS JOIN scope s
    LEFT JOIN public.cobro_hilos_resumen h
$old$;
    v_from_new text := $new$
    FROM public.cobro_mensajes cm
    JOIN public.mensajes m
      ON m.organizacion_id = cm.organizacion_id
     AND m.id = cm.mensaje_id
    CROSS JOIN scope s
    LEFT JOIN public.cobro_hilos_resumen h
$new$;
BEGIN
    FOREACH v_signature IN ARRAY ARRAY[
        'public.obtener_cobro_resumen_filtrado(uuid,text,text)',
        'public.obtener_cobro_resumen_filtrado(uuid,text,text,timestamptz,timestamptz)'
    ] LOOP
        v_oid := to_regprocedure(v_signature);
        IF v_oid IS NULL THEN
            RAISE EXCEPTION 'billing summary signature not found: %', v_signature;
        END IF;
        SELECT pg_get_functiondef(v_oid) INTO v_definition;
        IF position(v_from_old IN v_definition) = 0 THEN
            IF position(v_from_new IN v_definition) = 0 THEN
                RAISE EXCEPTION 'billing summary FROM clause not found: %', v_signature;
            END IF;
        ELSE
            v_definition := replace(v_definition, v_from_old, v_from_new);
        END IF;
        v_definition := replace(v_definition, 'cm.creado_en >= p_desde', 'm.creado_en >= p_desde');
        v_definition := replace(v_definition, 'cm.creado_en < p_hasta', 'm.creado_en < p_hasta');
        EXECUTE v_definition;
    END LOOP;
END;
$patch$;

COMMIT;
