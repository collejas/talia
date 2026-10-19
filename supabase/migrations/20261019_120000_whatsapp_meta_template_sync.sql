begin;

alter table public.prospeccion_contacto_templates
    add column if not exists meta_template_id text,
    add column if not exists meta_status text,
    add column if not exists meta_rejected_reason text,
    add column if not exists meta_created_at timestamptz,
    add column if not exists meta_synced_at timestamptz,
    add column if not exists meta_last_error_code text;

alter table public.prospeccion_contacto_templates
    drop constraint if exists prospeccion_contacto_templates_template_status_check;

alter table public.prospeccion_contacto_templates
    add constraint prospeccion_contacto_templates_template_status_check
    check (
        template_status is null
        or template_status in (
            'draft', 'pending', 'approved', 'rejected', 'paused', 'disabled', 'archived'
        )
    );

alter table public.prospeccion_contacto_templates
    drop constraint if exists prospeccion_contacto_templates_meta_status_check;

alter table public.prospeccion_contacto_templates
    add constraint prospeccion_contacto_templates_meta_status_check
    check (
        meta_status is null
        or meta_status in (
            'draft', 'pending', 'approved', 'rejected', 'paused', 'disabled', 'archived'
        )
    );

create unique index if not exists prospeccion_contacto_templates_org_meta_id_unique
    on public.prospeccion_contacto_templates (organizacion_id, meta_template_id)
    where canal = 'whatsapp'
      and usage_scope = 'whats_prosp'
      and provider = 'meta'
      and meta_template_id is not null;

create index if not exists prospeccion_contacto_templates_meta_sync_idx
    on public.prospeccion_contacto_templates (
        organizacion_id,
        template_status,
        meta_synced_at desc
    )
    where canal = 'whatsapp'
      and usage_scope = 'whats_prosp'
      and provider = 'meta';

comment on column public.prospeccion_contacto_templates.meta_template_id is
    'Identificador de la plantilla en Meta WhatsApp Business Account.';
comment on column public.prospeccion_contacto_templates.meta_status is
    'Estado recibido desde Meta; no debe ser controlado por el frontend.';
comment on column public.prospeccion_contacto_templates.meta_rejected_reason is
    'Motivo sanitizado informado por Meta cuando la plantilla es rechazada.';
comment on column public.prospeccion_contacto_templates.meta_created_at is
    'Fecha de creación remota reportada por la integración Meta, si existe.';
comment on column public.prospeccion_contacto_templates.meta_synced_at is
    'Última fecha en que el estado remoto fue sincronizado.';
comment on column public.prospeccion_contacto_templates.meta_last_error_code is
    'Código técnico sanitizado de la última operación Meta fallida.';

commit;
