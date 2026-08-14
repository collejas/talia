-- Permite corregir la organización de un mensaje manteniendo la integridad
-- de las referencias compuestas del ledger de cobro.
alter table public.cobro_mensajes
  drop constraint if exists cobro_mensajes_org_message_fk;

alter table public.cobro_mensajes
  add constraint cobro_mensajes_org_message_fk
  foreign key (organizacion_id, mensaje_id)
  references public.mensajes (organizacion_id, id)
  on update cascade
  on delete cascade;
