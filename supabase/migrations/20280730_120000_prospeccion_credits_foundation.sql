BEGIN;

-- ============================================================================
-- Fundacion comercial para creditos de prospeccion DENUE
-- ============================================================================

CREATE TABLE public.tenant_prospeccion_policies (
    tenant_id uuid PRIMARY KEY,
    required_contact_mode text NOT NULL DEFAULT 'any',
    effective_from timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid,
    CONSTRAINT tenant_prospeccion_policies_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT tenant_prospeccion_policies_updated_by_fkey
        FOREIGN KEY (updated_by) REFERENCES public.usuarios(id) ON DELETE SET NULL,
    CONSTRAINT tenant_prospeccion_policies_contact_mode_chk
        CHECK (required_contact_mode IN ('any', 'phone', 'email', 'both'))
);

COMMENT ON TABLE public.tenant_prospeccion_policies IS
    'Politica explicita por tenant para definir el contacto minimo requerido al guardar prospectos.';
COMMENT ON COLUMN public.tenant_prospeccion_policies.required_contact_mode IS
    'Criterio de elegibilidad: any, phone, email o both. Todos consumen un credito por prospecto nuevo.';
COMMENT ON COLUMN public.tenant_prospeccion_policies.effective_from IS
    'Instante desde el que aplica la version actual de la politica.';

CREATE INDEX tenant_prospeccion_policies_updated_by_idx
    ON public.tenant_prospeccion_policies (updated_by)
    WHERE updated_by IS NOT NULL;

DROP TRIGGER IF EXISTS tenant_prospeccion_policies_touch_updated_at
    ON public.tenant_prospeccion_policies;
CREATE TRIGGER tenant_prospeccion_policies_touch_updated_at
    BEFORE UPDATE ON public.tenant_prospeccion_policies
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============================================================================
-- Periodos de consumo
-- ============================================================================

CREATE TABLE public.tenant_prospeccion_usage_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    period_start timestamptz NOT NULL,
    period_end timestamptz NOT NULL,
    credits_limit integer NOT NULL,
    credits_consumed integer NOT NULL DEFAULT 0,
    raw_results_limit integer NOT NULL,
    raw_results_consumed integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_prospeccion_usage_periods_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT tenant_prospeccion_usage_periods_tenant_id_id_uidx
        UNIQUE (tenant_id, id),
    CONSTRAINT tenant_prospeccion_usage_periods_tenant_period_uidx
        UNIQUE (tenant_id, period_start, period_end),
    CONSTRAINT tenant_prospeccion_usage_periods_period_chk
        CHECK (period_end > period_start),
    CONSTRAINT tenant_prospeccion_usage_periods_credits_limit_chk
        CHECK (credits_limit >= 0),
    CONSTRAINT tenant_prospeccion_usage_periods_credits_consumed_chk
        CHECK (credits_consumed >= 0 AND credits_consumed <= credits_limit),
    CONSTRAINT tenant_prospeccion_usage_periods_raw_limit_chk
        CHECK (raw_results_limit >= 0),
    CONSTRAINT tenant_prospeccion_usage_periods_raw_consumed_chk
        CHECK (raw_results_consumed >= 0 AND raw_results_consumed <= raw_results_limit),
    CONSTRAINT tenant_prospeccion_usage_periods_no_overlap_excl
        EXCLUDE USING gist (
            tenant_id WITH =,
            tstzrange(period_start, period_end, '[)') WITH &&
        )
);

COMMENT ON TABLE public.tenant_prospeccion_usage_periods IS
    'Snapshot por periodo del limite y consumo de creditos y resultados crudos de prospeccion.';
COMMENT ON COLUMN public.tenant_prospeccion_usage_periods.credits_limit IS
    'Limite efectivo congelado para el periodo, resuelto desde plan y override.';
COMMENT ON COLUMN public.tenant_prospeccion_usage_periods.credits_consumed IS
    'Contador transaccional reconciliable contra el ledger.';
COMMENT ON COLUMN public.tenant_prospeccion_usage_periods.raw_results_limit IS
    'Limite tecnico de resultados crudos persistidos durante el periodo.';

CREATE INDEX tenant_prospeccion_usage_periods_tenant_active_idx
    ON public.tenant_prospeccion_usage_periods (tenant_id, period_start DESC, period_end DESC);

DROP TRIGGER IF EXISTS tenant_prospeccion_usage_periods_touch_updated_at
    ON public.tenant_prospeccion_usage_periods;
