-- Resumen comercial de campañas WhatsApp.
-- La unidad de conversión es la conversación; los mensajes solo aportan
-- evidencia de envío, entrega y costo. No crea ni modifica cobros.

create or replace function public.campana_conversion_resumen_rango(
    p_organizacion_id uuid,
    p_campana_id uuid default null,
    p_desde timestamptz default null,
    p_hasta timestamptz default null,
    p_limite integer default 100,
    p_offset integer default 0
)
returns table (
    campana_id uuid,
    campana_nombre text,
    canal text,
    envios bigint,
    entregados bigint,
    conversaciones bigint,
    respondieron bigint,
    oportunidades bigint,
    clientes bigint,
    costo_total numeric,
    costo_por_oportunidad numeric,
    costo_adquisicion numeric,
    tasa_entrega_pct numeric,
    tasa_respuesta_pct numeric,
    tasa_cierre_pct numeric,
    pendientes_cobro bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_organizacion_id is null then
        raise exception 'p_organizacion_id es obligatorio'
            using errcode = '22023';
    end if;
    if p_limite is null or p_limite < 1 or p_limite > 1000 then
        raise exception 'p_limite debe estar entre 1 y 1000'
            using errcode = '22023';
    end if;
    if p_offset is null or p_offset < 0 then
        raise exception 'p_offset no puede ser negativo'
            using errcode = '22023';
    end if;
    if p_desde is not null and p_hasta is not null and p_desde >= p_hasta then
        raise exception 'El rango de fechas es inválido'
            using errcode = '22023';
    end if;

    return query
    with campaign_messages as (
        select
            a.organizacion_id,
            a.campana_id,
            a.mensaje_id,
            a.conversacion_id,
            a.entregado_en,
            a.cobro_mensaje_id,
            m.creado_en as enviado_en
        from public.campana_mensaje_atribucion a
        join public.mensajes m
          on m.organizacion_id = a.organizacion_id
         and m.id = a.mensaje_id
        where a.organizacion_id = p_organizacion_id
          and a.tipo_atribucion = 'envio_campana'
          and a.direccion = 'saliente'
          and a.mensaje_id is not null
          and (p_campana_id is null or a.campana_id = p_campana_id)
          and (p_desde is null or m.creado_en >= p_desde)
          and (p_hasta is null or m.creado_en < p_hasta)
    ),
    conversation_cohort as (
        select distinct
            cm.organizacion_id,
            cm.campana_id,
            cm.conversacion_id
        from campaign_messages cm
        where cm.conversacion_id is not null
    ),
    message_totals as (
        select
            cm.campana_id,
            count(distinct cm.mensaje_id) as envios,
            count(distinct cm.mensaje_id) filter (
                where cm.entregado_en is not null
            ) as entregados,
            count(*) filter (
                where cm.cobro_mensaje_id is null
            ) as pendientes_cobro
        from campaign_messages cm
        group by cm.campana_id
    ),
    conversation_costs as (
        select
            cohort.campana_id,
            cohort.conversacion_id,
            coalesce(sum(cobro.costo_total_mensaje), 0)::numeric as costo_total
        from conversation_cohort cohort
        left join public.cobro_mensajes cobro
          on cobro.organizacion_id = cohort.organizacion_id
         and cobro.conversacion_id = cohort.conversacion_id
        group by cohort.campana_id, cohort.conversacion_id
    ),
    conversion_totals as (
        select
            cohort.campana_id,
            count(*) as conversaciones,
            count(*) filter (where conversion.respondio_en is not null) as respondieron,
            count(*) filter (where conversion.oportunidad_id is not null) as oportunidades,
            count(*) filter (where conversion.estado_atribucion = 'ganada') as clientes
        from conversation_cohort cohort
        left join public.campana_conversion conversion
          on conversion.organizacion_id = cohort.organizacion_id
         and conversion.campana_id = cohort.campana_id
         and conversion.conversacion_id = cohort.conversacion_id
        group by cohort.campana_id
    ),
    costs_by_campaign as (
        select
            conversation_costs.campana_id,
            coalesce(sum(conversation_costs.costo_total), 0)::numeric as costo_total
        from conversation_costs
        group by conversation_costs.campana_id
    )
    select
        campana.id,
        campana.nombre,
        campana.canal,
        coalesce(messages.envios, 0)::bigint,
        coalesce(messages.entregados, 0)::bigint,
        coalesce(conversions.conversaciones, 0)::bigint,
        coalesce(conversions.respondieron, 0)::bigint,
        coalesce(conversions.oportunidades, 0)::bigint,
        coalesce(conversions.clientes, 0)::bigint,
        coalesce(costs.costo_total, 0)::numeric,
        case
            when coalesce(conversions.oportunidades, 0) > 0
                then round(coalesce(costs.costo_total, 0) / conversions.oportunidades, 4)
            else 0
        end,
        case
            when coalesce(conversions.clientes, 0) > 0
                then round(coalesce(costs.costo_total, 0) / conversions.clientes, 4)
            else 0
        end,
        case
            when coalesce(messages.envios, 0) > 0
                then round(messages.entregados::numeric / messages.envios * 100, 2)
            else 0
        end,
        case
            when coalesce(conversions.conversaciones, 0) > 0
                then round(conversions.respondieron::numeric / conversions.conversaciones * 100, 2)
            else 0
        end,
        case
            when coalesce(conversions.oportunidades, 0) > 0
                then round(conversions.clientes::numeric / conversions.oportunidades * 100, 2)
            else 0
        end,
        coalesce(messages.pendientes_cobro, 0)::bigint
    from public.campanas campana
    left join message_totals messages on messages.campana_id = campana.id
    left join conversion_totals conversions on conversions.campana_id = campana.id
    left join costs_by_campaign costs on costs.campana_id = campana.id
    where campana.organizacion_id = p_organizacion_id
      and (p_campana_id is null or campana.id = p_campana_id)
      and messages.campana_id is not null
    order by coalesce(costs.costo_total, 0) desc, campana.nombre asc
    limit p_limite
    offset p_offset;
end;
$$;

revoke all on function public.campana_conversion_resumen_rango(uuid,uuid,timestamptz,timestamptz,integer,integer)
    from public, anon, authenticated;
grant execute on function public.campana_conversion_resumen_rango(uuid,uuid,timestamptz,timestamptz,integer,integer)
    to service_role;

comment on function public.campana_conversion_resumen_rango(uuid,uuid,timestamptz,timestamptz,integer,integer) is
    'Resumen comercial por campaña: conversaciones únicas, respuestas, oportunidades, clientes y costo total del ledger por conversación.';
