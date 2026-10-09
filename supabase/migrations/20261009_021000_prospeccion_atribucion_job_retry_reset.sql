BEGIN;

-- Una nueva solicitud sobre un snapshot completado debe poder recalcularse,
-- sin heredar el límite de intentos del job anterior.
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
        intentos = CASE
            WHEN public.prospeccion_campana_atribucion_jobs.estado = 'procesando'
                 AND public.prospeccion_campana_atribucion_jobs.lease_hasta > now()
                THEN public.prospeccion_campana_atribucion_jobs.intentos
            ELSE 0
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
        completado_en = NULL,
        actualizado_en = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.prospeccion_campana_atribucion_job_enqueue(uuid, timestamptz, timestamptz, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prospeccion_campana_atribucion_job_enqueue(uuid, timestamptz, timestamptz, uuid)
    TO service_role;

COMMIT;
