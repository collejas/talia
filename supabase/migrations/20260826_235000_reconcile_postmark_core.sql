BEGIN;

-- Reconciliación de 20260812_130000_email_service_core.
-- La estructura ya existe en Supabase; esta migración no recrea tablas ni
-- reejecuta DDL destructivo. Solo certifica los objetos mínimos esperados.
DO $function$
DECLARE
    v_expected_tables constant text[] := ARRAY[
        'tenant_email_migrations',
        'tenant_email_domains',
        'tenant_email_plans',
        'tenant_email_usage_periods',
        'tenant_email_usage_events',
        'tenant_email_templates',
        'tenant_email_messages',
        'tenant_email_message_attempts',
        'tenant_email_events',
        'tenant_email_webhook_receipts',
        'tenant_email_suppressions'
    ];
    v_table_name text;
    v_missing_tables integer;
    v_unprotected_tables integer;
BEGIN
    SELECT count(*) INTO v_missing_tables
    FROM unnest(v_expected_tables) AS expected(table_name)
    WHERE to_regclass(format('public.%I', expected.table_name)) IS NULL;
    IF v_missing_tables > 0 THEN
        RAISE EXCEPTION 'postmark_core_reconciliation_missing_tables:%', v_missing_tables;
    END IF;

    SELECT count(*) INTO v_unprotected_tables
    FROM unnest(v_expected_tables) AS expected(table_name)
    JOIN pg_class c ON c.oid = to_regclass(format('public.%I', expected.table_name))
    WHERE c.relrowsecurity IS NOT TRUE OR c.relforcerowsecurity IS NOT TRUE;
    IF v_unprotected_tables > 0 THEN
        RAISE EXCEPTION 'postmark_core_reconciliation_rls_incomplete:%', v_unprotected_tables;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.tenant_email_migrations
        WHERE organizacion_id = '00000000-0000-0000-0000-000000000001'
          AND status = 'pending'
          AND feature_enabled = false
    ) THEN
        RAISE EXCEPTION 'postmark_core_reconciliation_master_tenant_invalid';
    END IF;

    FOREACH v_table_name IN ARRAY v_expected_tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = v_table_name
              AND policyname = v_table_name || '_member_select'
        ) THEN
            RAISE EXCEPTION 'postmark_core_reconciliation_policy_missing:%', v_table_name;
        END IF;
    END LOOP;
END;
$function$;

COMMIT;
