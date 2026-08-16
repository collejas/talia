-- Capa de atribución comercial para campañas WhatsApp.
-- No modifica cobro_mensajes: el ledger financiero conserva su responsabilidad.

create table if not exists public.campana_mensaje_atribucion (
    id uuid primary key default gen_random_uuid(),
    organizacion_id uuid not null,
    campana_id uuid not null,
    lote_id uuid null,
    envio_id uuid null,
    mensaje_id uuid null,
    cobro_mensaje_id uuid null,
    conversacion_id uuid null,
    persona_id uuid null,
    direccion text not null,
    tipo_atribucion text not null,
    es_mensaje_inicial boolean not null default false,
    respondio boolean not null default false,
    entregado_en timestamptz null,
    respondio_en timestamptz null,
    regla_atribucion text not null,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint campana_mensaje_atribucion_org_fkey
        foreign key (organizacion_id) references public.organizaciones(id) on delete cascade,
    constraint campana_mensaje_atribucion_campana_org_fkey
        foreign key (organizacion_id, campana_id)
        references public.campanas(organizacion_id, id) on delete restrict,
    constraint campana_mensaje_atribucion_lote_org_fkey
        foreign key (organizacion_id, lote_id)
        references public.prospeccion_contacto_batch(organizacion_id, id) on delete set null,
    constraint campana_mensaje_atribucion_envio_org_fkey
        foreign key (organizacion_id, envio_id)
        references public.prospeccion_contacto_envio(organizacion_id, id) on delete set null,
    constraint campana_mensaje_atribucion_mensaje_org_fkey
        foreign key (organizacion_id, mensaje_id)
        references public.mensajes(organizacion_id, id) on delete cascade,
    constraint campana_mensaje_atribucion_cobro_fkey
        foreign key (cobro_mensaje_id)
        references public.cobro_mensajes(id) on delete set null,
    constraint campana_mensaje_atribucion_conversacion_org_fkey
        foreign key (organizacion_id, conversacion_id)
        references public.conversaciones(organizacion_id, id) on delete cascade,
    constraint campana_mensaje_atribucion_persona_org_fkey
        foreign key (organizacion_id, persona_id)
        references public.personas(organizacion_id, id) on delete set null,
    constraint campana_mensaje_atribucion_direccion_chk
        check (direccion in ('entrante', 'saliente')),
    constraint campana_mensaje_atribucion_tipo_chk
        check (tipo_atribucion in ('envio_campana', 'respuesta', 'seguimiento')),
    constraint campana_mensaje_atribucion_initial_direction_chk
        check (not es_mensaje_inicial or direccion = 'saliente'),
    constraint campana_mensaje_atribucion_response_timestamp_chk
        check (not respondio or respondio_en is not null),
    constraint campana_mensaje_atribucion_cobro_message_pair_chk
        check (cobro_mensaje_id is null or mensaje_id is not null)
);

create table if not exists public.campana_conversion (
    id uuid primary key default gen_random_uuid(),
    organizacion_id uuid not null,
    campana_id uuid not null,
    conversacion_id uuid not null,
    persona_id uuid null,
    mensaje_respuesta_id uuid null,
    oportunidad_id uuid null,
    respondio_en timestamptz null,
    oportunidad_creada_en timestamptz null,
    cliente_ganado_en timestamptz null,
    estado_atribucion text not null default 'respondio',
    regla_atribucion text not null,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint campana_conversion_org_fkey
        foreign key (organizacion_id) references public.organizaciones(id) on delete cascade,
    constraint campana_conversion_campana_org_fkey
        foreign key (organizacion_id, campana_id)
        references public.campanas(organizacion_id, id) on delete restrict,
    constraint campana_conversion_conversacion_org_fkey
        foreign key (organizacion_id, conversacion_id)
        references public.conversaciones(organizacion_id, id) on delete cascade,
    constraint campana_conversion_persona_org_fkey
        foreign key (organizacion_id, persona_id)
        references public.personas(organizacion_id, id) on delete set null,
    constraint campana_conversion_mensaje_org_fkey
        foreign key (organizacion_id, mensaje_respuesta_id)
        references public.mensajes(organizacion_id, id) on delete set null,
    constraint campana_conversion_oportunidad_org_fkey
        foreign key (organizacion_id, oportunidad_id)
        references public.oportunidades(organizacion_id, id) on delete set null,
    constraint campana_conversion_estado_chk
        check (estado_atribucion in ('respondio', 'oportunidad', 'ganada', 'perdida', 'pendiente'))
);

-- El costo se enlaza al mensaje local y al mismo tenant. Esto evita que un
-- cobro de otra organización pueda aparecer en una campaña distinta.
create or replace function public.tg_validate_campana_atribucion_cobro()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_cobro_organizacion_id uuid;
    v_cobro_mensaje_id uuid;
