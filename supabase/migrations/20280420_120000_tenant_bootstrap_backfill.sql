-- Backfill tenant bootstrap for legacy organizations.
-- Idempotent: safe to run multiple times.

do $$
declare
    v_master_org constant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
    v_org record;
    v_role_id uuid;
    v_user_id uuid;
    v_resource_id uuid;
    v_cfg jsonb;
    v_perm_codes text[] := array[
        'ver_panel',
        'ver_inbox',
        'conv.read',
        'conv.write',
        'conv.assign',
        'contacts.read',
        'contacts.write',
        'messages.read',
        'messages.write',
        'calls.read',
        'calls.write',
        'reports.view',
        'role.manage',
        'user.manage',
        'settings.view',
        'settings.manage',
        'leads.view',
        'pipeline.view',
        'agenda.view',
        'propuesta.view',
        'clientes.view',
        'propiedades.view',
        'activities.view',
        'tickets.view',
        'campaigns.view',
        'notes.view',
        'files.view',
        'audit.view',
        'busquedas.view',
        'busquedas.run',
        'busquedas.delete',
        'prospectos.create',
        'ver_busquedas_google',
        'ver_busquedas_inegi',
        'ejecutar_busquedas'
    ];
begin
    for v_org in
        select o.id, o.nombre, o.config
        from public.organizaciones o
        where o.id <> v_master_org
    loop
        -- 1) Ensure base permissions exist.
        insert into public.permisos (organizacion_id, codigo, descripcion)
        select v_org.id, p.code, p.code
        from unnest(v_perm_codes) as p(code)
        where not exists (
            select 1
            from public.permisos x
            where x.organizacion_id = v_org.id
              and x.codigo = p.code
        );

        -- 2) Ensure base roles exist.
        insert into public.roles (organizacion_id, nombre, descripcion)
        select v_org.id, r.name, r.description
        from (
            values
                ('owner', 'Propietario del tenant'),
                ('admin_operativo', 'Administrador operativo'),
                ('supervisor', 'Supervisor comercial'),
                ('agente', 'Agente comercial'),
                ('capturista', 'Captura y apoyo operativo'),
                ('marketing', 'Prospeccion y campanas'),
                ('soporte', 'Atencion e inbox'),
                ('auditor', 'Lectura y auditoria'),
                ('invitado', 'Lectura basica')
        ) as r(name, description)
        where not exists (
            select 1
            from public.roles x
            where x.organizacion_id = v_org.id
              and lower(x.nombre) = lower(r.name)
        );

        -- 3) Ensure owner/admin roles have all tenant permissions.
        insert into public.roles_permisos (organizacion_id, rol_id, permiso_id)
        select r.organizacion_id, r.id, p.id
        from public.roles r
        join public.permisos p on p.organizacion_id = r.organizacion_id
        where r.organizacion_id = v_org.id
          and lower(r.nombre) in ('owner', 'admin_operativo', 'admin')
          and not exists (
              select 1
              from public.roles_permisos rp
              where rp.organizacion_id = r.organizacion_id
                and rp.rol_id = r.id
                and rp.permiso_id = p.id
          );

        -- 4) Ensure one owner assignment for each tenant (first user by creation order).
        select r.id
        into v_role_id
        from public.roles r
        where r.organizacion_id = v_org.id
          and lower(r.nombre) = 'owner'
        limit 1;

        if v_role_id is not null then
            select u.id
            into v_user_id
            from public.usuarios u
            where u.organizacion_id = v_org.id
            order by u.creado_en nulls last, u.id
            limit 1;

            if v_user_id is not null then
                insert into public.usuarios_roles (usuario_id, rol_id, organizacion_id)
                select v_user_id, v_role_id, v_org.id
                where not exists (
                    select 1
                    from public.usuarios_roles ur
                    where ur.usuario_id = v_user_id
                      and ur.rol_id = v_role_id
                      and ur.organizacion_id = v_org.id
                );
            end if;
        end if;

        -- 5) Ensure a calendar resource and webchat calendar config.
        select cr.id
        into v_resource_id
        from public.calendar_resources cr
        where cr.organizacion_id = v_org.id
          and coalesce(cr.slug, '') = 'default'
        order by cr.created_at
        limit 1;

        if v_resource_id is null then
            select cr.id
            into v_resource_id
            from public.calendar_resources cr
            where cr.organizacion_id = v_org.id
            order by cr.created_at
            limit 1;
        end if;

        if v_resource_id is null then
            insert into public.calendar_resources (
                organizacion_id,
                name,
                slug,
                timezone,
                slot_minutes,
                buffer_minutes,
                capacity_per_slot,
                max_holds_per_slot,
                max_days_visible,
                is_active,
                metadata
            )
            values (
                v_org.id,
                coalesce(nullif(trim(v_org.nombre), ''), 'Tenant') || ' - Agenda principal',
                'default',
                'America/Mexico_City',
                30,
                0,
                1,
                5,
                21,
                true,
                jsonb_build_object('source', 'migration.tenant_bootstrap_backfill')
            )
            returning id into v_resource_id;
        end if;

        v_cfg := coalesce(v_org.config, '{}'::jsonb);

        if coalesce(v_cfg #>> '{webchat,calendar,resource_id}', '') = '' then
            v_cfg := jsonb_set(v_cfg, '{webchat,calendar,resource_id}', to_jsonb(v_resource_id::text), true);
        end if;
        if coalesce(v_cfg #>> '{webchat,calendar,timezone}', '') = '' then
            v_cfg := jsonb_set(v_cfg, '{webchat,calendar,timezone}', to_jsonb('America/Mexico_City'::text), true);
        end if;
        if coalesce(v_cfg #>> '{webchat,calendar,default_days}', '') = '' then
            v_cfg := jsonb_set(v_cfg, '{webchat,calendar,default_days}', to_jsonb(21), true);
        end if;
        if coalesce(v_cfg #>> '{webchat,calendar,hold_minutes}', '') = '' then
            v_cfg := jsonb_set(v_cfg, '{webchat,calendar,hold_minutes}', to_jsonb(10), true);
        end if;
        if v_cfg #> '{features,webchat,enabled}' is null then
            v_cfg := jsonb_set(v_cfg, '{features,webchat,enabled}', to_jsonb(true), true);
        end if;

        update public.organizaciones
        set config = v_cfg
        where id = v_org.id;
    end loop;
end $$;
