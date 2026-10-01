-- Resumen persistente para que el panel no agregue todo el histórico en cada
-- navegación. Los datos de negocio se mantienen en columnas explícitas.
create table if not exists public.prospeccion_campana_atribucion_cache (
    id bigserial primary key,
    organizacion_id uuid not null,
    periodo_desde timestamptz not null,
    periodo_hasta timestamptz not null,
    campana_id uuid,
    campana_nombre text,
    canal text,
    template_id uuid,
    template_slug text,
    template_nombre text,
    twilio_content_sid text,
    envios_totales bigint not null default 0,
    envios_enviados bigint not null default 0,
    envios_entregados bigint not null default 0,
    envios_fallidos bigint not null default 0,
    envios_omitidos bigint not null default 0,
    envios_respondidos bigint not null default 0,
    brevo_aperturas bigint not null default 0,
    brevo_clicks bigint not null default 0,
    sesiones_utm bigint not null default 0,
    tasa_entrega_pct numeric not null default 0,
    tasa_respuesta_pct numeric not null default 0,
    click_to_session_pct numeric not null default 0,
    actualizado_en timestamptz not null default now(),
    constraint prospeccion_campana_atribucion_cache_periodo_ck
        check (periodo_desde <= periodo_hasta)
);

create unique index if not exists prospeccion_campana_atribucion_cache_key
    on public.prospeccion_campana_atribucion_cache (
        organizacion_id,
        periodo_desde,
        periodo_hasta,
        coalesce(campana_id, '00000000-0000-0000-0000-000000000000'::uuid),
        coalesce(template_id, '00000000-0000-0000-0000-000000000000'::uuid),
        coalesce(template_slug, ''),
        coalesce(twilio_content_sid, '')
    );

create index if not exists prospeccion_campana_atribucion_cache_lookup_idx
    on public.prospeccion_campana_atribucion_cache
    (organizacion_id, periodo_desde, periodo_hasta, actualizado_en desc);

create or replace function public.prospeccion_campana_atribucion_cache_refresh(
    p_date_from timestamptz,
    p_date_to timestamptz,
    p_campana_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
    v_organizacion_id uuid;
    v_count integer;
begin
    v_organizacion_id := coalesce(
        nullif((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
        public.usuario_organizacion_id(auth.uid())
    );
    if v_organizacion_id is null or p_date_from is null or p_date_to is null then
        raise exception 'atribucion_cache_context_invalid';
    end if;
    if p_date_from > p_date_to then
        raise exception 'atribucion_cache_period_invalid';
    end if;

    -- La reconstrucción se ejecuta fuera de la navegación del panel.
    perform set_config('statement_timeout', '120000', true);

    delete from public.prospeccion_campana_atribucion_cache
    where organizacion_id = v_organizacion_id
      and periodo_desde = p_date_from
      and periodo_hasta = p_date_to
      and (p_campana_id is null or campana_id = p_campana_id);

    insert into public.prospeccion_campana_atribucion_cache (
        organizacion_id, periodo_desde, periodo_hasta,
        campana_id, campana_nombre, canal, template_id, template_slug,
        template_nombre, twilio_content_sid, envios_totales,
        envios_enviados, envios_entregados, envios_fallidos, envios_omitidos,
        envios_respondidos, brevo_aperturas, brevo_clicks, sesiones_utm,
        tasa_entrega_pct, tasa_respuesta_pct, click_to_session_pct,
        actualizado_en
    )
    select
        v_organizacion_id, p_date_from, p_date_to,
        r.campana_id, r.campana_nombre, r.canal, r.template_id,
        r.template_slug, r.template_nombre, r.twilio_content_sid,
        r.envios_totales, r.envios_enviados, r.envios_entregados,
        r.envios_fallidos, r.envios_omitidos, r.envios_respondidos,
        r.brevo_aperturas, r.brevo_clicks, r.sesiones_utm,
        r.tasa_entrega_pct, r.tasa_respuesta_pct, r.click_to_session_pct,
        now()
    from public.prospeccion_campana_template_atribucion_rango(
        p_campana_id => p_campana_id,
        p_limit => 1000,
        p_date_from => p_date_from,
        p_date_to => p_date_to,
        p_offset => 0
    ) r;

    get diagnostics v_count = row_count;
    return v_count;
end;
$function$;

create or replace function public.prospeccion_campana_atribucion_cache_rango(
    p_date_from timestamptz,
    p_date_to timestamptz,
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
select
    c.campana_id, c.campana_nombre, c.canal, c.template_id,
    c.template_slug, c.template_nombre, c.twilio_content_sid,
    c.envios_totales, c.envios_enviados, c.envios_entregados,
    c.envios_fallidos, c.envios_omitidos, c.envios_respondidos,
    c.brevo_aperturas, c.brevo_clicks, c.sesiones_utm,
    c.tasa_entrega_pct, c.tasa_respuesta_pct, c.click_to_session_pct,
    c.actualizado_en
from public.prospeccion_campana_atribucion_cache c
where c.organizacion_id = coalesce(
        nullif((current_setting('request.headers', true)::json->>'x-organizacion-id'), '')::uuid,
        public.usuario_organizacion_id(auth.uid())
    )
  and c.periodo_desde = p_date_from
  and c.periodo_hasta = p_date_to
  and (p_campana_id is null or c.campana_id = p_campana_id)
order by c.envios_totales desc, c.campana_nombre nulls last,
         c.template_nombre, c.twilio_content_sid nulls last
limit greatest(1, coalesce(p_limit, 200))
offset greatest(coalesce(p_offset, 0), 0);
$function$;

grant execute on function public.prospeccion_campana_atribucion_cache_refresh(timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.prospeccion_campana_atribucion_cache_rango(timestamptz, timestamptz, uuid, integer, integer) to service_role;
