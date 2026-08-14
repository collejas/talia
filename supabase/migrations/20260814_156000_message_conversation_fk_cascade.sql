-- Permite corregir el tenant de una conversación y propagarlo a sus mensajes.
alter table public.mensajes
  drop constraint if exists mensajes_conversacion_org_fkey;

alter table public.mensajes
  add constraint mensajes_conversacion_org_fkey
  foreign key (organizacion_id, conversacion_id)
  references public.conversaciones (organizacion_id, id)
  on update cascade
  on delete cascade;
