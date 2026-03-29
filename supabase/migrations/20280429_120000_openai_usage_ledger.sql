CREATE TABLE IF NOT EXISTS public.openai_pricing_catalog (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL DEFAULT 'openai',
    model text NOT NULL,
    effective_from timestamptz NOT NULL DEFAULT now(),
    effective_to timestamptz NULL,
    input_per_1m_usd numeric(18,8) NOT NULL DEFAULT 0,
    cached_input_per_1m_usd numeric(18,8) NOT NULL DEFAULT 0,
    output_per_1m_usd numeric(18,8) NOT NULL DEFAULT 0,
    reasoning_per_1m_usd numeric(18,8) NOT NULL DEFAULT 0,
    tool_call_unit_usd numeric(18,8) NOT NULL DEFAULT 0,
    source_url text NULL,
    notes text NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS openai_pricing_catalog_model_effective_idx
    ON public.openai_pricing_catalog (provider, model, effective_from DESC);

CREATE TABLE IF NOT EXISTS public.openai_request_usage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    source_tenant_mode text NOT NULL DEFAULT 'master_shared',
    channel text NOT NULL,
    feature text NULL,
    conversation_id uuid NULL REFERENCES public.conversaciones(id) ON DELETE SET NULL,
    message_id uuid NULL REFERENCES public.mensajes(id) ON DELETE SET NULL,
    contact_id uuid NULL REFERENCES public.contactos(id) ON DELETE SET NULL,
    opportunity_id uuid NULL REFERENCES public.oportunidades(id) ON DELETE SET NULL,
    openai_response_id text NULL,
    openai_conversation_id text NULL,
    openai_project_id text NULL,
    openai_api_key_fingerprint text NULL,
    openai_model text NOT NULL,
    openai_provider text NOT NULL DEFAULT 'openai',
    assistant_kind text NOT NULL,
    assistant_ref text NULL,
    prompt_version text NULL,
    request_purpose text NULL,
    request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    input_tokens integer NOT NULL DEFAULT 0,
    cached_input_tokens integer NOT NULL DEFAULT 0,
    output_tokens integer NOT NULL DEFAULT 0,
    reasoning_tokens integer NOT NULL DEFAULT 0,
    total_tokens integer NOT NULL DEFAULT 0,
    estimated_input_cost_usd numeric(18,8) NOT NULL DEFAULT 0,
    estimated_cached_input_cost_usd numeric(18,8) NOT NULL DEFAULT 0,
    estimated_output_cost_usd numeric(18,8) NOT NULL DEFAULT 0,
    estimated_reasoning_cost_usd numeric(18,8) NOT NULL DEFAULT 0,
    estimated_tools_cost_usd numeric(18,8) NOT NULL DEFAULT 0,
    estimated_total_cost_usd numeric(18,8) NOT NULL DEFAULT 0,
    latency_ms integer NULL,
    http_status integer NULL,
    request_status text NOT NULL DEFAULT 'completed',
    error_code text NULL,
    error_message text NULL,
    fallback_used boolean NOT NULL DEFAULT false,
    quality_retry_used boolean NOT NULL DEFAULT false,
    CONSTRAINT openai_request_usage_source_tenant_mode_check
        CHECK (source_tenant_mode IN ('master_shared', 'tenant_dedicated')),
    CONSTRAINT openai_request_usage_assistant_kind_check
        CHECK (assistant_kind IN ('prompt', 'assistant', 'raw_model'))
);

CREATE INDEX IF NOT EXISTS openai_request_usage_org_created_idx
    ON public.openai_request_usage (organizacion_id, created_at DESC);

CREATE INDEX IF NOT EXISTS openai_request_usage_org_channel_created_idx
    ON public.openai_request_usage (organizacion_id, channel, created_at DESC);

CREATE INDEX IF NOT EXISTS openai_request_usage_project_created_idx
    ON public.openai_request_usage (openai_project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS openai_request_usage_model_created_idx
    ON public.openai_request_usage (openai_model, created_at DESC);

CREATE INDEX IF NOT EXISTS openai_request_usage_conversation_created_idx
    ON public.openai_request_usage (conversation_id, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS openai_request_usage_response_id_key
    ON public.openai_request_usage (openai_response_id)
    WHERE openai_response_id IS NOT NULL;

ALTER TABLE public.openai_request_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'openai_request_usage'
          AND policyname = 'openai_request_usage_select_org'
    ) THEN
        CREATE POLICY openai_request_usage_select_org
            ON public.openai_request_usage
            FOR SELECT
            USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));
    END IF;
END $$;

COMMENT ON TABLE public.openai_pricing_catalog IS
    'Catalogo versionado de precios OpenAI para calcular costos estimados por request.';

COMMENT ON TABLE public.openai_request_usage IS
    'Ledger interno por request OpenAI para trazabilidad multi-tenant de uso, latencia y costo estimado.';
