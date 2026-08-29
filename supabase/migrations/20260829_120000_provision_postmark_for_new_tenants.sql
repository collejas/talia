BEGIN;

-- Todo tenant nuevo nace con la estructura operativa de Postmark preparada,
-- pero permanece pendiente y deshabilitado hasta configurar DNS y aprobarlo.
-- El trigger cubre alta administrativa, checkout y cualquier alta futura.
CREATE OR REPLACE FUNCTION public.tg_provision_tenant_email_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_period_start timestamptz := date_trunc('month', now());
    v_period_end timestamptz := date_trunc('month', now()) + interval '1 month';
    v_plan_id uuid;
BEGIN
    INSERT INTO public.tenant_email_migrations (
        organizacion_id,
        status,
        feature_enabled
    ) VALUES (
        NEW.id,
        'pending',
        false
    )
    ON CONFLICT (organizacion_id) DO NOTHING;

    INSERT INTO public.tenant_email_plans (
        organizacion_id,
        plan_code,
        status,
        period_unit,
        period_limit,
        daily_limit,
        overage_allowed,
        starts_at
    ) VALUES (
        NEW.id,
        'included_10000',
        'active',
        'month',
        10000,
        NULL,
        false,
        v_period_start
    )
    ON CONFLICT (organizacion_id, starts_at) DO NOTHING;

    SELECT id
    INTO v_plan_id
    FROM public.tenant_email_plans
    WHERE organizacion_id = NEW.id
      AND starts_at = v_period_start
    LIMIT 1;

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'tenant_email_plan_provision_failed:%', NEW.id;
    END IF;

    INSERT INTO public.tenant_email_usage_periods (
        organizacion_id,
        plan_id,
        period_start,
        period_end
    ) VALUES (
        NEW.id,
        v_plan_id,
        v_period_start,
        v_period_end
    )
    ON CONFLICT (organizacion_id, period_start, period_end) DO NOTHING;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS organizaciones_provision_tenant_email_service
    ON public.organizaciones;
CREATE TRIGGER organizaciones_provision_tenant_email_service
    AFTER INSERT ON public.organizaciones
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_provision_tenant_email_service();

-- Compatibilidad para tenants creados antes de esta migración. No activa
-- Postmark ni modifica dominios, remitentes o configuraciones existentes.
INSERT INTO public.tenant_email_migrations (
    organizacion_id,
    status,
    feature_enabled
)
SELECT o.id, 'pending', false
FROM public.organizaciones AS o
WHERE NOT EXISTS (
    SELECT 1
    FROM public.tenant_email_migrations AS m
    WHERE m.organizacion_id = o.id
);

COMMENT ON FUNCTION public.tg_provision_tenant_email_service() IS
    'Prepara Postmark por tenant nuevo con estado pendiente, plan de 10000 y periodo mensual; no habilita envios.';

COMMIT;
