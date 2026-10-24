-- Despierta al worker únicamente cuando se crea o reactiva un trabajo.
-- La notificación se entrega al confirmar la transacción.

create or replace function public.prospeccion_campana_atribucion_job_enqueue(
    p_organizacion_id uuid,
    p_periodo_desde timestamptz,
    p_periodo_hasta timestamptz,
    p_campana_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
    v_id uuid;
begin
    if p_organizacion_id is null or p_periodo_desde is null
       or p_periodo_hasta is null or p_periodo_desde > p_periodo_hasta then
        raise exception 'prospeccion_campana_atribucion_job_invalid_input'
            using errcode = '22023';
    end if;

    insert into public.prospeccion_campana_atribucion_jobs (
        organizacion_id, campana_id, periodo_desde, periodo_hasta,
        estado, disponible_en, ultimo_error, actualizado_en
    ) values (
        p_organizacion_id, p_campana_id, p_periodo_desde, p_periodo_hasta,
        'pendiente', now(), null, now()
    )
    on conflict (
        organizacion_id, periodo_desde, periodo_hasta,
        (coalesce(campana_id, '00000000-0000-0000-0000-000000000000'::uuid))
    ) do update set
        estado = case
            when public.prospeccion_campana_atribucion_jobs.estado = 'procesando'
                 and public.prospeccion_campana_atribucion_jobs.lease_hasta > now()
                then public.prospeccion_campana_atribucion_jobs.estado
            else 'pendiente'
        end,
        intentos = case
            when public.prospeccion_campana_atribucion_jobs.estado = 'procesando'
                 and public.prospeccion_campana_atribucion_jobs.lease_hasta > now()
                then public.prospeccion_campana_atribucion_jobs.intentos
            else 0
        end,
        disponible_en = case
            when public.prospeccion_campana_atribucion_jobs.estado = 'procesando'
                 and public.prospeccion_campana_atribucion_jobs.lease_hasta > now()
                then public.prospeccion_campana_atribucion_jobs.disponible_en
            else now()
        end,
        ultimo_error = null,
        lease_hasta = case
            when public.prospeccion_campana_atribucion_jobs.estado = 'procesando'
                 and public.prospeccion_campana_atribucion_jobs.lease_hasta > now()
                then public.prospeccion_campana_atribucion_jobs.lease_hasta
            else null
        end,
        completado_en = null,
        actualizado_en = now()
    returning id into v_id;

    perform pg_notify('prospeccion_atribucion_jobs', v_id::text);
    return v_id;
end;
$function$;

revoke all on function public.prospeccion_campana_atribucion_job_enqueue(uuid, timestamptz, timestamptz, uuid)
    from public, anon, authenticated;
grant execute on function public.prospeccion_campana_atribucion_job_enqueue(uuid, timestamptz, timestamptz, uuid)
    to service_role;
