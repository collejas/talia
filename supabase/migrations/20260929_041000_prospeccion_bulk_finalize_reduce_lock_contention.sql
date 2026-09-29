CREATE INDEX IF NOT EXISTS prospeccion_contacto_envio_org_batch_estado_idx
    ON public.prospeccion_contacto_envio (organizacion_id, batch_id, estado);

CREATE OR REPLACE FUNCTION public.tg_prospeccion_contacto_envio_sync_prospecto_totales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    IF current_setting('app.skip_prospecto_envio_totals', true) = 'on' THEN
        RETURN NULL;
    END IF;

    IF TG_OP = 'DELETE' THEN
        PERFORM public.sync_prospeccion_prospectos_envio_totales(OLD.organizacion_id, OLD.prospecto_id);
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM public.sync_prospeccion_prospectos_envio_totales(NEW.organizacion_id, NEW.prospecto_id);
        IF OLD.organizacion_id IS DISTINCT FROM NEW.organizacion_id
           OR OLD.prospecto_id IS DISTINCT FROM NEW.prospecto_id THEN
            PERFORM public.sync_prospeccion_prospectos_envio_totales(OLD.organizacion_id, OLD.prospecto_id);
        END IF;
    ELSE
        PERFORM public.sync_prospeccion_prospectos_envio_totales(NEW.organizacion_id, NEW.prospecto_id);
    END IF;

    RETURN NULL;
END;
$function$;

DO $do$
DECLARE
    v_definition text;
BEGIN
    SELECT pg_get_functiondef(
        'public.worker_finalize_postmark_envios_bulk(uuid,jsonb)'::regprocedure
    ) INTO v_definition;

    v_definition := replace(
        v_definition,
        '    v_batch_ids uuid[] := ARRAY[]::uuid[];',
        '    v_batch_ids uuid[] := ARRAY[]::uuid[];
    v_prospecto_ids uuid[] := ARRAY[]::uuid[];'
    );

    v_definition := replace(
        v_definition,
        '    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)',
        '    PERFORM set_config(''app.skip_prospecto_envio_totals'', ''on'', true);

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)'
    );

    v_definition := replace(
        v_definition,
        '            IF v_batch_id IS NOT NULL AND NOT v_batch_id = ANY(v_batch_ids) THEN
                v_batch_ids := array_append(v_batch_ids, v_batch_id);
            END IF;',
        '            IF v_batch_id IS NOT NULL AND NOT v_batch_id = ANY(v_batch_ids) THEN
                v_batch_ids := array_append(v_batch_ids, v_batch_id);
            END IF;

            IF v_prospecto_id IS NOT NULL AND NOT v_prospecto_id = ANY(v_prospecto_ids) THEN
                v_prospecto_ids := array_append(v_prospecto_ids, v_prospecto_id);
            END IF;'
    );

    v_definition := replace(
        v_definition,
        '    RETURN QUERY SELECT v_updated_count, v_log_count, v_batch_count;',
        '    FOREACH v_prospecto_id IN ARRAY v_prospecto_ids
    LOOP
        PERFORM public.sync_prospeccion_prospectos_envio_totales(
            p_organizacion_id,
            v_prospecto_id
        );
    END LOOP;

    RETURN QUERY SELECT v_updated_count, v_log_count, v_batch_count;'
    );

    IF v_definition NOT ILIKE '%app.skip_prospecto_envio_totals%'
       OR v_definition NOT ILIKE '%v_prospecto_ids uuid[]%'
       OR v_definition NOT ILIKE '%FOREACH v_prospecto_id IN ARRAY v_prospecto_ids%' THEN
        RAISE EXCEPTION 'No se pudo aplicar la optimizacion de recalculo por lote';
    END IF;

    EXECUTE v_definition;
END;
$do$;
