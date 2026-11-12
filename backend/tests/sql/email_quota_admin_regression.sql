-- Ejecutar como postgres. Todas las modificaciones se revierten al terminar.
BEGIN;
SET LOCAL ROLE service_role;

DO $$
DECLARE
    v_org uuid := '00000000-0000-0000-0000-000000000001';
    v_actor uuid;
    v_first record;
    v_second record;
    v_audits bigint;
    v_usage bigint;
BEGIN
    SELECT id INTO STRICT v_actor FROM public.usuarios
    WHERE organizacion_id = v_org ORDER BY id LIMIT 1;
    SELECT count(*) INTO v_audits FROM public.tenant_email_quota_changes
    WHERE organizacion_id = v_org;
    SELECT count(*) INTO v_usage FROM public.tenant_email_usage_periods
    WHERE organizacion_id = v_org;

    SELECT * INTO STRICT v_first FROM public.tenant_email_admin_set_quota(
        v_org, 10001, v_actor, 'Prueba reversible de cuota: primer ajuste'
    );
    SELECT * INTO STRICT v_second FROM public.tenant_email_admin_set_quota(
        v_org, 20001, v_actor, 'Prueba reversible de cuota: segundo ajuste'
    );
    ASSERT v_first.new_period_limit = 10001;
    ASSERT v_second.previous_period_limit = 10001;
    ASSERT v_second.new_period_limit = 20001;
    ASSERT v_first.plan_id = v_second.plan_id;
    ASSERT (SELECT period_limit = 20001 FROM public.tenant_email_plans
            WHERE id = v_second.plan_id AND organizacion_id = v_org);
    ASSERT (SELECT count(*) = v_audits + 2 FROM public.tenant_email_quota_changes
            WHERE organizacion_id = v_org);
    ASSERT (SELECT count(*) = 1 FROM public.tenant_email_usage_periods
            WHERE organizacion_id = v_org AND period_start = v_first.period_start
              AND period_end = v_first.period_end);
    ASSERT (SELECT count(*) <= v_usage + 1 FROM public.tenant_email_usage_periods
            WHERE organizacion_id = v_org);
    ASSERT NOT has_function_privilege('anon',
        'public.tenant_email_admin_set_quota(uuid,integer,uuid,text)', 'execute');
    ASSERT NOT has_function_privilege('authenticated',
        'public.tenant_email_admin_set_quota(uuid,integer,uuid,text)', 'execute');
END;
$$;

RESET ROLE;
SELECT 'email_quota_admin_regression_ok' AS result;
ROLLBACK;
