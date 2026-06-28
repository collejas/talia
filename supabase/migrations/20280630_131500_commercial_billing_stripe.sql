BEGIN;

-- ============================================================================
-- Extensión de organizaciones para alta comercial
-- ============================================================================

ALTER TABLE public.organizaciones
    ADD COLUMN IF NOT EXISTS nombre_comercial text,
    ADD COLUMN IF NOT EXISTS correo_contacto_principal text,
    ADD COLUMN IF NOT EXISTS correo_facturacion text,
    ADD COLUMN IF NOT EXISTS contacto_nombre text,
    ADD COLUMN IF NOT EXISTS contacto_telefono text,
    ADD COLUMN IF NOT EXISTS timezone text,
    ADD COLUMN IF NOT EXISTS idioma text,
    ADD COLUMN IF NOT EXISTS moneda text,
    ADD COLUMN IF NOT EXISTS logo_url text,
    ADD COLUMN IF NOT EXISTS direccion_fiscal text,
    ADD COLUMN IF NOT EXISTS codigo_postal text,
    ADD COLUMN IF NOT EXISTS regimen_fiscal text;

COMMENT ON COLUMN public.organizaciones.nombre_comercial IS 'Nombre comercial o público del tenant.';
COMMENT ON COLUMN public.organizaciones.correo_contacto_principal IS 'Correo principal de contacto operativo del tenant.';
COMMENT ON COLUMN public.organizaciones.correo_facturacion IS 'Correo de facturación del tenant.';
COMMENT ON COLUMN public.organizaciones.contacto_nombre IS 'Nombre del contacto principal del tenant.';
COMMENT ON COLUMN public.organizaciones.contacto_telefono IS 'Teléfono del contacto principal del tenant.';
COMMENT ON COLUMN public.organizaciones.timezone IS 'Zona horaria operativa del tenant.';
COMMENT ON COLUMN public.organizaciones.idioma IS 'Idioma preferido del tenant.';
COMMENT ON COLUMN public.organizaciones.moneda IS 'Moneda principal del tenant.';
COMMENT ON COLUMN public.organizaciones.logo_url IS 'URL del logo o branding principal del tenant.';
COMMENT ON COLUMN public.organizaciones.direccion_fiscal IS 'Dirección fiscal principal del tenant.';
COMMENT ON COLUMN public.organizaciones.codigo_postal IS 'Código postal fiscal o principal del tenant.';
COMMENT ON COLUMN public.organizaciones.regimen_fiscal IS 'Régimen fiscal principal del tenant.';

CREATE INDEX IF NOT EXISTS organizaciones_fecha_alta_idx
    ON public.organizaciones (fecha_alta DESC);

CREATE INDEX IF NOT EXISTS organizaciones_activo_estado_onboarding_fecha_alta_idx
    ON public.organizaciones (activo, estado_onboarding, fecha_alta DESC);

CREATE INDEX IF NOT EXISTS organizaciones_dominio_principal_idx
    ON public.organizaciones (dominio_principal);

-- ============================================================================
-- Planes comerciales
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.commercial_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL,
    name text NOT NULL,
    description text,
    active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT commercial_plans_code_uidx UNIQUE (code),
    CONSTRAINT commercial_plans_code_not_empty_chk CHECK (length(btrim(code)) > 0),
    CONSTRAINT commercial_plans_name_not_empty_chk CHECK (length(btrim(name)) > 0),
    CONSTRAINT commercial_plans_sort_order_nonnegative_chk CHECK (sort_order >= 0)
);

COMMENT ON TABLE public.commercial_plans IS 'Catálogo maestro de planes comerciales vendibles.';
COMMENT ON COLUMN public.commercial_plans.code IS 'Código comercial estable del plan.';
COMMENT ON COLUMN public.commercial_plans.sort_order IS 'Orden de presentación del plan en catálogo.';

