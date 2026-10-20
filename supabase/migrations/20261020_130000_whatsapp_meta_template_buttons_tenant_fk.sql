begin;

create unique index if not exists prospeccion_contacto_templates_org_id_key
    on public.prospeccion_contacto_templates (organizacion_id, id);

alter table public.prospeccion_contacto_template_botones
    drop constraint if exists prospeccion_contacto_template_botones_template_id_fkey;

alter table public.prospeccion_contacto_template_botones
    add constraint prospeccion_contacto_template_botones_template_org_fkey
    foreign key (organizacion_id, template_id)
    references public.prospeccion_contacto_templates (organizacion_id, id)
    on delete cascade;

commit;