CREATE TRIGGER tenant_prospeccion_usage_periods_touch_updated_at
    BEFORE UPDATE ON public.tenant_prospeccion_usage_periods
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============================================================================
-- Operaciones idempotentes de guardado
-- ============================================================================

CREATE TABLE public.tenant_prospeccion_credit_operations (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    usage_period_id uuid NOT NULL,
    request_hash text NOT NULL,
    status text NOT NULL DEFAULT 'processing',
    source text NOT NULL DEFAULT 'denue',
    required_contact_mode text NOT NULL,
    requested_count integer NOT NULL DEFAULT 0,
    eligible_contact_count integer NOT NULL DEFAULT 0,
    missing_required_contact_count integer NOT NULL DEFAULT 0,
    batch_duplicate_count integer NOT NULL DEFAULT 0,
    tenant_duplicate_count integer NOT NULL DEFAULT 0,
    saved_count integer NOT NULL DEFAULT 0,
    credits_consumed integer NOT NULL DEFAULT 0,
    omitted_by_limit_count integer NOT NULL DEFAULT 0,
    credits_remaining integer,
    error_code text,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CONSTRAINT tenant_prospeccion_credit_operations_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT tenant_prospeccion_credit_operations_period_fkey
        FOREIGN KEY (tenant_id, usage_period_id)
        REFERENCES public.tenant_prospeccion_usage_periods(tenant_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT tenant_prospeccion_credit_operations_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.usuarios(id) ON DELETE SET NULL,
    CONSTRAINT tenant_prospeccion_credit_operations_tenant_id_id_uidx
        UNIQUE (tenant_id, id),
    CONSTRAINT tenant_prospeccion_credit_operations_request_hash_chk
        CHECK (length(btrim(request_hash)) > 0),
    CONSTRAINT tenant_prospeccion_credit_operations_status_chk
        CHECK (status IN ('processing', 'completed', 'failed')),
    CONSTRAINT tenant_prospeccion_credit_operations_source_chk
        CHECK (source = 'denue'),
    CONSTRAINT tenant_prospeccion_credit_operations_contact_mode_chk
        CHECK (required_contact_mode IN ('any', 'phone', 'email', 'both')),
    CONSTRAINT tenant_prospeccion_credit_operations_counts_chk
        CHECK (
            requested_count >= 0
            AND eligible_contact_count >= 0
            AND missing_required_contact_count >= 0
            AND batch_duplicate_count >= 0
            AND tenant_duplicate_count >= 0
            AND saved_count >= 0
            AND credits_consumed >= 0
            AND omitted_by_limit_count >= 0
            AND (credits_remaining IS NULL OR credits_remaining >= 0)
        ),
    CONSTRAINT tenant_prospeccion_credit_operations_saved_credits_chk
        CHECK (saved_count = credits_consumed),
    CONSTRAINT tenant_prospeccion_credit_operations_completed_at_chk
        CHECK (
            (status = 'processing' AND completed_at IS NULL)
            OR (status IN ('completed', 'failed') AND completed_at IS NOT NULL)
        )
);

COMMENT ON TABLE public.tenant_prospeccion_credit_operations IS
    'Cabecera idempotente por intento de guardado; conserva resumen incluso cuando no se genera ledger.';
COMMENT ON COLUMN public.tenant_prospeccion_credit_operations.request_hash IS
    'Hash canonico del payload para rechazar la reutilizacion de un operation_id con contenido distinto.';

CREATE INDEX tenant_prospeccion_credit_operations_tenant_created_idx
    ON public.tenant_prospeccion_credit_operations (tenant_id, created_at DESC);

CREATE INDEX tenant_prospeccion_credit_operations_period_idx
    ON public.tenant_prospeccion_credit_operations (usage_period_id, created_at DESC);

CREATE INDEX tenant_prospeccion_credit_operations_created_by_idx
    ON public.tenant_prospeccion_credit_operations (created_by, created_at DESC)
    WHERE created_by IS NOT NULL;

CREATE INDEX tenant_prospeccion_credit_operations_processing_idx
    ON public.tenant_prospeccion_credit_operations (created_at)
    WHERE status = 'processing';

-- ============================================================================
-- Ledger auditable de creditos
-- ============================================================================

CREATE TABLE public.tenant_prospeccion_credit_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    usage_period_id uuid NOT NULL,
    operation_id uuid NOT NULL,
    prospecto_id uuid,
    resultado_id uuid,
    busqueda_id uuid,
    source text NOT NULL,
    source_external_id text,
    movement_type text NOT NULL,
    credits_delta integer NOT NULL,
    required_contact_mode text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    reversal_of_id uuid,
    CONSTRAINT tenant_prospeccion_credit_ledger_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT tenant_prospeccion_credit_ledger_period_fkey
        FOREIGN KEY (tenant_id, usage_period_id)
        REFERENCES public.tenant_prospeccion_usage_periods(tenant_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT tenant_prospeccion_credit_ledger_operation_fkey
        FOREIGN KEY (tenant_id, operation_id)
        REFERENCES public.tenant_prospeccion_credit_operations(tenant_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT tenant_prospeccion_credit_ledger_prospecto_id_fkey
        FOREIGN KEY (prospecto_id) REFERENCES public.prospeccion_prospectos(id) ON DELETE SET NULL,
    CONSTRAINT tenant_prospeccion_credit_ledger_resultado_id_fkey
        FOREIGN KEY (resultado_id) REFERENCES public.resultados(id) ON DELETE SET NULL,
    CONSTRAINT tenant_prospeccion_credit_ledger_busqueda_id_fkey
        FOREIGN KEY (busqueda_id) REFERENCES public.busquedas(id) ON DELETE SET NULL,
    CONSTRAINT tenant_prospeccion_credit_ledger_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.usuarios(id) ON DELETE SET NULL,
    CONSTRAINT tenant_prospeccion_credit_ledger_reversal_of_id_fkey
        FOREIGN KEY (reversal_of_id)
        REFERENCES public.tenant_prospeccion_credit_ledger(id)
        ON DELETE RESTRICT,
    CONSTRAINT tenant_prospeccion_credit_ledger_source_chk
        CHECK (source = 'denue'),
    CONSTRAINT tenant_prospeccion_credit_ledger_movement_type_chk
        CHECK (movement_type IN ('consume', 'reversal')),
    CONSTRAINT tenant_prospeccion_credit_ledger_delta_chk
        CHECK (
            (movement_type = 'consume' AND credits_delta = 1)
            OR (movement_type = 'reversal' AND credits_delta = -1)
        ),
    CONSTRAINT tenant_prospeccion_credit_ledger_contact_mode_chk
        CHECK (required_contact_mode IN ('any', 'phone', 'email', 'both')),
    CONSTRAINT tenant_prospeccion_credit_ledger_reversal_chk
        CHECK (
            (movement_type = 'consume' AND reversal_of_id IS NULL)
            OR (movement_type = 'reversal' AND reversal_of_id IS NOT NULL)
        )
);

COMMENT ON TABLE public.tenant_prospeccion_credit_ledger IS
    'Ledger inmutable de consumos y reversas de creditos por prospecto nuevo guardado.';
COMMENT ON COLUMN public.tenant_prospeccion_credit_ledger.source_external_id IS
    'Identificador estable en la fuente para impedir doble cobro aun si el prospecto se elimina.';
COMMENT ON COLUMN public.tenant_prospeccion_credit_ledger.credits_delta IS
    'Un consumo suma 1 y una reversa resta 1; no se permiten valores fraccionarios.';

CREATE INDEX tenant_prospeccion_credit_ledger_tenant_created_idx
    ON public.tenant_prospeccion_credit_ledger (tenant_id, created_at DESC);

CREATE INDEX tenant_prospeccion_credit_ledger_period_idx
    ON public.tenant_prospeccion_credit_ledger (usage_period_id, created_at);

CREATE INDEX tenant_prospeccion_credit_ledger_operation_idx
    ON public.tenant_prospeccion_credit_ledger (operation_id);

CREATE INDEX tenant_prospeccion_credit_ledger_prospecto_idx
    ON public.tenant_prospeccion_credit_ledger (prospecto_id)
    WHERE prospecto_id IS NOT NULL;

CREATE INDEX tenant_prospeccion_credit_ledger_resultado_idx
    ON public.tenant_prospeccion_credit_ledger (resultado_id)
    WHERE resultado_id IS NOT NULL;

CREATE INDEX tenant_prospeccion_credit_ledger_busqueda_idx
    ON public.tenant_prospeccion_credit_ledger (busqueda_id)
    WHERE busqueda_id IS NOT NULL;

CREATE INDEX tenant_prospeccion_credit_ledger_created_by_idx
    ON public.tenant_prospeccion_credit_ledger (created_by)
    WHERE created_by IS NOT NULL;

CREATE UNIQUE INDEX tenant_prospeccion_credit_ledger_operation_result_consume_uidx
    ON public.tenant_prospeccion_credit_ledger (tenant_id, operation_id, resultado_id)
    WHERE movement_type = 'consume' AND resultado_id IS NOT NULL;

CREATE UNIQUE INDEX tenant_prospeccion_credit_ledger_prospect_consume_uidx
    ON public.tenant_prospeccion_credit_ledger (tenant_id, prospecto_id)
    WHERE movement_type = 'consume' AND prospecto_id IS NOT NULL;

CREATE UNIQUE INDEX tenant_prospeccion_credit_ledger_external_consume_uidx
    ON public.tenant_prospeccion_credit_ledger (tenant_id, source, source_external_id)
    WHERE movement_type = 'consume' AND source_external_id IS NOT NULL;

CREATE UNIQUE INDEX tenant_prospeccion_credit_ledger_reversal_uidx
    ON public.tenant_prospeccion_credit_ledger (reversal_of_id)
    WHERE movement_type = 'reversal';

-- ============================================================================
-- RLS y privilegios
-- ============================================================================

ALTER TABLE public.tenant_prospeccion_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_prospeccion_usage_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_prospeccion_credit_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_prospeccion_credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_prospeccion_policies_service_role_all
    ON public.tenant_prospeccion_policies
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY tenant_prospeccion_usage_periods_service_role_all
    ON public.tenant_prospeccion_usage_periods
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY tenant_prospeccion_credit_operations_service_role_all
    ON public.tenant_prospeccion_credit_operations
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY tenant_prospeccion_credit_ledger_service_role_all
    ON public.tenant_prospeccion_credit_ledger
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON TABLE public.tenant_prospeccion_policies FROM anon, authenticated;
REVOKE ALL ON TABLE public.tenant_prospeccion_usage_periods FROM anon, authenticated;
REVOKE ALL ON TABLE public.tenant_prospeccion_credit_operations FROM anon, authenticated;
REVOKE ALL ON TABLE public.tenant_prospeccion_credit_ledger FROM anon, authenticated;
REVOKE ALL ON TABLE public.tenant_prospeccion_policies FROM service_role;
REVOKE ALL ON TABLE public.tenant_prospeccion_usage_periods FROM service_role;
REVOKE ALL ON TABLE public.tenant_prospeccion_credit_operations FROM service_role;
REVOKE ALL ON TABLE public.tenant_prospeccion_credit_ledger FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.tenant_prospeccion_policies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.tenant_prospeccion_usage_periods TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.tenant_prospeccion_credit_operations TO service_role;
GRANT SELECT, INSERT
    ON TABLE public.tenant_prospeccion_credit_ledger TO service_role;

-- ============================================================================
-- Seed de politica para tenants existentes
-- ============================================================================

INSERT INTO public.tenant_prospeccion_policies (
    tenant_id,
    required_contact_mode,
    effective_from
)
SELECT
    o.id,
    'any',
    now()
FROM public.organizaciones o
ON CONFLICT (tenant_id) DO NOTHING;

-- ============================================================================
-- Entitlements aprobados para Starter
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS commercial_plan_entitlements_plan_key_uidx
    ON public.commercial_plan_entitlements (plan_id, entitlement_key);

WITH starter_plan AS (
    SELECT id
    FROM public.commercial_plans
    WHERE code = 'starter'
)
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
    'limit.prospeccion.credits_month',
    'integer',
    true,
    9000,
    'credits',
    'tenant_month'
FROM starter_plan
ON CONFLICT (plan_id, entitlement_key) DO UPDATE
SET value_type = EXCLUDED.value_type,
    enabled = EXCLUDED.enabled,
    limit_value = EXCLUDED.limit_value,
    value_text = NULL,
    value_json = NULL,
    limit_unit = EXCLUDED.limit_unit,
    scope = EXCLUDED.scope;

WITH starter_plan AS (
    SELECT id
    FROM public.commercial_plans
    WHERE code = 'starter'
)
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
    'limit.prospeccion.denue_raw_results_month',
    'integer',
    true,
    50000,
    'raw_results',
    'tenant_month'
FROM starter_plan
ON CONFLICT (plan_id, entitlement_key) DO UPDATE
SET value_type = EXCLUDED.value_type,
    enabled = EXCLUDED.enabled,
    limit_value = EXCLUDED.limit_value,
    value_text = NULL,
    value_json = NULL,
    limit_unit = EXCLUDED.limit_unit,
    scope = EXCLUDED.scope;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.commercial_plans
        WHERE code = 'starter'
    ) THEN
        RAISE EXCEPTION 'starter_commercial_plan_missing';
    END IF;
END
$$;

COMMIT;
