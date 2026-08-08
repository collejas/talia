begin;

-- Un hilo puede agrupar varias conversaciones del mismo teléfono. La
-- atribución debe buscarse en toda la relación, no sólo en la conversación
-- canónica más reciente del hilo.
do $migration$
declare
  function_sql text;
  old_fragment text := E'    and (\n      p_source is null\n      or lower(coalesce(t.source, '''')) = lower(p_source)\n      or (\n        lower(p_source) = ''publicidad_whatsapp''\n        and exists (\n          select 1\n          from public.prospeccion_whatsapp_atribucion_eventos attribution\n          where attribution.organizacion_id = t.organizacion_id\n            and attribution.conversacion_id = t.conversacion_canonica_id\n        )\n      )\n    )';
  new_fragment text := E'    and (\n      p_source is null\n      or lower(coalesce(t.source, '''')) = lower(p_source)\n      or (\n        lower(p_source) = ''publicidad_whatsapp''\n        and exists (\n          select 1\n          from public.inbox_thread_conversations relation\n          join public.prospeccion_whatsapp_atribucion_eventos attribution\n            on attribution.organizacion_id = relation.organizacion_id\n           and attribution.conversacion_id = relation.conversacion_id\n          where relation.organizacion_id = t.organizacion_id\n            and relation.inbox_thread_id = t.id\n        )\n      )\n    )';
begin
  select pg_get_functiondef(
    'public.panel_inbox_threads_persisted(text,uuid,integer,integer,integer,text,text,uuid,uuid,timestamptz,timestamptz)'::regprocedure
  ) into function_sql;

  if strpos(function_sql, old_fragment) > 0 then
    execute replace(function_sql, old_fragment, new_fragment);
  elsif strpos(function_sql, new_fragment) = 0 then
    raise exception 'No se encontró el filtro CTA agrupado esperado';
  end if;
end;
$migration$;

commit;
