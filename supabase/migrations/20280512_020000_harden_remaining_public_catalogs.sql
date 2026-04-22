-- Hardening for remaining Supabase security advisories.
-- Public reference catalogs get RLS with read-only policies.
-- OpenAI reporting views are switched to security invoker so they honor the caller's privileges.

ALTER VIEW public.v_openai_cost_reconciliation_daily SET (security_invoker = true);
ALTER VIEW public.v_openai_tenant_measurement_audit SET (security_invoker = true);

ALTER TABLE public.geo_paises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_estados_mexico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_municipios_mexico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_ladas_mexico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disposable_email_domains ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.openai_pricing_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.openai_projects_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.openai_assistants_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.openai_cost_api_buckets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'geo_paises'
          AND policyname = 'geo_paises_select_authenticated'
    ) THEN
        CREATE POLICY geo_paises_select_authenticated
            ON public.geo_paises
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'geo_estados_mexico'
          AND policyname = 'geo_estados_mexico_select_authenticated'
    ) THEN
        CREATE POLICY geo_estados_mexico_select_authenticated
            ON public.geo_estados_mexico
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'geo_municipios_mexico'
          AND policyname = 'geo_municipios_mexico_select_authenticated'
    ) THEN
        CREATE POLICY geo_municipios_mexico_select_authenticated
            ON public.geo_municipios_mexico
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'geo_ladas_mexico'
          AND policyname = 'geo_ladas_mexico_select_authenticated'
    ) THEN
        CREATE POLICY geo_ladas_mexico_select_authenticated
            ON public.geo_ladas_mexico
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'disposable_email_domains'
          AND policyname = 'disposable_email_domains_select_authenticated'
    ) THEN
        CREATE POLICY disposable_email_domains_select_authenticated
            ON public.disposable_email_domains
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'openai_pricing_catalog'
          AND policyname = 'openai_pricing_catalog_select_admin'
    ) THEN
        CREATE POLICY openai_pricing_catalog_select_admin
            ON public.openai_pricing_catalog
            FOR SELECT
            TO authenticated
            USING (public.es_admin(auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'openai_projects_catalog'
          AND policyname = 'openai_projects_catalog_select_admin'
    ) THEN
        CREATE POLICY openai_projects_catalog_select_admin
            ON public.openai_projects_catalog
            FOR SELECT
            TO authenticated
            USING (public.es_admin(auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'openai_assistants_catalog'
          AND policyname = 'openai_assistants_catalog_select_admin'
    ) THEN
        CREATE POLICY openai_assistants_catalog_select_admin
            ON public.openai_assistants_catalog
            FOR SELECT
            TO authenticated
            USING (public.es_admin(auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'openai_cost_api_buckets'
          AND policyname = 'openai_cost_api_buckets_select_admin'
    ) THEN
        CREATE POLICY openai_cost_api_buckets_select_admin
            ON public.openai_cost_api_buckets
            FOR SELECT
            TO authenticated
            USING (public.es_admin(auth.uid()));
    END IF;

END
$$;
