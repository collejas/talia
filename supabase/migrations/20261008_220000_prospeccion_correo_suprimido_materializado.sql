-- Mantiene la disponibilidad de correo indexable y consistente con las
-- supresiones persistidas por Postmark/tenant_email_suppressions.

alter table public.prospeccion_prospectos
    add column if not exists correo_suprimido_activo boolean not null default false;

comment on column public.prospeccion_prospectos.correo_suprimido_activo is
    'Indica que el correo actual del prospecto tiene una supresion activa por OPT, rebote, queja o bloqueo.';

create index if not exists prospeccion_prospectos_org_correo_disponible_idx
    on public.prospeccion_prospectos (
        organizacion_id,
        correo_suprimido_activo,
        envios_correo_intentos_total,
        email_lookup_status,
        creado_en desc,
        id
    )
    where email is not null and btrim(email) <> '';

-- La columna inicia en false. Sólo materializamos las coincidencias activas;
-- así no recorremos ni auditamos nuevamente todo el padrón histórico.
update public.prospeccion_prospectos p
set correo_suprimido_activo = true
from (
    select distinct organizacion_id, lower(btrim(email_address)) as email_address
    from public.tenant_email_suppressions
    where active = true
) s
where p.organizacion_id = s.organizacion_id
  and lower(btrim(p.email)) = s.email_address;

create or replace function public.sync_prospeccion_correo_suprimido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_organizacion_id uuid;
    v_email text;
begin
    if tg_op <> 'INSERT' then
        v_organizacion_id := old.organizacion_id;
        v_email := lower(btrim(old.email_address));
        if v_organizacion_id is not null and v_email <> '' then
            update public.prospeccion_prospectos p
            set correo_suprimido_activo = exists (
                select 1
                from public.tenant_email_suppressions s
                where s.organizacion_id = v_organizacion_id
                  and lower(btrim(s.email_address)) = v_email
                  and s.active = true
            )
            where p.organizacion_id = v_organizacion_id
              and lower(btrim(p.email)) = v_email;
        end if;
    end if;

    if tg_op <> 'DELETE' then
        v_organizacion_id := new.organizacion_id;
        v_email := lower(btrim(new.email_address));
        if v_organizacion_id is not null and v_email <> '' then
            update public.prospeccion_prospectos p
            set correo_suprimido_activo = exists (
                select 1
                from public.tenant_email_suppressions s
                where s.organizacion_id = v_organizacion_id
                  and lower(btrim(s.email_address)) = v_email
                  and s.active = true
            )
            where p.organizacion_id = v_organizacion_id
              and lower(btrim(p.email)) = v_email;
        end if;
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

drop trigger if exists tenant_email_suppressions_sync_prospeccion on public.tenant_email_suppressions;
create trigger tenant_email_suppressions_sync_prospeccion
after insert or update of organizacion_id, email_address, active or delete
on public.tenant_email_suppressions
for each row execute function public.sync_prospeccion_correo_suprimido();

create or replace function public.sync_prospeccion_correo_suprimido_on_prospecto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.correo_suprimido_activo := exists (
        select 1
        from public.tenant_email_suppressions s
        where s.organizacion_id = new.organizacion_id
          and lower(btrim(s.email_address)) = lower(btrim(new.email))
          and s.active = true
    );
    return new;
end;
$$;

drop trigger if exists prospeccion_prospectos_sync_correo_suprimido on public.prospeccion_prospectos;
create trigger prospeccion_prospectos_sync_correo_suprimido
before insert or update of organizacion_id, email
on public.prospeccion_prospectos
for each row execute function public.sync_prospeccion_correo_suprimido_on_prospecto();

comment on function public.sync_prospeccion_correo_suprimido()
    is 'Sincroniza supresiones de correo de tenant_email_suppressions hacia prospectos.';

comment on function public.sync_prospeccion_correo_suprimido_on_prospecto()
    is 'Calcula la supresion activa al insertar o cambiar el correo de un prospecto.';
