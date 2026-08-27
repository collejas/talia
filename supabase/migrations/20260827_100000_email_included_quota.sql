BEGIN;

-- Cuota inicial comercial: cada tenant recibe 10,000 correos mensuales.
-- El entitlement comercial describe lo incluido en el plan; las tablas
-- tenant_email_* materializan la cuota operativa y su periodo de consumo.

INSERT INTO public.commercial_plan_entitlements (
    plan_id,
    entitlement_key,
    value_type,
    enabled,
    limit_value,
    limit_unit,
    scope
)
SELECT
    id,
    'limit.email.messages_month',
    'integer',
    true,
    10000,
    'messages',
    'tenant_month'
FROM public.commercial_plans
WHERE active = true
ON CONFLICT (plan_id, entitlement_key) DO UPDATE
SET value_type = EXCLUDED.value_type,
    enabled = EXCLUDED.enabled,
    limit_value = EXCLUDED.limit_value,
    limit_unit = EXCLUDED.limit_unit,
    scope = EXCLUDED.scope;

WITH current_period AS (
    SELECT date_trunc('month', now()) AS period_start,
           date_trunc('month', now()) + interval '1 month' AS period_end
), inserted_plans AS (
    INSERT INTO public.tenant_email_plans (
        organizacion_id,
        plan_code,
        status,
        period_unit,
        period_limit,
        daily_limit,
        overage_allowed,
        starts_at
    )
    SELECT
        o.id,
        'included_10000',
        'active',
        'month',
        10000,
        NULL,
        false,
        current_period.period_start
    FROM public.organizaciones o
    CROSS JOIN current_period
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.tenant_email_plans existing
        WHERE existing.organizacion_id = o.id
          AND existing.starts_at = current_period.period_start
    )
    RETURNING id, organizacion_id, starts_at
)
INSERT INTO public.tenant_email_usage_periods (
    organizacion_id,
    plan_id,
    period_start,
    period_end
)
SELECT
    inserted_plans.organizacion_id,
    inserted_plans.id,
    inserted_plans.starts_at,
    inserted_plans.starts_at + interval '1 month'
FROM inserted_plans
ON CONFLICT (organizacion_id, period_start, period_end) DO NOTHING;

-- Si la migración se reejecuta después de que ya existan los planes, también
-- garantiza el periodo mensual actual sin duplicarlo.
INSERT INTO public.tenant_email_usage_periods (
    organizacion_id,
    plan_id,
    period_start,
    period_end
)
SELECT
    plan.organizacion_id,
    plan.id,
    date_trunc('month', now()),
    date_trunc('month', now()) + interval '1 month'
FROM public.tenant_email_plans plan
WHERE plan.status = 'active'
  AND plan.starts_at = date_trunc('month', now())
ON CONFLICT (organizacion_id, period_start, period_end) DO NOTHING;

COMMIT;
