-- Propaga la corrección de tenant de conversaciones al ledger de cobros.
alter table public.cobro_mensajes
  drop constraint if exists cobro_mensajes_org_conversation_fk;

alter table public.cobro_mensajes
  add constraint cobro_mensajes_org_conversation_fk
  foreign key (organizacion_id, conversacion_id)
  references public.conversaciones (organizacion_id, id)
  on update cascade
  on delete cascade;
