-- Los registros de idempotencia del aviso al cliente son auxiliares de la
-- conversación/oportunidad. Deben desaparecer cuando la limpieza física de
-- WhatsApp elimina esos registros padre mediante el RPC administrativo.

alter table public.whatsapp_customer_seller_notifications
  drop constraint if exists whatsapp_customer_seller_notifications_conversacion_id_fkey,
  drop constraint if exists whatsapp_customer_seller_notifications_oportunidad_id_fkey;

alter table public.whatsapp_customer_seller_notifications
  add constraint whatsapp_customer_seller_notifications_conversacion_id_fkey
    foreign key (conversacion_id)
    references public.conversaciones(id)
    on delete cascade,
  add constraint whatsapp_customer_seller_notifications_oportunidad_id_fkey
    foreign key (oportunidad_id)
    references public.oportunidades(id)
    on delete cascade;
