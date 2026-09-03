BEGIN;

-- El ledger financiero debe sobrevivir al borrado autorizado de datos
-- operativos desde Inbox. mensaje_id y conversacion_id se conservan como
-- referencias históricas, pero ya no controlan la vida útil del cargo.
ALTER TABLE public.cobro_mensajes
    ADD COLUMN IF NOT EXISTS mensaje_creado_en timestamptz;

UPDATE public.cobro_mensajes cm
SET mensaje_creado_en = m.creado_en
FROM public.mensajes m
WHERE m.organizacion_id = cm.organizacion_id
  AND m.id = cm.mensaje_id
  AND cm.mensaje_creado_en IS NULL;

DO $validate_message_dates$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.cobro_mensajes
        WHERE mensaje_creado_en IS NULL
    ) THEN
        RAISE EXCEPTION 'message_billing_operational_delete_requires_message_dates';
    END IF;
END;
$validate_message_dates$;

ALTER TABLE public.cobro_mensajes
    ALTER COLUMN mensaje_creado_en SET NOT NULL;

CREATE INDEX IF NOT EXISTS cobro_mensajes_org_message_date_idx
    ON public.cobro_mensajes (organizacion_id, mensaje_creado_en DESC);

ALTER TABLE public.cobro_mensajes
    DROP CONSTRAINT IF EXISTS cobro_mensajes_org_message_fk,
    DROP CONSTRAINT IF EXISTS cobro_mensajes_org_conversation_fk;

ALTER TABLE public.cobro_hilos_resumen
    DROP CONSTRAINT IF EXISTS cobro_hilos_org_conversation_fk;

-- El registro canónico debe guardar la fecha del mensaje, no depender de que
-- la fila operativa siga existiendo después de una limpieza de Inbox.
DO $patch_billing_registration$
DECLARE
    v_oid oid;
    v_definition text;
    v_signature text := 'public.registrar_cobro_mensaje(uuid,uuid,text,text,text,text,text,text,boolean,boolean,text,text,text,timestamptz,text)';
BEGIN
    v_oid := to_regprocedure(v_signature);
    IF v_oid IS NULL THEN
        RAISE EXCEPTION 'billing registration signature not found';
    END IF;

    SELECT pg_get_functiondef(v_oid) INTO v_definition;
    v_definition := regexp_replace(
        v_definition,
        '(INSERT INTO public\.cobro_mensajes \(\s*)organizacion_id, periodo_id, mensaje_id, conversacion_id,',
        E'\\1organizacion_id, periodo_id, mensaje_id, conversacion_id, mensaje_creado_en,',
        1
    );
    v_definition := regexp_replace(
        v_definition,
        '(\) VALUES \(\s*)p_organizacion_id, v_period_id, v_message\.id, v_message\.conversacion_id,',
        E'\\1p_organizacion_id, v_period_id, v_message.id, v_message.conversacion_id, v_message.creado_en,',
        1
    );
    IF position('mensaje_creado_en' IN v_definition) = 0 THEN
        RAISE EXCEPTION 'billing registration patch did not find insert contract';
    END IF;
    EXECUTE v_definition;
END;
$patch_billing_registration$;

-- Los resúmenes filtrados deben usar el snapshot del ledger. Así los KPI no
-- pierden cargos cuando el mensaje operativo ya fue eliminado.
DO $patch_billing_summaries$
DECLARE
    v_oid oid;
    v_definition text;
    v_signature text;
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
        v_definition := regexp_replace(
            v_definition,
            E'\\n\\s*JOIN public\\.mensajes m\\s+ON m\\.organizacion_id = cm\\.organizacion_id\\s+AND m\\.id = cm\\.mensaje_id',
            '',
            'g'
        );
        v_definition := replace(v_definition, 'm.creado_en', 'cm.mensaje_creado_en');
        EXECUTE v_definition;
    END LOOP;
END;
$patch_billing_summaries$;

COMMIT;
