BEGIN;

CREATE INDEX IF NOT EXISTS inbox_threads_org_unread_last_idx
  ON public.inbox_threads (organizacion_id, ultimo_mensaje_en DESC, id DESC)
  WHERE no_leidos > 0;

CREATE OR REPLACE FUNCTION public.panel_inbox_resumen_persisted()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH counts AS (
  SELECT
    count(*) AS total,
    coalesce(sum(greatest(no_leidos, 0)), 0) AS unread,
    count(*) FILTER (WHERE lower(estado) = 'pendiente') AS awaiting,
    count(*) FILTER (WHERE lower(estado) = 'abierta') AS abiertas,
    count(*) FILTER (WHERE lower(estado) = 'cerrada') AS cerradas,
    count(*) FILTER (WHERE asignado_a_usuario_id = (SELECT auth.uid())) AS asignadas_a_mi
  FROM public.inbox_threads
  WHERE organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
)
SELECT jsonb_build_object(
  'total', coalesce((SELECT total FROM counts), 0),
  'unread', coalesce((SELECT unread FROM counts), 0),
  'awaiting', coalesce((SELECT awaiting FROM counts), 0),
  'open', coalesce((SELECT abiertas FROM counts), 0),
  'closed', coalesce((SELECT cerradas FROM counts), 0),
  'assigned', coalesce((SELECT asignadas_a_mi FROM counts), 0),
  'folders', jsonb_build_array(
    jsonb_build_object('id', 'inbox', 'count', coalesce((SELECT abiertas + awaiting FROM counts), 0)),
    jsonb_build_object('id', 'assigned', 'count', coalesce((SELECT asignadas_a_mi FROM counts), 0)),
    jsonb_build_object('id', 'pending', 'count', coalesce((SELECT awaiting FROM counts), 0)),
    jsonb_build_object('id', 'closed', 'count', coalesce((SELECT cerradas FROM counts), 0))
  )
);
$$;

CREATE OR REPLACE FUNCTION public.panel_inbox_mark_thread_read(p_conversacion_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread_id uuid;
  v_updated integer;
BEGIN
  SELECT rel.inbox_thread_id
  INTO v_thread_id
  FROM public.inbox_thread_conversations rel
  JOIN public.inbox_threads thread ON thread.id = rel.inbox_thread_id
  WHERE rel.conversacion_id = p_conversacion_id
    AND thread.organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()));

  IF v_thread_id IS NULL THEN
    RAISE EXCEPTION 'inbox_thread_not_found' USING ERRCODE = '42501';
  END IF;

  UPDATE public.conversaciones conversation
  SET no_leidos = 0
  FROM public.inbox_thread_conversations rel
  WHERE rel.inbox_thread_id = v_thread_id
    AND rel.conversacion_id = conversation.id
    AND conversation.no_leidos > 0;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

DO $migration$
DECLARE
  function_sql text;
  old_fragment text := E'    and (p_estado is null or lower(t.estado) = lower(p_estado))';
  new_fragment text := E'    and (\n      p_estado is null\n      or (lower(p_estado) = ''unread'' and t.no_leidos > 0)\n      or (lower(p_estado) = ''awaiting'' and lower(t.estado) = ''pendiente'')\n      or (lower(p_estado) = ''archived'' and lower(t.estado) = ''cerrada'')\n      or (lower(p_estado) not in (''unread'', ''awaiting'', ''archived'') and lower(t.estado) = lower(p_estado))\n    )';
BEGIN
  SELECT pg_get_functiondef(
    'public.panel_inbox_threads_persisted(text,uuid,integer,integer,integer,text,text,uuid,uuid,timestamptz,timestamptz)'::regprocedure
  ) INTO function_sql;

  IF strpos(function_sql, old_fragment) > 0 THEN
    EXECUTE replace(function_sql, old_fragment, new_fragment);
  ELSIF strpos(function_sql, new_fragment) = 0 THEN
    RAISE EXCEPTION 'No se encontró el filtro esperado de panel_inbox_threads_persisted';
  END IF;
END;
$migration$;

REVOKE ALL ON FUNCTION public.panel_inbox_resumen_persisted() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.panel_inbox_mark_thread_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.panel_inbox_resumen_persisted() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.panel_inbox_mark_thread_read(uuid) TO authenticated, service_role;

COMMIT;
