-- Variante de purga que preserva módulos de RR.HH. y la propia organización.
-- RR.HH. aquí se interpretan como las tablas empleados, departamentos y puestos.

create or replace function public.purge_organizacion_preserve_rrhh(p_organizacion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    rec record;
    cascade_table text;
    skip_tables constant text[] := array[
        'public.empleados',
        'public.departamentos',
        'public.puestos',
        'public.identidades_canal',
        'public.etapas_pipeline',
        'public.catalog_items',
        'public.logos',
        'public.panel_calendar_settings',
        'public.panel_email_templates',
        'public.calendar_availability_patterns',
        'public.calendar_resources',
        'public.permisos',
        'public.roles',
        'public.roles_permisos',
        'public.roles_codigo_counters',
        'public.usuarios',
        'public.usuarios_roles',
        'public.quote_templates'
    ];
    cascade_tables constant text[] := array[
        'public.conversation_summaries',
        'public.conversaciones_insights',
        'public.conversaciones_controles',
        'public.conversaciones',
        'public.contactos',
        'public.prospeccion_contactos_log',
        'public.prospeccion_contacto_envio',
        'public.prospeccion_contacto_batch',
        'public.prospeccion_contacto_templates',
        'public.prospeccion_prospecto_contacto_stats',
        'public.prospeccion_buscador_resultados',
        'public.prospeccion_buscador_jobs',
        'public.webchat_session_closures',
        'public.webchat_visitantes',
        'public.webhooks_entrantes',
        'public.mensajes',
        'public.actividades',
        'public.leads',
        'public.oportunidad_etapas_historial',
        'public.oportunidades',
        'public.cotizacion_items',
        'public.cotizaciones',
        'public.busquedas',
        'public.eventos_entrega'
    ];
begin
    if p_organizacion_id is null then
        raise exception using message = 'organizacion_id_required';
    end if;

    if not exists (select 1 from public.organizaciones where id = p_organizacion_id) then
        raise exception using message = format('organizacion_no_encontrada: %s', p_organizacion_id);
    end if;

    perform set_config('row_security', 'off', true);

    for rec in
        with target_tables as (
            select n.nspname as schema_name, c.relname as table_name
            from pg_attribute a
            join pg_class c on c.oid = a.attrelid
            join pg_namespace n on n.oid = c.relnamespace
            where a.attname = 'organizacion_id'
              and n.nspname = 'public'
              and c.relkind = 'r'
            and format('%I.%I', n.nspname, c.relname) <> all(skip_tables)
        ),
        fk as (
            select
                child.schema_name as child_schema,
                child.table_name as child_table,
                parent.schema_name as parent_schema,
                parent.table_name as parent_table
            from pg_constraint con
            join pg_class child_c on child_c.oid = con.conrelid
            join pg_namespace child_n on child_n.oid = child_c.relnamespace
            join pg_class parent_c on parent_c.oid = con.confrelid
            join pg_namespace parent_n on parent_n.oid = parent_c.relnamespace
            join target_tables child on child.schema_name = child_n.nspname and child.table_name = child_c.relname
            join target_tables parent on parent.schema_name = parent_n.nspname and parent.table_name = parent_c.relname
            where con.contype = 'f'
        ),
        walk as (
            select schema_name, table_name, 0::int as depth
            from target_tables
            union all
            select fk.parent_schema, fk.parent_table, walk.depth + 1
            from walk
            join fk on fk.child_schema = walk.schema_name and fk.child_table = walk.table_name
        ),
        ordered as (
            select schema_name, table_name, max(depth) as depth
            from walk
            group by schema_name, table_name
        )
        select format('%I.%I', schema_name, table_name) as fqname
        from ordered
        order by depth asc, fqname
    loop
        execute format('delete from %s where organizacion_id = $1', rec.fqname)
        using p_organizacion_id;
    end loop;

    foreach cascade_table in array cascade_tables loop
        execute format('delete from %s where organizacion_id = $1', cascade_table)
        using p_organizacion_id;
    end loop;
end;
$$;

comment on function public.purge_organizacion_preserve_rrhh(uuid) is
'Elimina todos los registros asociados a una organizacion_id excepto los módulos de RR.HH. (empleados/departamentos/puestos) y conserva la fila de organizaciones.';
