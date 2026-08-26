-- Modalidades Tal-IA Llave en Mano y licencia posterior.
-- Esta migración prepara el catálogo; los price_id reales de Stripe se vinculan
-- desde la operación comercial después de crear los precios en Stripe Test/Live.

ALTER TABLE public.commercial_plans
    ADD COLUMN IF NOT EXISTS contract_duration_months smallint,
    ADD COLUMN IF NOT EXISTS max_installment_count smallint,
    ADD COLUMN IF NOT EXISTS pricing_model text NOT NULL DEFAULT 'legacy';

ALTER TABLE public.commercial_plans
    DROP CONSTRAINT IF EXISTS commercial_plans_duration_chk,
    DROP CONSTRAINT IF EXISTS commercial_plans_max_installments_chk,
    DROP CONSTRAINT IF EXISTS commercial_plans_pricing_model_chk;

ALTER TABLE public.commercial_plans
    ADD CONSTRAINT commercial_plans_duration_chk
        CHECK (contract_duration_months IS NULL OR contract_duration_months IN (1, 3, 6, 9, 12)),
    ADD CONSTRAINT commercial_plans_max_installments_chk
        CHECK (max_installment_count IS NULL OR max_installment_count IN (1, 3, 6, 9, 12)),
    ADD CONSTRAINT commercial_plans_pricing_model_chk
        CHECK (pricing_model IN ('legacy', 'one_time_plus_license'));

COMMENT ON COLUMN public.commercial_plans.contract_duration_months IS
    'Meses de servicio incluidos en la modalidad de contratación.';
COMMENT ON COLUMN public.commercial_plans.max_installment_count IS
    'Máximo de MSI permitido para la modalidad; las opciones se derivan de 1, 3, 6, 9 y 12.';
COMMENT ON COLUMN public.commercial_plans.pricing_model IS
    'Modelo comercial explícito de la modalidad.';

CREATE TABLE IF NOT EXISTS public.commercial_license_prices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL,
    name text NOT NULL,
    billing_provider text NOT NULL DEFAULT 'stripe',
    provider_product_id text NOT NULL,
    provider_price_id text NOT NULL,
    currency text NOT NULL,
    billing_interval text NOT NULL DEFAULT 'month',
    amount_cents integer NOT NULL,
    active boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT commercial_license_prices_code_uidx UNIQUE (code),
    CONSTRAINT commercial_license_prices_provider_price_uidx UNIQUE (provider_price_id),
    CONSTRAINT commercial_license_prices_currency_chk CHECK (length(btrim(currency)) = 3),
    CONSTRAINT commercial_license_prices_interval_chk CHECK (billing_interval = 'month'),
    CONSTRAINT commercial_license_prices_amount_chk CHECK (amount_cents > 0)
);

CREATE INDEX IF NOT EXISTS commercial_license_prices_active_idx
    ON public.commercial_license_prices (active, code);

COMMENT ON TABLE public.commercial_license_prices IS
    'Precios recurrentes de licencia que comienzan después de una modalidad llave en mano.';

ALTER TABLE public.tenant_billing_accounts
    ADD COLUMN IF NOT EXISTS contract_duration_months smallint,
    ADD COLUMN IF NOT EXISTS selected_installment_count smallint NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS upfront_payment_intent_id text,
    ADD COLUMN IF NOT EXISTS contract_started_at timestamptz,
    ADD COLUMN IF NOT EXISTS contract_ends_at timestamptz,
    ADD COLUMN IF NOT EXISTS license_price_id uuid,
    ADD COLUMN IF NOT EXISTS license_starts_at timestamptz,
    ADD COLUMN IF NOT EXISTS license_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.tenant_billing_accounts
    DROP CONSTRAINT IF EXISTS tenant_billing_accounts_duration_chk,
    DROP CONSTRAINT IF EXISTS tenant_billing_accounts_installment_chk,
    DROP CONSTRAINT IF EXISTS tenant_billing_accounts_license_status_chk,
    ADD CONSTRAINT tenant_billing_accounts_duration_chk
        CHECK (contract_duration_months IS NULL OR contract_duration_months IN (1, 3, 6, 9, 12)),
    ADD CONSTRAINT tenant_billing_accounts_installment_chk
        CHECK (selected_installment_count IN (1, 3, 6, 9, 12)),
    ADD CONSTRAINT tenant_billing_accounts_license_status_chk
        CHECK (license_status IN ('pending', 'scheduled', 'active', 'past_due', 'canceled', 'blocked'));

