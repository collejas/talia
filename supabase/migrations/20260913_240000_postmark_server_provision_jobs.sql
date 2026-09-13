BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_email_server_provision_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    source text NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    attempts integer NOT NULL DEFAULT 0,
    available_at timestamptz NOT NULL DEFAULT now(),
    locked_at timestamptz,
    completed_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_email_server_jobs_status_check CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    CONSTRAINT tenant_email_server_jobs_source_check CHECK (length(btrim(source)) BETWEEN 1 AND 120),
    CONSTRAINT tenant_email_server_jobs_attempts_check CHECK (attempts >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_email_server_jobs_open_uidx
    ON public.tenant_email_server_provision_jobs (organizacion_id)
    WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS tenant_email_server_jobs_claim_idx
    ON public.tenant_email_server_provision_jobs (status, available_at, created_at);

ALTER TABLE public.tenant_email_server_provision_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_email_server_provision_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_email_server_provision_jobs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_email_server_provision_jobs TO service_role;

DROP TRIGGER IF EXISTS tenant_email_server_jobs_touch_updated_at ON public.tenant_email_server_provision_jobs;
CREATE TRIGGER tenant_email_server_jobs_touch_updated_at
    BEFORE UPDATE ON public.tenant_email_server_provision_jobs
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE OR REPLACE FUNCTION public.tenant_email_enqueue_server_provision_job(
    p_organizacion_id uuid,
    p_source text
)
RETURNS TABLE (job_id uuid, job_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_job public.tenant_email_server_provision_jobs%ROWTYPE;
BEGIN
    SELECT * INTO v_job
    FROM public.tenant_email_server_provision_jobs
    WHERE organizacion_id = p_organizacion_id
      AND status IN ('queued', 'running')
    ORDER BY created_at DESC
    LIMIT 1;
    IF FOUND THEN
        RETURN QUERY SELECT v_job.id, v_job.status;
        RETURN;
    END IF;

    INSERT INTO public.tenant_email_server_provision_jobs (organizacion_id, source, status, available_at)
    VALUES (p_organizacion_id, left(btrim(p_source), 120), 'queued', now())
    RETURNING id, status INTO job_id, job_status;
    RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tenant_email_claim_server_provision_jobs(p_limit integer DEFAULT 10)
RETURNS SETOF public.tenant_email_server_provision_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    UPDATE public.tenant_email_server_provision_jobs
    SET status = 'queued', locked_at = NULL, available_at = now()
    WHERE status = 'running'
      AND locked_at < now() - interval '10 minutes';

    RETURN QUERY
    WITH candidates AS (
        SELECT id
        FROM public.tenant_email_server_provision_jobs
        WHERE status = 'queued'
          AND available_at <= now()
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT greatest(1, least(coalesce(p_limit, 10), 100))
    )
    UPDATE public.tenant_email_server_provision_jobs AS j
    SET status = 'running', attempts = j.attempts + 1, locked_at = now()
    FROM candidates
    WHERE j.id = candidates.id
    RETURNING j.*;
END;
$function$;

REVOKE ALL ON FUNCTION public.tenant_email_enqueue_server_provision_job(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_enqueue_server_provision_job(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.tenant_email_claim_server_provision_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_claim_server_provision_jobs(integer) TO service_role;

COMMENT ON TABLE public.tenant_email_server_provision_jobs IS
    'Cola idempotente para crear el servidor Postmark del tenant tras pago o activación autorizada.';

COMMIT;
