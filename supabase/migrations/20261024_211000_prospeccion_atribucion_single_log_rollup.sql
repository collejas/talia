-- La RPC de atribución de correo recorría el mismo conjunto de logs dos veces:
-- una para respuestas y otra para aperturas/clics. Consolidar ambos cálculos en
-- un único GROUP BY por envio_id reduce lecturas temporales y CPU sin cambiar
-- los denominadores ni la semántica de los KPI.
do $migration$
declare
    v_def text;
begin
    select pg_get_functiondef(p.oid)
      into v_def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.oid = 'public.prospeccion_campana_template_atribucion_rango(uuid,integer,timestamptz,timestamptz,integer)'::regprocedure;

    if v_def is null then
        raise exception 'prospeccion_campana_template_atribucion_rango_not_found';
    end if;

    v_def := replace(v_def, $old$
respuesta_por_envio as (
    select l.envio_id,
        bool_or(
            lower(coalesce(l.accion, l.detalle->>'action', l.estado, '')) = any(array['respuesta', 'respondio', 'respondido', 'reply', 'reply_inbound'])
            or lower(coalesce(l.detalle->>'direction', '')) = any(array['inbound', 'incoming'])
            or coalesce(l.detalle->>'respondio', '') = 'true'
            or coalesce(l.detalle->>'respuesta', '') <> ''
        ) as respondio
    from scoped_logs l group by l.envio_id
),
engagement_por_envio as (
    select l.envio_id,
        ((count(*) filter (where lower(coalesce(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) in ('unique_opened', 'opened')) > 0
          or count(*) filter (where l.accion = 'postmark_open') > 0)::int) as aperturas,
        ((count(*) filter (where lower(coalesce(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) in ('unique_click', 'click')) > 0
          or count(*) filter (where l.accion = 'postmark_click') > 0)::int) as clicks
    from scoped_logs l group by l.envio_id
),
$old$, $new$
log_rollup as (
    select l.envio_id,
        bool_or(
            lower(coalesce(l.accion, l.detalle->>'action', l.estado, '')) = any(array['respuesta', 'respondio', 'respondido', 'reply', 'reply_inbound'])
            or lower(coalesce(l.detalle->>'direction', '')) = any(array['inbound', 'incoming'])
            or coalesce(l.detalle->>'respondio', '') = 'true'
            or coalesce(l.detalle->>'respuesta', '') <> ''
        ) as respondio,
        ((count(*) filter (where lower(coalesce(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) in ('unique_opened', 'opened')) > 0
          or count(*) filter (where l.accion = 'postmark_open') > 0)::int) as aperturas,
        ((count(*) filter (where lower(coalesce(l.detalle->>'event', l.detalle->'brevo'->>'event', '')) in ('unique_click', 'click')) > 0
          or count(*) filter (where l.accion = 'postmark_click') > 0)::int) as clicks
    from scoped_logs l
    group by l.envio_id
),
$new$);

    v_def := replace(v_def, 'left join respuesta_por_envio r on r.envio_id = eb.envio_id', 'left join log_rollup r on r.envio_id = eb.envio_id');
    v_def := replace(v_def, 'left join engagement_por_envio ep on ep.envio_id = eb.envio_id', '');
    v_def := replace(v_def, 'coalesce(sum(ep.aperturas), 0)::bigint', 'coalesce(sum(r.aperturas), 0)::bigint');
    v_def := replace(v_def, 'coalesce(sum(ep.clicks), 0)::bigint', 'coalesce(sum(r.clicks), 0)::bigint');
    v_def := replace(v_def, 'left join log_rollup r on r.envio_id = eb.envio_id\n    \n    group by', 'left join log_rollup r on r.envio_id = eb.envio_id\n    group by');

    execute v_def;
end;
$migration$;
