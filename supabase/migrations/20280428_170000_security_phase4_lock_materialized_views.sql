-- Fase 4: cerrar acceso directo a materialized views expuestas por API
-- Se mantienen funciones SECURITY DEFINER para uso autenticado.

begin;

revoke all on public.inbox_conversation_snapshot_mv from anon;
revoke all on public.inbox_conversation_snapshot_mv from authenticated;
grant select on public.inbox_conversation_snapshot_mv to service_role;

revoke all on public.mv_resultados_por_actividad from anon;
revoke all on public.mv_resultados_por_actividad from authenticated;
grant select on public.mv_resultados_por_actividad to service_role;

revoke all on public.prospeccion_query_daily_mv from anon;
revoke all on public.prospeccion_query_daily_mv from authenticated;
grant select on public.prospeccion_query_daily_mv to service_role;

commit;
