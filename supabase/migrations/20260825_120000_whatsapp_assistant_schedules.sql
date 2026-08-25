create table if not exists public.whatsapp_asistente_horarios (
    id uuid primary key default gen_random_uuid(),
    organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
    activo boolean not null default false,
    zona_horaria text not null default 'UTC',
    aplica_a_normal boolean not null default true,
    aplica_a_prospeccion boolean not null default true,
    lunes_activo boolean not null default false,
    lunes_inicio time without time zone,
    lunes_fin time without time zone,
    martes_activo boolean not null default false,
    martes_inicio time without time zone,
    martes_fin time without time zone,
    miercoles_activo boolean not null default false,
    miercoles_inicio time without time zone,
    miercoles_fin time without time zone,
    jueves_activo boolean not null default false,
    jueves_inicio time without time zone,
    jueves_fin time without time zone,
    viernes_activo boolean not null default false,
    viernes_inicio time without time zone,
    viernes_fin time without time zone,
    sabado_activo boolean not null default false,
    sabado_inicio time without time zone,
    sabado_fin time without time zone,
    domingo_activo boolean not null default false,
    domingo_inicio time without time zone,
    domingo_fin time without time zone,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    actualizado_por_usuario_id uuid references public.usuarios(id) on delete set null,
    constraint whatsapp_asistente_horarios_organizacion_unique unique (organizacion_id),
    constraint whatsapp_asistente_horarios_timezone_not_blank check (length(trim(zona_horaria)) > 0),
    constraint whatsapp_asistente_horarios_lunes_complete check (
        not lunes_activo or (lunes_inicio is not null and lunes_fin is not null)
    ),
    constraint whatsapp_asistente_horarios_martes_complete check (
        not martes_activo or (martes_inicio is not null and martes_fin is not null)
    ),
    constraint whatsapp_asistente_horarios_miercoles_complete check (
        not miercoles_activo or (miercoles_inicio is not null and miercoles_fin is not null)
    ),
    constraint whatsapp_asistente_horarios_jueves_complete check (
        not jueves_activo or (jueves_inicio is not null and jueves_fin is not null)
    ),
    constraint whatsapp_asistente_horarios_viernes_complete check (
        not viernes_activo or (viernes_inicio is not null and viernes_fin is not null)
    ),
    constraint whatsapp_asistente_horarios_sabado_complete check (
        not sabado_activo or (sabado_inicio is not null and sabado_fin is not null)
    ),
    constraint whatsapp_asistente_horarios_domingo_complete check (
        not domingo_activo or (domingo_inicio is not null and domingo_fin is not null)
    )
);

create index if not exists whatsapp_asistente_horarios_organizacion_activo_idx
    on public.whatsapp_asistente_horarios (organizacion_id, activo);

create or replace function public.whatsapp_asistente_horarios_set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.actualizado_en = now();
    return new;
end;
$$;

drop trigger if exists whatsapp_asistente_horarios_updated_at on public.whatsapp_asistente_horarios;
create trigger whatsapp_asistente_horarios_updated_at
before update on public.whatsapp_asistente_horarios
for each row execute function public.whatsapp_asistente_horarios_set_updated_at();

alter table public.whatsapp_asistente_horarios enable row level security;

drop policy if exists whatsapp_asistente_horarios_service_role on public.whatsapp_asistente_horarios;
create policy whatsapp_asistente_horarios_service_role
on public.whatsapp_asistente_horarios
for all to service_role
using (true)
with check (true);

comment on table public.whatsapp_asistente_horarios is
    'Horario tenant-scoped para decidir si WhatsApp responde por IA fuera del horario humano.';
