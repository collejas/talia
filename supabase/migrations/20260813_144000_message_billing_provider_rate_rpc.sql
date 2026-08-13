BEGIN;

ALTER TABLE public.cobro_tarifas_proveedor
    ADD COLUMN IF NOT EXISTS motivo text NULL;

CREATE OR REPLACE FUNCTION public.crear_cobro_tarifa_proveedor(
    p_proveedor text,
    p_canal text,
    p_pais_codigo_iso2 text,
    p_categoria_meta text,
    p_iniciador_hilo text,
    p_precio_unitario numeric,
    p_motivo text DEFAULT NULL,
    p_vigente_desde timestamptz DEFAULT now()
)
RETURNS TABLE (
    id uuid,
    proveedor text,
    canal text,
    pais_codigo_iso2 character,
    categoria_meta text,
    iniciador_hilo text,
    precio_unitario numeric,
    moneda character,
    vigente_desde timestamptz,
    vigente_hasta timestamptz,
    activo boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_effective_from timestamptz := coalesce(p_vigente_desde, now());
    v_rate public.cobro_tarifas_proveedor%ROWTYPE;
BEGIN
    IF NOT public.es_owner(auth.uid()) THEN
        RAISE EXCEPTION 'billing_owner_required';
    END IF;
    IF nullif(trim(p_proveedor), '') IS NULL OR nullif(trim(p_canal), '') IS NULL THEN
        RAISE EXCEPTION 'billing_provider_identity_required';
    END IF;
    IF upper(trim(p_pais_codigo_iso2)) NOT IN ('MX') THEN
        RAISE EXCEPTION 'billing_provider_country_invalid';
    END IF;
    IF p_categoria_meta NOT IN ('marketing', 'utility', 'authentication', 'service', 'referral_conversion', 'unknown') THEN
        RAISE EXCEPTION 'billing_provider_category_invalid';
    END IF;
    IF p_iniciador_hilo NOT IN ('cliente', 'empresa', 'desconocido') THEN
        RAISE EXCEPTION 'billing_thread_initiator_invalid';
    END IF;
    IF p_precio_unitario IS NULL OR p_precio_unitario < 0 OR v_effective_from > now() THEN
        RAISE EXCEPTION 'billing_provider_rate_values_invalid';
    END IF;

    UPDATE public.cobro_tarifas_proveedor tp
    SET activo = false,
        vigente_hasta = v_effective_from,
        actualizado_en = now()
    WHERE tp.activo
      AND tp.proveedor = lower(trim(p_proveedor))
      AND tp.canal = lower(trim(p_canal))
      AND tp.pais_codigo_iso2 = upper(trim(p_pais_codigo_iso2))
      AND tp.categoria_meta = p_categoria_meta
      AND tp.iniciador_hilo = p_iniciador_hilo;

    INSERT INTO public.cobro_tarifas_proveedor (
        proveedor, canal, pais_codigo_iso2, categoria_meta, iniciador_hilo,
        precio_unitario, moneda, vigente_desde, activo, motivo, origen_registro
    ) VALUES (
        lower(trim(p_proveedor)), lower(trim(p_canal)), upper(trim(p_pais_codigo_iso2)),
        p_categoria_meta, p_iniciador_hilo, p_precio_unitario, 'MXN', v_effective_from,
        true, nullif(trim(p_motivo), ''), 'owner_api'
    )
    RETURNING * INTO v_rate;

    RETURN QUERY SELECT v_rate.id, v_rate.proveedor, v_rate.canal,
        v_rate.pais_codigo_iso2, v_rate.categoria_meta, v_rate.iniciador_hilo,
        v_rate.precio_unitario, v_rate.moneda, v_rate.vigente_desde,
        v_rate.vigente_hasta, v_rate.activo;
END;
$function$;

REVOKE ALL ON FUNCTION public.crear_cobro_tarifa_proveedor(
    text, text, text, text, text, numeric, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_cobro_tarifa_proveedor(
    text, text, text, text, text, numeric, text, timestamptz
) TO authenticated;

COMMIT;
