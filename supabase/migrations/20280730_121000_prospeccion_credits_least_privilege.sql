BEGIN;

-- Supabase puede aplicar privilegios por defecto a service_role al crear tablas.
-- Se revocan de forma explicita antes de conceder el minimo requerido.

REVOKE ALL ON TABLE public.tenant_prospeccion_policies
    FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tenant_prospeccion_usage_periods
    FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tenant_prospeccion_credit_operations
    FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tenant_prospeccion_credit_ledger
    FROM anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.tenant_prospeccion_policies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.tenant_prospeccion_usage_periods TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.tenant_prospeccion_credit_operations TO service_role;
GRANT SELECT, INSERT
    ON TABLE public.tenant_prospeccion_credit_ledger TO service_role;

COMMIT;
