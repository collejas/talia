-- Completa las columnas canonicas de plantilla en envios historicos.
-- Es idempotente y no modifica payloads, estados ni eventos de envio.
update public.prospeccion_contacto_envio
set plantilla_id = (payload->>'template_id')::uuid
where canal = 'correo'
  and plantilla_id is null
  and nullif(payload->>'template_id', '') ~* '^[0-9a-f-]{36}$'
  and exists (
      select 1
      from public.prospeccion_contacto_templates t
      where t.id = (payload->>'template_id')::uuid
        and t.organizacion_id = prospeccion_contacto_envio.organizacion_id
  );

update public.prospeccion_contacto_envio
set version_id = (payload->>'version_id')::uuid
where version_id is null
  and nullif(payload->>'version_id', '') ~* '^[0-9a-f-]{36}$'
  and exists (
      select 1
      from public.prospeccion_plantilla_versiones v
      where v.id = (payload->>'version_id')::uuid
        and v.organizacion_id = prospeccion_contacto_envio.organizacion_id
  );
