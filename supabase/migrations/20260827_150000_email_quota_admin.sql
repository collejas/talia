BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_email_quota_changes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    email_plan_id uuid NOT NULL REFERENCES public.tenant_email_plans(id) ON DELETE RESTRICT,
    previous_period_limit integer,
    new_period_limit integer NOT NULL,
    reason text NOT NULL,
    changed_by uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    changed_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_email_quota_changes_previous_limit_check CHECK (
        previous_period_limit IS NULL OR previous_period_limit >= 0
    ),
    CONSTRAINT tenant_email_quota_changes_new_limit_check CHECK (new_period_limit >= 0)
);

CREATE INDEX IF NOT EXISTS tenant_email_quota_changes_org_date_idx
    ON public.tenant_email_quota_changes (organizacion_id, changed_at DESC);

ALTER TABLE public.tenant_email_quota_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_email_quota_changes FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.tenant_email_admin_set_quota(
    p_organizacion_id uuid,
    p_period_limit integer,
    p_changed_by uuid,
    p_reason text
)
RETURNS TABLE (
    plan_id uuid,
    period_start timestamptz,
    period_end timestamptz,
    previous_period_limit integer,
    new_period_limit integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_period_start timestamptz := date_trunc('month', now());
    v_period_end timestamptz := date_trunc('month', now()) + interval '1 month';
    v_plan_id uuid;
    v_previous_limit integer;
BEGIN
    IF p_period_limit IS NULL OR p_period_limit < 0 OR p_period_limit > 100000000 THEN
        RAISE EXCEPTION 'invalid_email_quota' USING ERRCODE = '22023';
    END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) < 3 OR length(btrim(p_reason)) > 500 THEN
        RAISE EXCEPTION 'invalid_email_quota_reason' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.organizaciones WHERE id = p_organizacion_id) THEN
        RAISE EXCEPTION 'email_tenant_not_found' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = p_changed_by) THEN
        RAISE EXCEPTION 'email_actor_not_found' USING ERRCODE = 'foreign_key_violation';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('tenant_email_quota:' || p_organizacion_id::text, 0));

    SELECT id, period_limit
    INTO v_plan_id, v_previous_limit
    FROM public.tenant_email_plans
    WHERE organizacion_id = p_organizacion_id
      AND starts_at = v_period_start
      AND status = 'active'
    FOR UPDATE;

    IF v_plan_id IS NULL THEN
        INSERT INTO public.tenant_email_plans (
            organizacion_id, plan_code, status, period_unit, period_limit,
            daily_limit, overage_allowed, starts_at
        ) VALUES (
            p_organizacion_id, 'included_custom', 'active', 'month', p_period_limit,
            NULL, false, v_period_start
        )
        RETURNING id INTO v_plan_id;
    ELSE
        UPDATE public.tenant_email_plans
        SET period_limit = p_period_limit,
            updated_at = now()
        WHERE id = v_plan_id;
    END IF;

    INSERT INTO public.tenant_email_usage_periods (
        organizacion_id, plan_id, period_start, period_end
    ) VALUES (
        p_organizacion_id, v_plan_id, v_period_start, v_period_end
    ) ON CONFLICT (organizacion_id, period_start, period_end) DO NOTHING;

    INSERT INTO public.tenant_email_quota_changes (
        organizacion_id, email_plan_id, previous_period_limit,
        new_period_limit, reason, changed_by
    ) VALUES (
        p_organizacion_id, v_plan_id, v_previous_limit,
        p_period_limit, btrim(p_reason), p_changed_by
    );

    RETURN QUERY SELECT v_plan_id, v_period_start, v_period_end,
                        v_previous_limit, p_period_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_email_admin_set_quota(uuid, integer, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_email_admin_set_quota(uuid, integer, uuid, text) TO service_role;

COMMIT;
