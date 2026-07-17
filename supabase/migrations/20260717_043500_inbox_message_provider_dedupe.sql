create unique index if not exists mensajes_org_provider_message_uidx
  on public.mensajes (organizacion_id, proveedor_mensaje_id)
  where proveedor_mensaje_id is not null;