ALTER TABLE public.tenant_billing_accounts
    ADD CONSTRAINT tenant_billing_accounts_license_price_fkey
        FOREIGN KEY (license_price_id) REFERENCES public.commercial_license_prices(id);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_billing_accounts_payment_intent_uidx
    ON public.tenant_billing_accounts (upfront_payment_intent_id)
    WHERE upfront_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_billing_accounts_license_schedule_idx
    ON public.tenant_billing_accounts (license_status, license_starts_at);

DROP TRIGGER IF EXISTS commercial_license_prices_touch_updated_at ON public.commercial_license_prices;
CREATE TRIGGER commercial_license_prices_touch_updated_at
    BEFORE UPDATE ON public.commercial_license_prices
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

WITH desired_modalities(code, name, description, duration, max_installments, amount_cents, sort_order) AS (
    VALUES
        ('llave_mano_pago_unico', 'Tal-IA Llave en Mano - Pago único', 'Configuración y 1 mes de licencia incluidos.', 1, 1, 2650000, 1),
        ('llave_mano_3_meses', 'Tal-IA Llave en Mano — 3 meses', 'Configuración y 3 meses de licencia incluidos.', 3, 3, 2938750, 2),
        ('llave_mano_6_meses', 'Tal-IA Llave en Mano — 6 meses', 'Configuración y 6 meses de licencia incluidos.', 6, 6, 3355000, 3),
        ('llave_mano_9_meses', 'Tal-IA Llave en Mano — 9 meses', 'Configuración y 9 meses de licencia incluidos.', 9, 9, 3715000, 4),
        ('llave_mano_12_meses', 'Tal-IA Llave en Mano — 12 meses', 'Configuración y 12 meses de licencia incluidos.', 12, 12, 4030000, 5)
), upserted AS (
    INSERT INTO public.commercial_plans (
        code, name, description, active, sort_order, contract_duration_months,
        max_installment_count, pricing_model
    )
    SELECT code, name, description, true, sort_order, duration, max_installments, 'one_time_plus_license'
    FROM desired_modalities
    ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        active = true,
        sort_order = EXCLUDED.sort_order,
        contract_duration_months = EXCLUDED.contract_duration_months,
        max_installment_count = EXCLUDED.max_installment_count,
        pricing_model = EXCLUDED.pricing_model,
        updated_at = now()
    RETURNING id, code
)
INSERT INTO public.commercial_plan_prices (
    plan_id, billing_provider, provider_product_id, provider_price_id,
    currency, billing_interval, amount_cents, active
)
SELECT
    p.id,
    'stripe',
    'pending_' || p.code || '_product',
    'pending_' || p.code || '_price',
    'MXN',
    'one_time',
    d.amount_cents,
    false
FROM upserted p
JOIN desired_modalities d ON d.code = p.code
ON CONFLICT (provider_price_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    currency = EXCLUDED.currency,
    billing_interval = EXCLUDED.billing_interval,
    amount_cents = EXCLUDED.amount_cents,
    active = false,
    updated_at = now();

UPDATE public.commercial_plans
SET active = false, updated_at = now()
WHERE pricing_model = 'legacy'
  AND code IN ('starter', 'growth', 'pro', 'business', 'enterprise');

INSERT INTO public.commercial_license_prices (
    code, name, provider_product_id, provider_price_id, currency, billing_interval, amount_cents, active
)
VALUES (
    'talia_license_monthly',
    'Licencia Tal-IA',
    'pending_talia_license_product',
    'pending_talia_license_monthly_price',
    'MXN',
    'month',
    150000,
    false
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    currency = EXCLUDED.currency,
    billing_interval = EXCLUDED.billing_interval,
    amount_cents = EXCLUDED.amount_cents,
    active = false,
    updated_at = now();

ALTER TABLE public.commercial_license_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS commercial_license_prices_service_role_all ON public.commercial_license_prices;
CREATE POLICY commercial_license_prices_service_role_all
    ON public.commercial_license_prices
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.commercial_license_prices TO service_role;
