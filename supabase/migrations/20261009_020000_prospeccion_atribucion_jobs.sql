BEGIN;

-- La generación del snapshot de atribución puede recorrer históricos grandes.
-- Este job durable evita ejecutarlo dentro de una petición de PostgREST.
CREATE TABLE IF NOT EXISTS public.prospeccion_campana_atribucion_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    campana_id uuid,
    periodo_desde timestamptz NOT NULL,
    periodo_hasta timestamptz NOT NULL,
    estado text NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'procesando', 'completado', 'fallido')),
    intentos integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
    disponible_en timestamptz NOT NULL DEFAULT now(),
    lease_hasta timestamptz,
    ultimo_error text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    iniciado_en timestamptz,
    completado_en timestamptz,
    CONSTRAINT prospeccion_campana_atribucion_jobs_periodo_ck
        CHECK (periodo_desde <= periodo_hasta)
);

CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_campana_atribucion_jobs_key
    ON public.prospeccion_campana_atribucion_jobs (
        organizacion_id,
        periodo_desde,
        periodo_hasta,
        coalesce(campana_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

CREATE INDEX IF NOT EXISTS prospeccion_campana_atribucion_jobs_claim_idx
    ON public.prospeccion_campana_atribucion_jobs (estado, disponible_en, creado_en);

ALTER TABLE public.prospeccion_campana_atribucion_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.prospeccion_campana_atribucion_jobs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.prospeccion_campana_atribucion_job_enqueue(
    p_organizacion_id uuid,
    p_periodo_desde timestamptz,
    p_periodo_hasta timestamptz,
    p_campana_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_id uuid;
BEGIN
    IF p_organizacion_id IS NULL OR p_periodo_desde IS NULL
       OR p_periodo_hasta IS NULL OR p_periodo_desde > p_periodo_hasta THEN
        RAISE EXCEPTION 'prospeccion_campana_atribucion_job_invalid_input'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.prospeccion_campana_atribucion_jobs (
        organizacion_id, campana_id, periodo_desde, periodo_hasta,
        estado, disponible_en, ultimo_error, actualizado_en
    ) VALUES (
        p_organizacion_id, p_campana_id, p_periodo_desde, p_periodo_hasta,
        'pendiente', now(), NULL, now()
    )
    ON CONFLICT (
        organizacion_id, periodo_desde, periodo_hasta,
        (coalesce(campana_id, '00000000-0000-0000-0000-000000000000'::uuid))
    ) DO UPDATE SET
        estado = CASE
            WHEN public.prospeccion_campana_atribucion_jobs.estado = 'procesando'
                 AND public.prospeccion_campana_atribucion_jobs.lease_hasta > now()
                THEN public.prospeccion_campana_atribucion_jobs.estado
            ELSE 'pendiente'
        END,
        disponible_en = CASE
            WHEN public.prospeccion_campana_atribucion_jobs.estado = 'procesando'
                 AND public.prospeccion_campana_atribucion_jobs.lease_hasta > now()
                THEN public.prospeccion_campana_atribucion_jobs.disponible_en
            ELSE now()
        END,
        ultimo_error = NULL,
        lease_hasta = CASE
            WHEN public.prospeccion_campana_atribucion_jobs.estado = 'procesando'
                 AND public.prospeccion_campana_atribucion_jobs.lease_hasta > now()
                THEN public.prospeccion_campana_atribucion_jobs.lease_hasta
            ELSE NULL
        END,
        actualizado_en = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prospeccion_campana_atribucion_job_claim(
    p_limit integer DEFAULT 1,
    p_lease_seconds integer DEFAULT 300
)
RETURNS SETOF public.prospeccion_campana_atribucion_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_limit integer := least(greatest(coalesce(p_limit, 1), 1), 5);
BEGIN
    IF p_lease_seconds < 60 OR p_lease_seconds > 3600 THEN
        RAISE EXCEPTION 'prospeccion_campana_atribucion_job_invalid_lease'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH candidates AS (
        SELECT j.id
        FROM public.prospeccion_campana_atribucion_jobs j
        WHERE (
            (j.estado = 'pendiente' AND j.disponible_en <= now())
            OR (j.estado = 'procesando' AND j.lease_hasta < now())
        )
        AND j.intentos < 8
        ORDER BY j.disponible_en, j.creado_en, j.id
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.prospeccion_campana_atribucion_jobs j
    SET estado = 'procesando',
        intentos = j.intentos + 1,
        lease_hasta = now() + make_interval(secs => p_lease_seconds),
        iniciado_en = coalesce(j.iniciado_en, now()),
        actualizado_en = now()
    FROM candidates c
    WHERE j.id = c.id
    RETURNING j.*;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prospeccion_campana_atribucion_job_finish(
    p_job_id uuid,
    p_success boolean,
    p_error text DEFAULT NULL,
    p_retry_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    UPDATE public.prospeccion_campana_atribucion_jobs j
    SET estado = CASE
            WHEN p_success THEN 'completado'
            WHEN j.intentos >= 8 THEN 'fallido'
            ELSE 'pendiente'
        END,
        disponible_en = CASE
            WHEN p_success OR j.intentos >= 8 THEN j.disponible_en
            ELSE now() + make_interval(secs => least(greatest(coalesce(p_retry_seconds, 60), 10), 3600))
        END,
        lease_hasta = NULL,
        ultimo_error = CASE WHEN p_success THEN NULL ELSE left(coalesce(p_error, 'unknown'), 2000) END,
        completado_en = CASE WHEN p_success OR j.intentos >= 8 THEN now() ELSE NULL END,
        actualizado_en = now()
    WHERE j.id = p_job_id AND j.estado = 'procesando';
    RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.prospeccion_campana_atribucion_job_enqueue(uuid, timestamptz, timestamptz, uuid)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prospeccion_campana_atribucion_job_claim(integer, integer)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prospeccion_campana_atribucion_job_finish(uuid, boolean, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prospeccion_campana_atribucion_job_enqueue(uuid, timestamptz, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.prospeccion_campana_atribucion_job_claim(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.prospeccion_campana_atribucion_job_finish(uuid, boolean, text, integer) TO service_role;

COMMIT;
