-- Cola durable para aceptar campañas Postmark sin insertar todos los
-- destinatarios dentro de la petición HTTP del usuario.
-- `manifest` contiene únicamente el contenido variable/renderizado del
-- mensaje; identidad, tenant, lote, estado e intentos son columnas explícitas.

CREATE TABLE IF NOT EXISTS public.prospeccion_postmark_campaign_preparation_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    batch_id uuid NOT NULL REFERENCES public.prospeccion_contacto_batch(id) ON DELETE CASCADE,
    total integer NOT NULL,
    manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
    status text NOT NULL DEFAULT 'pendiente',
    attempt_count integer NOT NULL DEFAULT 0,
    max_retries integer NOT NULL DEFAULT 5,
    claimed_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT postmark_preparation_jobs_total_check CHECK (total > 0),
    CONSTRAINT postmark_preparation_jobs_manifest_array_check CHECK (jsonb_typeof(manifest) = 'array'),
    CONSTRAINT postmark_preparation_jobs_status_check CHECK (status IN ('pendiente', 'procesando', 'completada', 'fallida')),
    CONSTRAINT postmark_preparation_jobs_unique_batch UNIQUE (batch_id)
);

CREATE INDEX IF NOT EXISTS postmark_preparation_jobs_ready_idx
    ON public.prospeccion_postmark_campaign_preparation_jobs
       (status, created_at, id)
    WHERE status IN ('pendiente', 'procesando');

ALTER TABLE public.prospeccion_postmark_campaign_preparation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccion_postmark_campaign_preparation_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.prospeccion_postmark_campaign_preparation_jobs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.worker_claim_postmark_preparation_jobs(
    p_limit integer DEFAULT 5,
    p_stale_after_seconds integer DEFAULT 900
)
RETURNS SETOF public.prospeccion_postmark_campaign_preparation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 5), 1), 20);
BEGIN
    IF p_stale_after_seconds < 60 OR p_stale_after_seconds > 86400 THEN
        RAISE EXCEPTION 'postmark_preparation_invalid_stale_window' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH candidates AS (
        SELECT j.id
        FROM public.prospeccion_postmark_campaign_preparation_jobs AS j
        WHERE (
            j.status = 'pendiente'
            OR (
                j.status = 'procesando'
                AND j.claimed_at < now() - make_interval(secs => p_stale_after_seconds)
            )
        )
        AND j.attempt_count < j.max_retries
        ORDER BY j.created_at, j.id
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.prospeccion_postmark_campaign_preparation_jobs AS j
    SET status = 'procesando',
        attempt_count = j.attempt_count + 1,
        claimed_at = now(),
        started_at = COALESCE(j.started_at, now()),
        updated_at = now()
    FROM candidates AS c
    WHERE j.id = c.id
    RETURNING j.*;
END;
$function$;

CREATE OR REPLACE FUNCTION public.worker_finish_postmark_preparation_job(
    p_job_id uuid,
    p_success boolean,
    p_error text DEFAULT NULL
)
RETURNS public.prospeccion_postmark_campaign_preparation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_job public.prospeccion_postmark_campaign_preparation_jobs;
BEGIN
    UPDATE public.prospeccion_postmark_campaign_preparation_jobs AS j
    SET status = CASE
            WHEN p_success THEN 'completada'
            WHEN j.attempt_count < j.max_retries THEN 'pendiente'
            ELSE 'fallida'
        END,
        completed_at = CASE WHEN p_success THEN now() ELSE NULL END,
        claimed_at = CASE WHEN p_success THEN j.claimed_at ELSE NULL END,
        last_error = CASE WHEN p_success THEN NULL ELSE left(COALESCE(p_error, 'postmark_preparation_failed'), 2000) END,
        updated_at = now()
    WHERE j.id = p_job_id
      AND j.status = 'procesando'
    RETURNING j.* INTO v_job;

    IF v_job.id IS NULL THEN
        RAISE EXCEPTION 'postmark_preparation_job_not_claimed' USING ERRCODE = 'P0002';
    END IF;
    RETURN v_job;
END;
$function$;

REVOKE ALL ON FUNCTION public.worker_claim_postmark_preparation_jobs(integer, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_claim_postmark_preparation_jobs(integer, integer)
    TO service_role;
REVOKE ALL ON FUNCTION public.worker_finish_postmark_preparation_job(uuid, boolean, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_finish_postmark_preparation_job(uuid, boolean, text)
    TO service_role;

COMMENT ON TABLE public.prospeccion_postmark_campaign_preparation_jobs IS
    'Cola durable que desacopla la aceptación HTTP de la materialización de targets Postmark.';
