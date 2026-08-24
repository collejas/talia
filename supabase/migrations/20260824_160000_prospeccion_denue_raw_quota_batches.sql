BEGIN;

-- Reserva la cuota de resultados crudos de forma atomica por lote.
-- La reserva se realiza antes de persistir el lote para que dos trabajos del
-- mismo tenant no puedan consumir la misma cuota simultaneamente.
CREATE OR REPLACE FUNCTION public.prospeccion_reservar_resultados_denue_lote(
    p_tenant_id uuid,
    p_busqueda_id uuid,
    p_requested_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_now timestamptz := clock_timestamp();
    v_plan_id uuid;
    v_access_status text;
    v_period_start timestamptz;
    v_period_end timestamptz;
    v_credits_limit integer;
    v_raw_results_limit integer;
    v_period public.tenant_prospeccion_usage_periods%ROWTYPE;
    v_operation public.tenant_prospeccion_raw_operations%ROWTYPE;
    v_allowed_count integer := 0;
BEGIN
    IF p_tenant_id IS NULL OR p_busqueda_id IS NULL OR p_requested_count IS NULL OR p_requested_count < 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_request_invalid';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.busquedas AS busqueda
        WHERE busqueda.id = p_busqueda_id
          AND busqueda.organizacion_id = p_tenant_id
          AND busqueda.fuente = 'denue'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_search_not_owned';
    END IF;

    IF p_requested_count = 0 THEN
        RETURN jsonb_build_object(
            'ok', true,
            'reserved', 0,
            'remaining', 0,
            'quota_reached', false
        );
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('prospeccion_credits_' || p_tenant_id::text));

    SELECT billing.plan_id, billing.access_status,
           CASE
               WHEN billing.current_period_start IS NOT NULL
                AND billing.current_period_end IS NOT NULL
                AND billing.current_period_start <= v_now
                AND v_now < billing.current_period_end
               THEN billing.current_period_start
               ELSE date_trunc('month', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
           END,
           CASE
               WHEN billing.current_period_start IS NOT NULL
                AND billing.current_period_end IS NOT NULL
                AND billing.current_period_start <= v_now
                AND v_now < billing.current_period_end
               THEN billing.current_period_end
               ELSE (date_trunc('month', v_now AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC'
           END
    INTO v_plan_id, v_access_status, v_period_start, v_period_end
    FROM public.tenant_billing_accounts AS billing
    JOIN public.commercial_plans AS plan
      ON plan.id = billing.plan_id
     AND plan.active = true
    WHERE billing.tenant_id = p_tenant_id;

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_plan_not_configured';
    END IF;
    IF v_access_status NOT IN ('active', 'grace', 'internal_free') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_access_blocked';
    END IF;

    SELECT coalesce(
        (
            SELECT override.override_value::integer
            FROM public.tenant_plan_overrides AS override
            WHERE override.tenant_id = p_tenant_id
              AND override.override_key = 'limit.prospeccion.credits_month'
              AND override.override_value ~ '^[0-9]+$'
              AND (override.starts_at IS NULL OR override.starts_at <= v_now)
              AND (override.ends_at IS NULL OR v_now < override.ends_at)
            ORDER BY override.created_at DESC, override.id DESC
            LIMIT 1
        ),
        (
            SELECT entitlement.limit_value::integer
            FROM public.commercial_plan_entitlements AS entitlement
            WHERE entitlement.plan_id = v_plan_id
              AND entitlement.entitlement_key = 'limit.prospeccion.credits_month'
              AND entitlement.enabled = true
              AND entitlement.limit_value >= 0
              AND entitlement.limit_value = trunc(entitlement.limit_value)
            ORDER BY entitlement.created_at DESC, entitlement.id DESC
            LIMIT 1
        )
    )
    INTO v_credits_limit;

    SELECT coalesce(
        (
            SELECT override.override_value::integer
            FROM public.tenant_plan_overrides AS override
            WHERE override.tenant_id = p_tenant_id
              AND override.override_key = 'limit.prospeccion.denue_raw_results_month'
              AND override.override_value ~ '^[0-9]+$'
              AND (override.starts_at IS NULL OR override.starts_at <= v_now)
              AND (override.ends_at IS NULL OR v_now < override.ends_at)
            ORDER BY override.created_at DESC, override.id DESC
            LIMIT 1
        ),
        (
            SELECT entitlement.limit_value::integer
            FROM public.commercial_plan_entitlements AS entitlement
            WHERE entitlement.plan_id = v_plan_id
              AND entitlement.entitlement_key = 'limit.prospeccion.denue_raw_results_month'
              AND entitlement.enabled = true
              AND entitlement.limit_value >= 0
              AND entitlement.limit_value = trunc(entitlement.limit_value)
            ORDER BY entitlement.created_at DESC, entitlement.id DESC
            LIMIT 1
        )
    )
    INTO v_raw_results_limit;

    IF v_credits_limit IS NULL OR v_raw_results_limit IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_credits_not_configured';
    END IF;

    INSERT INTO public.tenant_prospeccion_usage_periods (
        tenant_id, period_start, period_end, credits_limit, raw_results_limit
    )
    VALUES (p_tenant_id, v_period_start, v_period_end, v_credits_limit, v_raw_results_limit)
    ON CONFLICT (tenant_id, period_start, period_end) DO NOTHING;

    SELECT period.*
    INTO v_period
    FROM public.tenant_prospeccion_usage_periods AS period
    WHERE period.tenant_id = p_tenant_id
      AND period.period_start = v_period_start
      AND period.period_end = v_period_end
    FOR UPDATE;

    IF v_period.id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_usage_period_invalid';
    END IF;

    INSERT INTO public.tenant_prospeccion_raw_operations (
        tenant_id, usage_period_id, busqueda_id, raw_results_consumed
    )
    VALUES (p_tenant_id, v_period.id, p_busqueda_id, 0)
    ON CONFLICT (busqueda_id) DO NOTHING;

    SELECT operation.*
    INTO v_operation
    FROM public.tenant_prospeccion_raw_operations AS operation
    WHERE operation.busqueda_id = p_busqueda_id
    FOR UPDATE;

    IF v_operation.tenant_id <> p_tenant_id OR v_operation.usage_period_id <> v_period.id THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_search_not_owned';
    END IF;

    v_allowed_count := least(
        p_requested_count,
        greatest(v_period.raw_results_limit - v_period.raw_results_consumed, 0)
    );

    IF v_allowed_count > 0 THEN
        UPDATE public.tenant_prospeccion_usage_periods
        SET raw_results_consumed = raw_results_consumed + v_allowed_count,
            updated_at = v_now
        WHERE id = v_period.id
          AND tenant_id = p_tenant_id;

        UPDATE public.tenant_prospeccion_raw_operations
        SET raw_results_consumed = raw_results_consumed + v_allowed_count
        WHERE id = v_operation.id;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'reserved', v_allowed_count,
        'remaining', greatest(v_period.raw_results_limit - v_period.raw_results_consumed - v_allowed_count, 0),
        'quota_reached', v_allowed_count < p_requested_count
    );
END;
$function$;

COMMENT ON FUNCTION public.prospeccion_reservar_resultados_denue_lote(uuid, uuid, integer) IS
    'Reserva atomica y tenant-scoped de resultados crudos DENUE por lote, sin truncar por busqueda.';

REVOKE ALL ON FUNCTION public.prospeccion_reservar_resultados_denue_lote(uuid, uuid, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prospeccion_reservar_resultados_denue_lote(uuid, uuid, integer)
    TO service_role;

COMMIT;
