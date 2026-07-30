BEGIN;

CREATE OR REPLACE FUNCTION public.admin_set_prospeccion_plan_limits(
    p_actor_id uuid,
    p_plan_id uuid,
    p_credits_month integer,
    p_denue_raw_results_month integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.platform_admins AS admin
        WHERE admin.user_id = p_actor_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'platform_admin_required';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.commercial_plans AS plan WHERE plan.id = p_plan_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'commercial_plan_not_found';
    END IF;
    IF p_credits_month < 0 OR p_denue_raw_results_month < 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_limit_invalid';
    END IF;

    INSERT INTO public.commercial_plan_entitlements (
        plan_id,
        entitlement_key,
        value_type,
        enabled,
        limit_value,
        limit_unit,
        scope
    )
    VALUES
        (
            p_plan_id,
            'limit.prospeccion.credits_month',
            'integer',
            true,
            p_credits_month,
            'credits',
            'tenant_month'
        ),
        (
            p_plan_id,
            'limit.prospeccion.denue_raw_results_month',
            'integer',
            true,
            p_denue_raw_results_month,
            'raw_results',
            'tenant_month'
        )
    ON CONFLICT (plan_id, entitlement_key)
    DO UPDATE SET
        value_type = EXCLUDED.value_type,
        enabled = EXCLUDED.enabled,
        limit_value = EXCLUDED.limit_value,
        value_text = NULL,
        value_json = NULL,
        limit_unit = EXCLUDED.limit_unit,
        scope = EXCLUDED.scope;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_tenant_prospeccion_limits(
    p_actor_id uuid,
    p_tenant_id uuid,
    p_required_contact_mode text,
    p_credits_month_override integer,
    p_denue_raw_results_month_override integer,
    p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_now timestamptz := clock_timestamp();
    v_plan_id uuid;
    v_plan_credits integer;
    v_plan_raw integer;
    v_effective_credits integer;
    v_effective_raw integer;
    v_period public.tenant_prospeccion_usage_periods%ROWTYPE;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.platform_admins AS admin
        WHERE admin.user_id = p_actor_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'platform_admin_required';
    END IF;
    IF p_required_contact_mode NOT IN ('any', 'phone', 'email', 'both') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_policy_invalid';
    END IF;
    IF coalesce(p_credits_month_override, 0) < 0
       OR coalesce(p_denue_raw_results_month_override, 0) < 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_limit_invalid';
    END IF;
    IF (p_credits_month_override IS NOT NULL OR p_denue_raw_results_month_override IS NOT NULL)
       AND nullif(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_override_reason_required';
    END IF;

    SELECT billing.plan_id
    INTO v_plan_id
    FROM public.tenant_billing_accounts AS billing
    WHERE billing.tenant_id = p_tenant_id;

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_plan_not_configured';
    END IF;

    SELECT entitlement.limit_value::integer
    INTO v_plan_credits
    FROM public.commercial_plan_entitlements AS entitlement
    WHERE entitlement.plan_id = v_plan_id
      AND entitlement.entitlement_key = 'limit.prospeccion.credits_month'
      AND entitlement.enabled = true
      AND entitlement.limit_value >= 0
      AND entitlement.limit_value = trunc(entitlement.limit_value)
    LIMIT 1;

    SELECT entitlement.limit_value::integer
    INTO v_plan_raw
    FROM public.commercial_plan_entitlements AS entitlement
    WHERE entitlement.plan_id = v_plan_id
      AND entitlement.entitlement_key = 'limit.prospeccion.denue_raw_results_month'
      AND entitlement.enabled = true
      AND entitlement.limit_value >= 0
      AND entitlement.limit_value = trunc(entitlement.limit_value)
    LIMIT 1;

    IF v_plan_credits IS NULL OR v_plan_raw IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'prospeccion_credits_not_configured';
    END IF;

    v_effective_credits := coalesce(p_credits_month_override, v_plan_credits);
    v_effective_raw := coalesce(p_denue_raw_results_month_override, v_plan_raw);

    SELECT period.*
    INTO v_period
    FROM public.tenant_prospeccion_usage_periods AS period
    WHERE period.tenant_id = p_tenant_id
      AND period.period_start <= v_now
      AND v_now < period.period_end
    FOR UPDATE;

    IF v_period.id IS NOT NULL
       AND (
           v_effective_credits < v_period.credits_consumed
           OR v_effective_raw < v_period.raw_results_consumed
       ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'prospeccion_limit_below_current_usage';
    END IF;

    INSERT INTO public.tenant_prospeccion_policies (
        tenant_id,
        required_contact_mode,
        effective_from,
        updated_by
    )
    VALUES (
        p_tenant_id,
        p_required_contact_mode,
        v_now,
        CASE
            WHEN EXISTS (
                SELECT 1 FROM public.usuarios AS usuario WHERE usuario.id = p_actor_id
            ) THEN p_actor_id
            ELSE NULL
        END
    )
    ON CONFLICT (tenant_id)
    DO UPDATE SET
        required_contact_mode = EXCLUDED.required_contact_mode,
        effective_from = EXCLUDED.effective_from,
        updated_by = EXCLUDED.updated_by;

    UPDATE public.tenant_plan_overrides
    SET ends_at = v_now
    WHERE tenant_id = p_tenant_id
      AND override_key IN (
          'limit.prospeccion.credits_month',
          'limit.prospeccion.denue_raw_results_month'
      )
      AND ends_at IS NULL;

    IF p_credits_month_override IS NOT NULL THEN
        INSERT INTO public.tenant_plan_overrides (
            tenant_id,
            override_key,
            override_value,
            value_type,
            reason,
            starts_at,
            created_by,
            approved_by
        )
        VALUES (
            p_tenant_id,
            'limit.prospeccion.credits_month',
            p_credits_month_override::text,
            'integer',
            btrim(p_reason),
            v_now,
            p_actor_id,
            p_actor_id
        );
    END IF;

    IF p_denue_raw_results_month_override IS NOT NULL THEN
        INSERT INTO public.tenant_plan_overrides (
            tenant_id,
            override_key,
            override_value,
            value_type,
            reason,
            starts_at,
            created_by,
            approved_by
        )
        VALUES (
            p_tenant_id,
            'limit.prospeccion.denue_raw_results_month',
            p_denue_raw_results_month_override::text,
            'integer',
            btrim(p_reason),
            v_now,
            p_actor_id,
            p_actor_id
        );
    END IF;

    IF v_period.id IS NOT NULL THEN
        UPDATE public.tenant_prospeccion_usage_periods
        SET credits_limit = v_effective_credits,
            raw_results_limit = v_effective_raw
        WHERE tenant_id = p_tenant_id
          AND id = v_period.id;
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_prospeccion_plan_limits(
    uuid,
    uuid,
    integer,
    integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_prospeccion_plan_limits(
    uuid,
    uuid,
    integer,
    integer
) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_tenant_prospeccion_limits(
    uuid,
    uuid,
    text,
    integer,
    integer,
    text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_tenant_prospeccion_limits(
    uuid,
    uuid,
    text,
    integer,
    integer,
    text
) TO service_role;

COMMENT ON FUNCTION public.admin_set_prospeccion_plan_limits(uuid, uuid, integer, integer) IS
    'Actualiza los limites base de prospeccion de un plan comercial; solo platform admins.';
COMMENT ON FUNCTION public.admin_set_tenant_prospeccion_limits(uuid, uuid, text, integer, integer, text) IS
    'Actualiza politica y overrides de prospeccion de un tenant, incluyendo su periodo activo; solo platform admins.';

COMMIT;
