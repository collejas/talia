BEGIN;

CREATE OR REPLACE FUNCTION public.crear_cobro_tarifa_app(
    p_alcance text,
    p_organizacion_id uuid,
    p_precio_mensaje numeric,
    p_motivo text DEFAULT NULL,
    p_vigente_desde timestamptz DEFAULT now()
)
RETURNS TABLE (
    id uuid,
    alcance text,
    organizacion_id uuid,
    precio_mensaje numeric,
    moneda character,
    vigente_desde timestamptz,
    vigente_hasta timestamptz,
    activo boolean,
    motivo text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_effective_from timestamptz := coalesce(p_vigente_desde, now());
    v_rate public.cobro_tarifas_app%ROWTYPE;
BEGIN
    IF NOT public.es_owner(auth.uid()) THEN
        RAISE EXCEPTION 'billing_owner_required';
    END IF;
    IF p_alcance NOT IN ('global', 'tenant') THEN
        RAISE EXCEPTION 'billing_rate_scope_invalid';
    END IF;
    IF p_alcance = 'global' AND p_organizacion_id IS NOT NULL THEN
        RAISE EXCEPTION 'billing_global_org_must_be_null';
    END IF;
    IF p_alcance = 'tenant' AND p_organizacion_id IS NULL THEN
        RAISE EXCEPTION 'billing_tenant_org_required';
    END IF;
    IF p_precio_mensaje IS NULL OR p_precio_mensaje < 0 THEN
        RAISE EXCEPTION 'billing_rate_price_invalid';
    END IF;
    IF v_effective_from > now() THEN
        RAISE EXCEPTION 'billing_rate_future_date_not_supported';
    END IF;

    UPDATE public.cobro_tarifas_app ta
    SET activo = false,
        vigente_hasta = v_effective_from,
        actualizado_en = now()
    WHERE ta.activo
      AND ta.alcance = p_alcance
      AND (p_alcance = 'global' OR ta.organizacion_id = p_organizacion_id);

    INSERT INTO public.cobro_tarifas_app (
        alcance, organizacion_id, precio_mensaje, moneda, vigente_desde,
        activo, motivo, origen_registro
    ) VALUES (
        p_alcance, p_organizacion_id, p_precio_mensaje, 'MXN', v_effective_from,
        true, nullif(trim(p_motivo), ''), 'owner_api'
    )
    RETURNING * INTO v_rate;

    RETURN QUERY SELECT v_rate.id, v_rate.alcance, v_rate.organizacion_id,
        v_rate.precio_mensaje, v_rate.moneda, v_rate.vigente_desde,
        v_rate.vigente_hasta, v_rate.activo, v_rate.motivo;
END;
$function$;

REVOKE ALL ON FUNCTION public.crear_cobro_tarifa_app(
    text, uuid, numeric, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_cobro_tarifa_app(
    text, uuid, numeric, text, timestamptz
) TO authenticated;

COMMIT;
