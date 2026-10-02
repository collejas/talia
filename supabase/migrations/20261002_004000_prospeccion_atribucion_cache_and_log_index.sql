-- Evita que la navegación ejecute la agregación histórica de atribución.
-- La ruta interactiva solo lee snapshots generados fuera del camino crítico.
create or replace function public.prospeccion_campana_atribucion_cache_ultimo(
    p_campana_id uuid default null,
    p_limit integer default 200,
    p_offset integer default 0
)
returns table(
    campana_id uuid,
    campana_nombre text,
    canal text,
    template_id uuid,
    template_slug text,
    template_nombre text,
    twilio_content_sid text,
    envios_totales bigint,
    envios_enviados bigint,
    envios_entregados bigint,
    envios_fallidos bigint,
    envios_omitidos bigint,
    envios_respondidos bigint,
    brevo_aperturas bigint,
    brevo_clicks bigint,
    sesiones_utm bigint,
    tasa_entrega_pct numeric,
    tasa_respuesta_pct numeric,
    click_to_session_pct numeric,
    actualizado_en timestamptz
)
language sql
stable
security definer
set search_path = public
as $function$
with ultimo_periodo as (
    select c.periodo_desde, c.periodo_hasta
    from public.prospeccion_campana_atribucion_cache c
    where c.organizacion_id = coalesce(
        nullif((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
        public.usuario_organizacion_id(auth.uid())
    )
    order by c.periodo_hasta desc, c.periodo_desde desc
    limit 1
)
select
    c.campana_id, c.campana_nombre, c.canal, c.template_id,
    c.template_slug, c.template_nombre, c.twilio_content_sid,
    c.envios_totales, c.envios_enviados, c.envios_entregados,
    c.envios_fallidos, c.envios_omitidos, c.envios_respondidos,
    c.brevo_aperturas, c.brevo_clicks, c.sesiones_utm,
    c.tasa_entrega_pct, c.tasa_respuesta_pct, c.click_to_session_pct,
    c.actualizado_en
from public.prospeccion_campana_atribucion_cache c
join ultimo_periodo u
  on u.periodo_desde = c.periodo_desde
 and u.periodo_hasta = c.periodo_hasta
where c.organizacion_id = coalesce(
        nullif((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
        public.usuario_organizacion_id(auth.uid())
    )
  and (p_campana_id is null or c.campana_id = p_campana_id)
order by c.envios_totales desc, c.campana_nombre nulls last,
         c.template_nombre, c.twilio_content_sid nulls last
limit greatest(1, coalesce(p_limit, 200))
offset greatest(coalesce(p_offset, 0), 0);
$function$;

revoke all on function public.prospeccion_campana_atribucion_cache_ultimo(uuid, integer, integer)
    from public, anon, authenticated;
grant execute on function public.prospeccion_campana_atribucion_cache_ultimo(uuid, integer, integer)
    to service_role;

-- El listado de indicadores filtra por prospecto, canal y ordena por fecha.
-- El índice existente no cubre el ORDER BY y fuerza trabajo adicional sobre
-- una bitácora que ya supera cientos de miles de filas.
create index if not exists prospeccion_contactos_log_prospecto_canal_creado_idx
    on public.prospeccion_contactos_log (prospecto_id, canal, creado_en desc)
    where prospecto_id is not null;
