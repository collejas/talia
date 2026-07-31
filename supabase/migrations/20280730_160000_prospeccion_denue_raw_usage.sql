BEGIN;

-- ============================================================================
-- Operaciones auditables e idempotentes de resultados crudos DENUE
-- ============================================================================

CREATE TABLE public.tenant_prospeccion_raw_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    usage_period_id uuid NOT NULL,
    busqueda_id uuid NOT NULL,
    raw_results_consumed integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_prospeccion_raw_operations_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT tenant_prospeccion_raw_operations_period_fkey
        FOREIGN KEY (tenant_id, usage_period_id)
        REFERENCES public.tenant_prospeccion_usage_periods(tenant_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT tenant_prospeccion_raw_operations_busqueda_id_fkey
        FOREIGN KEY (busqueda_id) REFERENCES public.busquedas(id) ON DELETE RESTRICT,
    CONSTRAINT tenant_prospeccion_raw_operations_busqueda_id_uidx
        UNIQUE (busqueda_id),
    CONSTRAINT tenant_prospeccion_raw_operations_counts_chk
        CHECK (raw_results_consumed >= 0)
);

COMMENT ON TABLE public.tenant_prospeccion_raw_operations IS
    'Operacion idempotente por busqueda DENUE para auditar resultados crudos persistidos y contabilizados.';
COMMENT ON COLUMN public.tenant_prospeccion_raw_operations.raw_results_consumed IS
    'Cantidad real de filas tenant-scoped persistidas en resultados para la busqueda.';

CREATE INDEX tenant_prospeccion_raw_operations_tenant_created_idx
    ON public.tenant_prospeccion_raw_operations (tenant_id, created_at DESC);
CREATE INDEX tenant_prospeccion_raw_operations_period_idx
    ON public.tenant_prospeccion_raw_operations (usage_period_id, created_at DESC);

ALTER TABLE public.tenant_prospeccion_raw_operations ENABLE ROW LEVEL SECURITY;

-- Los resultados crudos se registran al finalizar el trabajo. El contador puede
-- superar el limite por el ultimo lote procesado; la lectura publica deja el
-- saldo en cero y conserva el consumo real para auditoria.
ALTER TABLE public.tenant_prospeccion_usage_periods
    DROP CONSTRAINT tenant_prospeccion_usage_periods_raw_consumed_chk;
ALTER TABLE public.tenant_prospeccion_usage_periods
    ADD CONSTRAINT tenant_prospeccion_usage_periods_raw_consumed_chk
    CHECK (raw_results_consumed >= 0);

CREATE OR REPLACE FUNCTION public.prospeccion_registrar_resultados_denue(
    p_tenant_id uuid,
    p_busqueda_id uuid
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
    v_raw_results_count integer;
    v_period public.tenant_prospeccion_usage_periods%ROWTYPE;
    v_existing public.tenant_prospeccion_raw_operations%ROWTYPE;
BEGIN
    IF p_tenant_id IS NULL OR p_busqueda_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_request_invalid';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('prospeccion_credits_' || p_tenant_id::text));

    SELECT operation.*
    INTO v_existing
    FROM public.tenant_prospeccion_raw_operations AS operation
    WHERE operation.busqueda_id = p_busqueda_id;

    IF FOUND THEN
        IF v_existing.tenant_id <> p_tenant_id THEN
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_search_not_owned';
        END IF;
        SELECT period.*
        INTO v_period
        FROM public.tenant_prospeccion_usage_periods AS period
        WHERE period.tenant_id = p_tenant_id
          AND period.id = v_existing.usage_period_id;

        RETURN jsonb_build_object(
            'ok', true,
            'replayed', true,
            'busqueda_id', p_busqueda_id,
            'raw_results_consumed', v_existing.raw_results_consumed,
            'raw_results_remaining', greatest(
                v_period.raw_results_limit - v_period.raw_results_consumed,
                0
            ),
            'period_start', v_period.period_start,
            'period_end', v_period.period_end
        );
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

    SELECT count(*)::integer
    INTO v_raw_results_count
    FROM public.resultados AS result
    WHERE result.busqueda_id = p_busqueda_id
      AND result.organizacion_id = p_tenant_id
      AND result.fuente = 'denue';

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
               ELSE (
                   date_trunc('month', v_now AT TIME ZONE 'UTC') + interval '1 month'
               ) AT TIME ZONE 'UTC'
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
        tenant_id,
        period_start,
        period_end,
        credits_limit,
        raw_results_limit
    )
    VALUES (
        p_tenant_id,
        v_period_start,
        v_period_end,
        v_credits_limit,
        v_raw_results_limit
    )
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
        tenant_id,
        usage_period_id,
        busqueda_id,
        raw_results_consumed
    )
    VALUES (
        p_tenant_id,
        v_period.id,
        p_busqueda_id,
        v_raw_results_count
    )
    RETURNING * INTO v_existing;

    UPDATE public.tenant_prospeccion_usage_periods
    SET raw_results_consumed = raw_results_consumed + v_raw_results_count
    WHERE tenant_id = p_tenant_id
      AND id = v_period.id
    RETURNING * INTO v_period;

    RETURN jsonb_build_object(
        'ok', true,
        'replayed', false,
        'busqueda_id', p_busqueda_id,
        'raw_results_consumed', v_raw_results_count,
        'raw_results_remaining', greatest(
            v_period.raw_results_limit - v_period.raw_results_consumed,
            0
        ),
        'period_start', v_period.period_start,
        'period_end', v_period.period_end
    );
END;
$function$;

COMMENT ON FUNCTION public.prospeccion_registrar_resultados_denue(uuid, uuid) IS
    'Registra una sola vez los resultados DENUE realmente persistidos para una busqueda tenant-scoped.';

REVOKE ALL ON FUNCTION public.prospeccion_registrar_resultados_denue(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prospeccion_registrar_resultados_denue(uuid, uuid)
    TO service_role;

COMMIT;