-- ============================================================================
-- Precios de plan
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.commercial_plan_prices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL,
    billing_provider text NOT NULL DEFAULT 'stripe',
    provider_product_id text NOT NULL,
    provider_price_id text NOT NULL,
    currency text NOT NULL,
    billing_interval text NOT NULL,
    amount_cents integer NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT commercial_plan_prices_plan_id_fkey
        FOREIGN KEY (plan_id) REFERENCES public.commercial_plans(id) ON DELETE CASCADE,
    CONSTRAINT commercial_plan_prices_provider_price_uidx UNIQUE (provider_price_id),
    CONSTRAINT commercial_plan_prices_provider_price_not_empty_chk CHECK (length(btrim(provider_price_id)) > 0),
    CONSTRAINT commercial_plan_prices_provider_product_not_empty_chk CHECK (length(btrim(provider_product_id)) > 0),
    CONSTRAINT commercial_plan_prices_currency_len_chk CHECK (length(btrim(currency)) = 3),
    CONSTRAINT commercial_plan_prices_interval_chk CHECK (billing_interval IN ('month', 'year', 'one_time', 'custom')),
    CONSTRAINT commercial_plan_prices_amount_nonnegative_chk CHECK (amount_cents >= 0)
);

COMMENT ON TABLE public.commercial_plan_prices IS 'Mapa entre planes comerciales y precios/cobros del proveedor.';
COMMENT ON COLUMN public.commercial_plan_prices.billing_provider IS 'Proveedor de cobro, por defecto Stripe.';
COMMENT ON COLUMN public.commercial_plan_prices.provider_product_id IS 'ID del producto en el proveedor de cobro.';
COMMENT ON COLUMN public.commercial_plan_prices.provider_price_id IS 'ID del precio en el proveedor de cobro.';

CREATE INDEX IF NOT EXISTS commercial_plan_prices_plan_id_idx
    ON public.commercial_plan_prices (plan_id, active);

CREATE INDEX IF NOT EXISTS commercial_plan_prices_provider_product_id_idx
    ON public.commercial_plan_prices (provider_product_id);

-- ============================================================================
-- Entitlements del plan
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.commercial_plan_entitlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL,
    entitlement_key text NOT NULL,
    value_type text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    limit_value numeric,
    value_text text,
    value_json jsonb,
    limit_unit text,
    scope text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT commercial_plan_entitlements_plan_id_fkey
        FOREIGN KEY (plan_id) REFERENCES public.commercial_plans(id) ON DELETE CASCADE,
    CONSTRAINT commercial_plan_entitlements_value_type_chk
        CHECK (value_type IN ('boolean', 'integer', 'decimal', 'text', 'json')),
    CONSTRAINT commercial_plan_entitlements_key_not_empty_chk
        CHECK (length(btrim(entitlement_key)) > 0)
);

COMMENT ON TABLE public.commercial_plan_entitlements IS 'Entitlements y limites del plan con esquema explicito.';
COMMENT ON COLUMN public.commercial_plan_entitlements.entitlement_key IS 'Llave estable del entitlement o limite.';
COMMENT ON COLUMN public.commercial_plan_entitlements.value_type IS 'Tipo del valor: boolean, integer, decimal, text o json.';
COMMENT ON COLUMN public.commercial_plan_entitlements.value_json IS 'Valor estructurado solo para casos excepcionales no centrales.';

CREATE INDEX IF NOT EXISTS commercial_plan_entitlements_plan_id_idx
    ON public.commercial_plan_entitlements (plan_id, entitlement_key);

-- ============================================================================
-- Defaults del plan
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.commercial_plan_defaults (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL,
    default_key text NOT NULL,
    default_value text NOT NULL,
    scope text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT commercial_plan_defaults_plan_id_fkey
        FOREIGN KEY (plan_id) REFERENCES public.commercial_plans(id) ON DELETE CASCADE,
    CONSTRAINT commercial_plan_defaults_key_not_empty_chk
        CHECK (length(btrim(default_key)) > 0)
);

COMMENT ON TABLE public.commercial_plan_defaults IS 'Defaults iniciales que se aplican al aprovisionar un tenant.';

CREATE INDEX IF NOT EXISTS commercial_plan_defaults_plan_id_idx
    ON public.commercial_plan_defaults (plan_id, default_key);

