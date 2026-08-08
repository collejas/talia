begin;

-- Expone el origen derivado del hilo cuando una conversación agrupada tiene
-- atribución CTA. Así la capa API no elimina el hilo por conservar un source
-- histórico general en la fila principal.
do $migration$
declare
  function_sql text;
  old_fragment text := E'  t.canal, t.source, t.batch_id, t.campana_id, t.estado, t.prioridad, t.iniciada_en,';
  new_fragment text := E'  t.canal,\n  case\n    when exists (\n      select 1\n      from public.inbox_thread_conversations relation\n      join public.prospeccion_whatsapp_atribucion_eventos attribution\n        on attribution.organizacion_id = relation.organizacion_id\n       and attribution.conversacion_id = relation.conversacion_id\n      where relation.organizacion_id = t.organizacion_id\n        and relation.inbox_thread_id = t.id\n    ) then ''publicidad_whatsapp''\n    else t.source\n  end,\n  t.batch_id, t.campana_id, t.estado, t.prioridad, t.iniciada_en,';
begin
  select pg_get_functiondef(
    'public.panel_inbox_threads_persisted(text,uuid,integer,integer,integer,text,text,uuid,uuid,timestamptz,timestamptz)'::regprocedure
  ) into function_sql;

  if strpos(function_sql, old_fragment) > 0 then
    execute replace(function_sql, old_fragment, new_fragment);
  elsif strpos(function_sql, new_fragment) = 0 then
    raise exception 'No se encontró la selección source esperada de panel_inbox_threads_persisted';
  end if;
end;
$migration$;

commit;
