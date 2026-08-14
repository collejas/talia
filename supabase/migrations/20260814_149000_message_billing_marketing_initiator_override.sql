-- Una plantilla marketing saliente es una iniciativa de empresa aunque la
-- conversación reutilizada haya comenzado con un mensaje del cliente.
DO $patch$
DECLARE
    v_oid oid := to_regprocedure(
        'public.registrar_cobro_mensaje(uuid,uuid,text,text,text,text,text,text,boolean,boolean,text,text,text,timestamptz,text)'
    );
    v_definition text;
    v_old text := $old$
    IF v_message.direccion = 'saliente' AND v_thread_initiator = 'empresa'
       AND coalesce(p_billable_meta, true) THEN
$old$;
    v_new text := $new$
    IF v_message.direccion = 'saliente'
       AND coalesce(p_billable_meta, true)
       AND (v_thread_initiator = 'empresa' OR v_category = 'marketing') THEN
$new$;
BEGIN
    IF v_oid IS NULL THEN
        RAISE EXCEPTION 'registrar_cobro_mensaje signature not found';
    END IF;

    SELECT pg_get_functiondef(v_oid) INTO v_definition;
    IF position(v_old IN v_definition) = 0 THEN
        IF position(v_new IN v_definition) > 0 THEN
            RETURN;
        END IF;
        RAISE EXCEPTION 'Expected message billing initiator condition not found';
    END IF;

    EXECUTE replace(v_definition, v_old, v_new);
END;
$patch$;
