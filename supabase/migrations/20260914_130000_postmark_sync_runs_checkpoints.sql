BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_email_sync_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    server_id uuid NOT NULL,
    sync_type text NOT NULL,
    message_stream text NOT NULL,
    from_date timestamptz NOT NULL,
    to_date timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'running',
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    pages_processed integer NOT NULL DEFAULT 0,
    provider_records integer NOT NULL DEFAULT 0,
    local_records_upserted integer NOT NULL DEFAULT 0,
    events_processed integer NOT NULL DEFAULT 0,
    matched_records integer NOT NULL DEFAULT 0,
    ambiguous_records integer NOT NULL DEFAULT 0,
    unmatched_records integer NOT NULL DEFAULT 0,
    error_code text,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_email_sync_runs_type_check CHECK (sync_type IN ('messages', 'bounces', 'events')),
    CONSTRAINT tenant_email_sync_runs_stream_check CHECK (message_stream IN ('outbound', 'broadcast')),
    CONSTRAINT tenant_email_sync_runs_status_check CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    CONSTRAINT tenant_email_sync_runs_dates_check CHECK (to_date >= from_date),
    CONSTRAINT tenant_email_sync_runs_counts_check CHECK (
        pages_processed >= 0 AND provider_records >= 0 AND local_records_upserted >= 0
        AND events_processed >= 0 AND matched_records >= 0
        AND ambiguous_records >= 0 AND unmatched_records >= 0
    ),
    CONSTRAINT tenant_email_sync_runs_server_org_fkey
        FOREIGN KEY (organizacion_id, server_id)
        REFERENCES public.tenant_email_servers (organizacion_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.tenant_email_sync_checkpoints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    server_id uuid NOT NULL,
    sync_type text NOT NULL,
    message_stream text NOT NULL,
    window_from timestamptz NOT NULL,
    window_to timestamptz NOT NULL,
    next_offset integer NOT NULL DEFAULT 0,
    last_provider_total integer,
    last_run_id uuid REFERENCES public.tenant_email_sync_runs(id) ON DELETE SET NULL,
    locked_at timestamptz,
    last_success_at timestamptz,
    last_error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_email_sync_checkpoints_type_check CHECK (sync_type IN ('messages', 'bounces', 'events')),
    CONSTRAINT tenant_email_sync_checkpoints_stream_check CHECK (message_stream IN ('outbound', 'broadcast')),
    CONSTRAINT tenant_email_sync_checkpoints_dates_check CHECK (window_to >= window_from),
    CONSTRAINT tenant_email_sync_checkpoints_offset_check CHECK (next_offset >= 0),
    CONSTRAINT tenant_email_sync_checkpoints_total_check CHECK (last_provider_total IS NULL OR last_provider_total >= 0),
    CONSTRAINT tenant_email_sync_checkpoints_server_org_fkey
        FOREIGN KEY (organizacion_id, server_id)
        REFERENCES public.tenant_email_servers (organizacion_id, id) ON DELETE CASCADE,
    CONSTRAINT tenant_email_sync_checkpoints_unique
        UNIQUE (organizacion_id, server_id, sync_type, message_stream)
);

CREATE INDEX IF NOT EXISTS tenant_email_sync_runs_lookup_idx
    ON public.tenant_email_sync_runs (organizacion_id, server_id, sync_type, started_at DESC);
CREATE INDEX IF NOT EXISTS tenant_email_sync_runs_status_idx
    ON public.tenant_email_sync_runs (status, started_at);
CREATE INDEX IF NOT EXISTS tenant_email_sync_checkpoints_due_idx
    ON public.tenant_email_sync_checkpoints (organizacion_id, last_success_at, locked_at);

ALTER TABLE public.tenant_email_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_email_sync_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_email_sync_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_email_sync_checkpoints FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_email_sync_runs_service_role ON public.tenant_email_sync_runs;
CREATE POLICY tenant_email_sync_runs_service_role ON public.tenant_email_sync_runs
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS tenant_email_sync_checkpoints_service_role ON public.tenant_email_sync_checkpoints;
CREATE POLICY tenant_email_sync_checkpoints_service_role ON public.tenant_email_sync_checkpoints
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.tenant_email_sync_runs IS
    'Ejecuciones auditables de sincronización histórica Postmark por tenant.';
COMMENT ON TABLE public.tenant_email_sync_checkpoints IS
    'Checkpoint reanudable por tenant, servidor, tipo de datos y stream; no autoriza purgas.';

COMMIT;