begin
    if new.cobro_mensaje_id is null then
        return new;
    end if;

    select cm.organizacion_id, cm.mensaje_id
      into v_cobro_organizacion_id, v_cobro_mensaje_id
      from public.cobro_mensajes cm
     where cm.id = new.cobro_mensaje_id;

    if not found then
        raise exception 'cobro_mensaje_id % no existe', new.cobro_mensaje_id
            using errcode = '23503';
    end if;

    if v_cobro_organizacion_id <> new.organizacion_id
       or v_cobro_mensaje_id <> new.mensaje_id then
        raise exception 'El cobro no coincide con el tenant o mensaje de atribución'
            using errcode = '23514';
    end if;

    return new;
end;
$$;

drop trigger if exists campana_mensaje_atribucion_validate_cobro
    on public.campana_mensaje_atribucion;
create trigger campana_mensaje_atribucion_validate_cobro
before insert or update of organizacion_id, mensaje_id, cobro_mensaje_id
on public.campana_mensaje_atribucion
for each row execute function public.tg_validate_campana_atribucion_cobro();

create or replace function public.tg_touch_campana_atribucion_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
    new.actualizado_en = now();
    return new;
end;
$$;

drop trigger if exists campana_mensaje_atribucion_touch_updated_at
    on public.campana_mensaje_atribucion;
create trigger campana_mensaje_atribucion_touch_updated_at
before update on public.campana_mensaje_atribucion
for each row execute function public.tg_touch_campana_atribucion_updated_at();

drop trigger if exists campana_conversion_touch_updated_at
    on public.campana_conversion;
create trigger campana_conversion_touch_updated_at
before update on public.campana_conversion
for each row execute function public.tg_touch_campana_atribucion_updated_at();

create unique index if not exists campana_mensaje_atribucion_org_mensaje_uidx
    on public.campana_mensaje_atribucion (organizacion_id, mensaje_id)
    where mensaje_id is not null;

create unique index if not exists campana_mensaje_atribucion_initial_conversation_uidx
    on public.campana_mensaje_atribucion (organizacion_id, campana_id, conversacion_id)
    where es_mensaje_inicial and conversacion_id is not null;

create index if not exists campana_mensaje_atribucion_org_campaign_created_idx
    on public.campana_mensaje_atribucion (organizacion_id, campana_id, creado_en desc);

create index if not exists campana_mensaje_atribucion_org_conversation_created_idx
    on public.campana_mensaje_atribucion (organizacion_id, conversacion_id, creado_en desc)
    where conversacion_id is not null;

create index if not exists campana_mensaje_atribucion_org_cobro_idx
    on public.campana_mensaje_atribucion (organizacion_id, cobro_mensaje_id)
    where cobro_mensaje_id is not null;

create index if not exists campana_mensaje_atribucion_pending_reconciliation_idx
    on public.campana_mensaje_atribucion (organizacion_id, campana_id, creado_en desc)
    where mensaje_id is not null and cobro_mensaje_id is null;

create unique index if not exists campana_conversion_org_campaign_conversation_uidx
    on public.campana_conversion (organizacion_id, campana_id, conversacion_id);

create index if not exists campana_conversion_org_campaign_created_idx
    on public.campana_conversion (organizacion_id, campana_id, creado_en desc);

create index if not exists campana_conversion_org_conversation_idx
    on public.campana_conversion (organizacion_id, conversacion_id);

create index if not exists campana_conversion_org_opportunity_idx
    on public.campana_conversion (organizacion_id, oportunidad_id)
    where oportunidad_id is not null;

alter table public.campana_mensaje_atribucion enable row level security;
alter table public.campana_conversion enable row level security;

drop policy if exists campana_mensaje_atribucion_select on public.campana_mensaje_atribucion;
create policy campana_mensaje_atribucion_select
on public.campana_mensaje_atribucion
for select to authenticated
using (
    (select es_owner(auth.uid()))
    or organizacion_id = (select usuario_organizacion_id(auth.uid()))
);

drop policy if exists campana_conversion_select on public.campana_conversion;
create policy campana_conversion_select
on public.campana_conversion
for select to authenticated
using (
    (select es_owner(auth.uid()))
    or organizacion_id = (select usuario_organizacion_id(auth.uid()))
);

grant select on public.campana_mensaje_atribucion to authenticated;
grant select on public.campana_conversion to authenticated;

comment on table public.campana_mensaje_atribucion is
    'Atribución de mensajes de campañas a conversaciones; no es ledger financiero.';
comment on table public.campana_conversion is
    'Conversión única por campaña y conversación; los hilos técnicos no son unidad comercial.';
comment on column public.campana_mensaje_atribucion.cobro_mensaje_id is
    'Enlace opcional al cargo existente; no duplica importes ni crea cobros.';
