BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_google_places_usage_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    period_start timestamptz NOT NULL,
    period_end timestamptz NOT NULL,
    free_calls_limit integer NOT NULL DEFAULT 1000,
    calls_attempted integer NOT NULL DEFAULT 0,
    calls_with_response integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_google_places_usage_period_dates_check CHECK (period_end > period_start),
    CONSTRAINT tenant_google_places_usage_period_counts_check CHECK (
        free_calls_limit >= 0 AND calls_attempted >= 0 AND calls_with_response >= 0
    ),
    CONSTRAINT tenant_google_places_usage_period_unique UNIQUE (organizacion_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS public.tenant_google_places_call_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    usage_period_id uuid NOT NULL REFERENCES public.tenant_google_places_usage_periods(id) ON DELETE CASCADE,
    busqueda_id uuid REFERENCES public.busquedas(id) ON DELETE SET NULL,
    http_status integer,
    outcome text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_google_places_call_events_outcome_check CHECK (
        outcome IN ('success', 'provider_error', 'network_error')
    ),
    CONSTRAINT tenant_google_places_call_events_http_status_check CHECK (
        http_status IS NULL OR (http_status >= 100 AND http_status <= 599)
    )
);

CREATE INDEX IF NOT EXISTS tenant_google_places_usage_periods_lookup_idx
    ON public.tenant_google_places_usage_periods (organizacion_id, period_start DESC, period_end);
CREATE INDEX IF NOT EXISTS tenant_google_places_call_events_period_idx
    ON public.tenant_google_places_call_events (organizacion_id, usage_period_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tenant_google_places_call_events_busqueda_idx
    ON public.tenant_google_places_call_events (organizacion_id, busqueda_id, created_at DESC);

ALTER TABLE public.tenant_google_places_usage_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_google_places_usage_periods FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_google_places_call_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_google_places_call_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_google_places_usage_periods FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tenant_google_places_call_events FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_google_places_usage_periods TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_google_places_call_events TO service_role;

CREATE OR REPLACE FUNCTION public.google_places_register_call(
    p_organizacion_id uuid,
    p_busqueda_id uuid DEFAULT NULL,
    p_http_status integer DEFAULT NULL,
    p_outcome text DEFAULT 'success'
)
RETURNS TABLE (
    calls_attempted integer,
    calls_with_response integer,
    free_calls_limit integer,
    free_calls_remaining integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_start timestamptz := date_trunc('month', now());
    v_end timestamptz := v_start + interval '1 month';
    v_period public.tenant_google_places_usage_periods%ROWTYPE;
BEGIN
    IF p_organizacion_id IS NULL THEN
        RAISE EXCEPTION 'google_places_usage_tenant_required' USING ERRCODE = '22023';
    END IF;
    IF p_outcome NOT IN ('success', 'provider_error', 'network_error') THEN
        RAISE EXCEPTION 'google_places_usage_outcome_invalid' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.tenant_google_places_usage_periods (
        organizacion_id, period_start, period_end
    ) VALUES (
        p_organizacion_id, v_start, v_end
    )
    ON CONFLICT (organizacion_id, period_start, period_end)
    DO UPDATE SET updated_at = now()
    RETURNING * INTO v_period;

    INSERT INTO public.tenant_google_places_call_events (
        organizacion_id, usage_period_id, busqueda_id, http_status, outcome
    ) VALUES (
        p_organizacion_id, v_period.id, p_busqueda_id, p_http_status, p_outcome
    );

    UPDATE public.tenant_google_places_usage_periods AS period
    SET calls_attempted = period.calls_attempted + 1,
        calls_with_response = period.calls_with_response + CASE WHEN p_http_status IS NULL THEN 0 ELSE 1 END,
        updated_at = now()
    WHERE period.id = v_period.id AND period.organizacion_id = p_organizacion_id
    RETURNING period.* INTO v_period;

    RETURN QUERY SELECT
        v_period.calls_attempted,
        v_period.calls_with_response,
        v_period.free_calls_limit,
        greatest(v_period.free_calls_limit - v_period.calls_attempted, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.google_places_register_call(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.google_places_register_call(uuid, uuid, integer, text) TO service_role;

COMMENT ON TABLE public.tenant_google_places_usage_periods IS
    'Contador mensual por tenant de llamadas reales intentadas contra Google Places.';
COMMENT ON TABLE public.tenant_google_places_call_events IS
    'Ledger de cada llamada HTTP intentada contra Google Places, incluidos errores del proveedor.';

COMMIT;
