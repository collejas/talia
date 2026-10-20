begin;

alter table public.prospeccion_contacto_template_botones enable row level security;

drop policy if exists prospeccion_contacto_template_botones_member_org
    on public.prospeccion_contacto_template_botones;

create policy prospeccion_contacto_template_botones_member_org
    on public.prospeccion_contacto_template_botones
    for all
    using (organizacion_id = usuario_organizacion_id(auth.uid()))
    with check (organizacion_id = usuario_organizacion_id(auth.uid()));

commit;
