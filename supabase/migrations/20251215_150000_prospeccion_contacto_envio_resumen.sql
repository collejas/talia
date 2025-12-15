create or replace function public.prospeccion_contacto_envio_resumen(batch_ids uuid[])
returns table(batch_id uuid, estado text, total bigint)
language plpgsql
security invoker
set search_path = public
as $$
begin
    if batch_ids is null or array_length(batch_ids, 1) is null then
        return;
    end if;

    return query
    select
        e.batch_id,
        coalesce(nullif(trim(e.estado), ''), 'pendiente') as estado,
        count(*)::bigint as total
    from public.prospeccion_contacto_envio e
    where e.batch_id = any(batch_ids)
    group by e.batch_id, coalesce(nullif(trim(e.estado), ''), 'pendiente');
end;
$$;

comment on function public.prospeccion_contacto_envio_resumen(uuid[])
    is 'Agrupa envíos por lote y estado para la vista de campañas de prospección.';

grant execute on function public.prospeccion_contacto_envio_resumen(uuid[]) to authenticated;
grant execute on function public.prospeccion_contacto_envio_resumen(uuid[]) to service_role;
