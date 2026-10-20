begin;

alter table public.prospeccion_contacto_templates
    add column if not exists meta_header_format text not null default 'none',
    add column if not exists meta_header_text text,
    add column if not exists meta_header_logo_id uuid references public.logos(id) on delete set null,
    add column if not exists meta_header_sample_handle text,
    add column if not exists meta_footer_text text;

alter table public.prospeccion_contacto_templates
    drop constraint if exists prospeccion_contacto_templates_meta_header_format_check;

alter table public.prospeccion_contacto_templates
    add constraint prospeccion_contacto_templates_meta_header_format_check
    check (meta_header_format in ('none', 'text', 'image', 'video', 'document'));

create table if not exists public.prospeccion_contacto_template_botones (
    id uuid primary key default gen_random_uuid(),
    organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
    template_id uuid not null references public.prospeccion_contacto_templates(id) on delete cascade,
    posicion smallint not null check (posicion between 1 and 2),
    tipo text not null check (tipo in ('quick_reply', 'url', 'phone')),
    texto text not null check (char_length(btrim(texto)) between 1 and 25),
    url text,
    telefono text,
    payload text,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    unique (template_id, posicion),
    check (
        (tipo = 'quick_reply' and url is null and telefono is null)
        or (tipo = 'url' and url is not null and telefono is null)
        or (tipo = 'phone' and telefono is not null and url is null)
    )
);

create index if not exists prospeccion_contacto_template_botones_org_template_idx
    on public.prospeccion_contacto_template_botones (organizacion_id, template_id, posicion);

comment on column public.prospeccion_contacto_templates.meta_header_format is
    'Formato del encabezado enviado a Meta: none, text, image, video o document.';
comment on column public.prospeccion_contacto_templates.meta_header_logo_id is
    'Logo/media del tenant usado como ejemplo del encabezado en Meta.';
comment on column public.prospeccion_contacto_templates.meta_header_sample_handle is
    'Handle temporal devuelto por Meta al cargar el ejemplo multimedia.';
comment on table public.prospeccion_contacto_template_botones is
    'Botones estructurados de plantillas WhatsApp Meta, aislados por tenant.';

commit;
