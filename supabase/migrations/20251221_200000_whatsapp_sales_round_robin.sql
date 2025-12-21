-- Asignación round-robin de vendedores para oportunidades WhatsApp/CRM.
create or replace function public.asignar_vendedor_round_robin(p_organizacion_id uuid)
returns table (
    usuario_id uuid,
    nombre text,
    correo text,
    telefono_e164 text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    return query
    with next_emp as (
        select e.usuario_id
        from public.empleados e
        where e.organizacion_id = p_organizacion_id
          and coalesce(e.es_vendedor, false)
        order by coalesce(e.ultimo_lead_asignado_en, timestamptz '1970-01-01 00:00:00+00') asc,
                 e.usuario_id
        limit 1
        for update skip locked
    ),
    updated as (
        update public.empleados e
        set ultimo_lead_asignado_en = now()
        from next_emp
        where e.usuario_id = next_emp.usuario_id
        returning e.usuario_id
    )
    select u.id,
           coalesce(u.nombre_completo, u.correo) as nombre,
           u.correo,
           u.telefono_e164
    from updated
    join public.usuarios u on u.id = updated.usuario_id;
end;
$$;

comment on function public.asignar_vendedor_round_robin(uuid) is
    'Selecciona al siguiente vendedor (empleados.es_vendedor) de forma round-robin y actualiza su timestamp.';

grant execute on function public.asignar_vendedor_round_robin(uuid) to authenticated;
grant execute on function public.asignar_vendedor_round_robin(uuid) to service_role;
