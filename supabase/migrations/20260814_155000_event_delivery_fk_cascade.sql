-- Mantiene la integridad de eventos_entrega al corregir el tenant del mensaje.
alter table public.eventos_entrega
  drop constraint if exists eventos_entrega_mensaje_org_fkey;

alter table public.eventos_entrega
  add constraint eventos_entrega_mensaje_org_fkey
  foreign key (organizacion_id, mensaje_id)
  references public.mensajes (organizacion_id, id)
  on update cascade
  on delete cascade;
