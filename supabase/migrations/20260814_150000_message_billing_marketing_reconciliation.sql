-- El mismo override debe aplicarse cuando llega pricing después del registro.
DO $patch$
DECLARE
    v_oid oid := to_regprocedure(
        'public.actualizar_cobro_meta_mensaje(text,text,text,text,text,boolean)'
    );
    v_definition text;
    v_old text := $old$
    IF p_proveedor = 'meta' AND v_ledger.direccion = 'saliente'
       AND v_ledger.origen_mensaje = 'empresa' AND coalesce(v_billable, true) THEN
$old$;
    v_new text := $new$
    IF p_proveedor = 'meta' AND v_ledger.direccion = 'saliente'
       AND coalesce(v_billable, true)
       AND (v_ledger.origen_mensaje = 'empresa' OR v_category = 'marketing') THEN
$new$;
BEGIN
    IF v_oid IS NULL THEN
        RAISE EXCEPTION 'actualizar_cobro_meta_mensaje signature not found';
    END IF;

    SELECT pg_get_functiondef(v_oid) INTO v_definition;
    IF position(v_old IN v_definition) = 0 THEN
        IF position(v_new IN v_definition) > 0 THEN
            RETURN;
        END IF;
        RAISE EXCEPTION 'Expected Meta reconciliation condition not found';
    END IF;

    EXECUTE replace(v_definition, v_old, v_new);
END;
$patch$;
