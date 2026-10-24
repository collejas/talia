-- El API llama esta RPC con el JWT del usuario para conservar el contexto de tenant.
grant execute on function public.panel_visitantes_whatsapp_conversation_contacts_v1(uuid, timestamptz, timestamptz) to authenticated;
