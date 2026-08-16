BEGIN;

CREATE OR REPLACE FUNCTION public.reconcile_meta_unknown_billing(
    p_limit integer DEFAULT 500
)
RETURNS TABLE (
    candidatos integer,
    actualizados integer,
    costo_meta_delta numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_item record;
    v_result record;
    v_old_meta numeric(14,4);
    v_candidates integer := 0;
    v_updated integer := 0;
    v_delta numeric(14,4) := 0;
BEGIN
    FOR v_item IN
        SELECT DISTINCT ON (cm.id)
            cm.id,
            cm.proveedor_mensaje_id,
            cm.costo_meta_importe AS old_meta,
            ee.evento,
            ee.payload_crudo->'status'->'pricing' AS pricing
        FROM public.cobro_mensajes cm
        JOIN public.eventos_entrega ee
          ON ee.proveedor = cm.proveedor
         AND ee.proveedor_mensaje_id = cm.proveedor_mensaje_id
         AND ee.mensaje_id = cm.mensaje_id
        WHERE cm.proveedor = 'meta'
          AND cm.categoria_meta = 'unknown'
          AND ee.conciliacion_estado = 'vinculado'
          AND ee.payload_crudo->'status'->'pricing'->>'category' IN (
              'marketing', 'utility', 'authentication', 'service',
              'referral_conversion'
          )
        ORDER BY cm.id, ee.creado_en DESC, ee.id DESC
        LIMIT greatest(1, least(p_limit, 5000))
    LOOP
        v_candidates := v_candidates + 1;
        v_old_meta := COALESCE(v_item.old_meta, 0);

        SELECT * INTO v_result
        FROM public.actualizar_cobro_meta_mensaje(
            'meta',
            v_item.proveedor_mensaje_id,
            v_item.evento,
            v_item.pricing->>'category',
            NULLIF(v_item.pricing->>'pricing_model', ''),
            CASE
                WHEN v_item.pricing->>'billable' IN ('true', 'false')
                    THEN (v_item.pricing->>'billable')::boolean
                ELSE NULL
            END
        );

        IF COALESCE(v_result.actualizado, false) THEN
            v_updated := v_updated + 1;
            v_delta := v_delta + COALESCE(v_result.costo_meta_importe, 0) - v_old_meta;
        END IF;
    END LOOP;

    RETURN QUERY SELECT v_candidates, v_updated, v_delta;
END;
$function$;

COMMIT;