-- ============================================================================
-- Billing del tenant
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_billing_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    billing_provider text NOT NULL DEFAULT 'stripe',
    stripe_customer_id text NOT NULL,
    stripe_subscription_id text,
    stripe_price_id text,
    billing_status text NOT NULL,
    access_status text NOT NULL,
    trial_ends_at timestamptz,
    current_period_start timestamptz,
    current_period_end timestamptz,
    grace_until timestamptz,
    cancel_at_period_end boolean NOT NULL DEFAULT false,
    activated_at timestamptz,
    deactivated_at timestamptz,
    last_stripe_event_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_billing_accounts_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT tenant_billing_accounts_plan_id_fkey
        FOREIGN KEY (plan_id) REFERENCES public.commercial_plans(id),
    CONSTRAINT tenant_billing_accounts_tenant_uidx UNIQUE (tenant_id),
    CONSTRAINT tenant_billing_accounts_stripe_customer_uidx UNIQUE (stripe_customer_id),
    CONSTRAINT tenant_billing_accounts_stripe_subscription_uidx UNIQUE (stripe_subscription_id),
    CONSTRAINT tenant_billing_accounts_billing_status_chk
        CHECK (billing_status IN ('active', 'trialing', 'past_due', 'inactive', 'canceled', 'unpaid', 'incomplete')),
    CONSTRAINT tenant_billing_accounts_access_status_chk
        CHECK (access_status IN ('active', 'grace', 'blocked', 'manual_review', 'internal_free')),
    CONSTRAINT tenant_billing_accounts_stripe_customer_not_empty_chk
        CHECK (length(btrim(stripe_customer_id)) > 0)
);

COMMENT ON TABLE public.tenant_billing_accounts IS 'Estado comercial y de acceso por tenant.';
COMMENT ON COLUMN public.tenant_billing_accounts.billing_status IS 'Estado real del proveedor, por ejemplo Stripe.';
COMMENT ON COLUMN public.tenant_billing_accounts.access_status IS 'Estado decidido por la app para habilitar o bloquear acceso.';

CREATE INDEX IF NOT EXISTS tenant_billing_accounts_plan_status_idx
    ON public.tenant_billing_accounts (tenant_id, billing_status, access_status);

CREATE INDEX IF NOT EXISTS tenant_billing_accounts_customer_idx
    ON public.tenant_billing_accounts (stripe_customer_id);

CREATE INDEX IF NOT EXISTS tenant_billing_accounts_subscription_idx
    ON public.tenant_billing_accounts (stripe_subscription_id);

DROP TRIGGER IF EXISTS tenant_billing_accounts_touch_updated_at ON public.tenant_billing_accounts;
CREATE TRIGGER tenant_billing_accounts_touch_updated_at
    BEFORE UPDATE ON public.tenant_billing_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============================================================================
-- Eventos de billing
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_billing_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    stripe_event_id text NOT NULL,
    stripe_event_type text NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    event_created_at timestamptz,
    processed_at timestamptz,
    processing_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_billing_events_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT tenant_billing_events_stripe_event_uidx UNIQUE (stripe_event_id),
    CONSTRAINT tenant_billing_events_stripe_event_not_empty_chk
        CHECK (length(btrim(stripe_event_id)) > 0),
    CONSTRAINT tenant_billing_events_event_type_not_empty_chk
        CHECK (length(btrim(stripe_event_type)) > 0)
);

COMMENT ON TABLE public.tenant_billing_events IS 'Auditoria e idempotencia de eventos Stripe por tenant.';

CREATE INDEX IF NOT EXISTS tenant_billing_events_tenant_id_idx
    ON public.tenant_billing_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_billing_events_type_idx
    ON public.tenant_billing_events (stripe_event_type, created_at DESC);

-- ============================================================================
-- Overrides por tenant
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_plan_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    override_key text NOT NULL,
    override_value text NOT NULL,
    value_type text NOT NULL,
    reason text,
    starts_at timestamptz,
    ends_at timestamptz,
    created_by uuid,
    approved_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_plan_overrides_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT tenant_plan_overrides_value_type_chk
        CHECK (value_type IN ('boolean', 'integer', 'decimal', 'text', 'json')),
    CONSTRAINT tenant_plan_overrides_key_not_empty_chk
        CHECK (length(btrim(override_key)) > 0),
    CONSTRAINT tenant_plan_overrides_value_not_empty_chk
        CHECK (length(btrim(override_value)) > 0)
);

COMMENT ON TABLE public.tenant_plan_overrides IS 'Excepciones por tenant con vigencia para el plan comercial.';

CREATE INDEX IF NOT EXISTS tenant_plan_overrides_tenant_id_idx
    ON public.tenant_plan_overrides (tenant_id, override_key, starts_at, ends_at);

