create table if not exists public.whatsapp_meta_connections (
    organizacion_id uuid primary key references public.organizaciones(id) on delete cascade,
    waba_id text not null,
    phone_number_id text not null,
    estado text not null default 'pendiente' check (estado in ('pendiente', 'validado', 'registrado', 'suscrito', 'conectado', 'error')),
    ultimo_validado_en timestamptz,
    registrado_en timestamptz,
    suscrito_en timestamptz,
    conectado_en timestamptz,
    ultimo_error_codigo text,
    ultimo_error_mensaje text,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint whatsapp_meta_connections_waba_phone_uq unique (waba_id, phone_number_id),
    constraint whatsapp_meta_connections_phone_uq unique (phone_number_id)
);

create index if not exists whatsapp_meta_connections_waba_idx on public.whatsapp_meta_connections (waba_id);
alter table public.whatsapp_meta_connections enable row level security;

comment on table public.whatsapp_meta_connections is 'Estado auditable del onboarding asistido de Meta WhatsApp; los secretos permanecen fuera de esta tabla.';