DROP TRIGGER IF EXISTS tenant_plan_overrides_touch_updated_at ON public.tenant_plan_overrides;
CREATE TRIGGER tenant_plan_overrides_touch_updated_at
    BEFORE UPDATE ON public.tenant_plan_overrides
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============================================================================
-- Jobs de provisioning
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_provisioning_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid,
    source text NOT NULL,
    status text NOT NULL,
    step text NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    started_at timestamptz,
    finished_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_provisioning_jobs_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT tenant_provisioning_jobs_source_not_empty_chk
        CHECK (length(btrim(source)) > 0),
    CONSTRAINT tenant_provisioning_jobs_status_not_empty_chk
        CHECK (length(btrim(status)) > 0),
    CONSTRAINT tenant_provisioning_jobs_step_not_empty_chk
        CHECK (length(btrim(step)) > 0),
    CONSTRAINT tenant_provisioning_jobs_attempts_nonnegative_chk
        CHECK (attempts >= 0)
);

COMMENT ON TABLE public.tenant_provisioning_jobs IS 'Seguimiento de aprovisionamiento del tenant y reintentos.';

CREATE INDEX IF NOT EXISTS tenant_provisioning_jobs_tenant_id_idx
    ON public.tenant_provisioning_jobs (tenant_id, status, created_at DESC);

DROP TRIGGER IF EXISTS tenant_provisioning_jobs_touch_updated_at ON public.tenant_provisioning_jobs;
CREATE TRIGGER tenant_provisioning_jobs_touch_updated_at
    BEFORE UPDATE ON public.tenant_provisioning_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============================================================================
-- Seeds iniciales de planes y precios
-- ============================================================================

WITH seed_plans AS (
    SELECT *
    FROM (VALUES
        ('starter', 'Starter', 'Plan de entrada para activacion inicial', 1),
        ('growth', 'Growth', 'Plan de crecimiento comercial', 2),
        ('pro', 'Pro', 'Plan profesional con mas capacidad', 3),
        ('business', 'Business', 'Plan empresarial para operaciones mayores', 4),
        ('enterprise', 'Enterprise', 'Plan enterprise con control comercial completo', 5)
    ) AS v(code, name, description, sort_order)
),
upsert_plans AS (
    INSERT INTO public.commercial_plans (code, name, description, active, sort_order)
    SELECT code, name, description, true, sort_order
    FROM seed_plans
    ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            active = true,
            sort_order = EXCLUDED.sort_order,
            updated_at = now()
    RETURNING id, code
)
INSERT INTO public.commercial_plan_prices (
    plan_id,
    billing_provider,
    provider_product_id,
    provider_price_id,
    currency,
    billing_interval,
    amount_cents,
    active
)
SELECT
    p.id,
    'stripe',
    'prod_' || p.code,
    'price_' || p.code || '_mxn_monthly',
    'MXN',
    'month',
    CASE p.code
        WHEN 'starter' THEN 100
        WHEN 'growth' THEN 200
        WHEN 'pro' THEN 300
        WHEN 'business' THEN 400
        WHEN 'enterprise' THEN 500
    END,
    true
FROM upsert_plans p
ON CONFLICT (provider_price_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id,
        billing_provider = EXCLUDED.billing_provider,
        provider_product_id = EXCLUDED.provider_product_id,
        currency = EXCLUDED.currency,
        billing_interval = EXCLUDED.billing_interval,
        amount_cents = EXCLUDED.amount_cents,
        active = true,
        updated_at = now();

-- ============================================================================
-- RLS y grants para tablas de plataforma
-- ============================================================================

DO $$
DECLARE
    tbl text;
    policy_name text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'commercial_plans',
        'commercial_plan_prices',
        'commercial_plan_entitlements',
        'commercial_plan_defaults',
        'tenant_billing_accounts',
        'tenant_billing_events',
        'tenant_plan_overrides',
        'tenant_provisioning_jobs'
    ]
    LOOP
        policy_name := tbl || '_service_role_all';
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, tbl);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
            policy_name,
            tbl
        );
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', tbl);
    END LOOP;
END
$$;

-- Organizaciones ya tiene RLS; agregamos acceso explícito para service_role.
DROP POLICY IF EXISTS organizaciones_service_role_all ON public.organizaciones;
CREATE POLICY organizaciones_service_role_all
    ON public.organizaciones
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organizaciones TO service_role;

COMMIT;
