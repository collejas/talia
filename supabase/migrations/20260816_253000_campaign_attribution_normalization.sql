-- Corrección de normalización telefónica y reconciliación de campañas.
-- Reemplaza las RPC de atribución y resumen comercial.

-- Sincronización idempotente de la atribución de campañas WhatsApp.
-- Solo usa relaciones explícitas: batch/envío, mensaje y conversación.

create or replace function public.sync_campana_atribucion(
    p_organizacion_id uuid default null,
    p_desde timestamptz default null,
    p_limite integer default 10000
)
returns table (
    mensajes_campana bigint,
    mensajes_respuesta bigint,
    conversiones bigint,
    pendientes_cobro bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_mensajes_campana bigint := 0;
    v_mensajes_respuesta bigint := 0;
    v_conversiones bigint := 0;
begin
    if p_limite is null or p_limite < 1 or p_limite > 50000 then
        raise exception 'p_limite debe estar entre 1 y 50000'
            using errcode = '22023';
    end if;

    -- 1. Envíos iniciales: la campaña proviene del batch/envío operativo y
    -- del mensaje persistido. El vínculo preferente es el WAMID del envío;
    -- se conserva como fallback la relación explícita ya guardada en datos.
    -- No se cuentan envíos fallidos como mensajes válidos de campaña.
    with source_rows as (
        select distinct on (m.id)
            m.organizacion_id,
            b.campana_id,
            b.id as lote_id,
            e.id as envio_id,
            m.id as mensaje_id,
            cm.id as cobro_mensaje_id,
            m.conversacion_id,
            coalesce(cv.persona_id, cv.contacto_id) as persona_id,
            m.direccion,
            case
                when e.estado in ('entregado', 'leido')
                  or lower(coalesce(e.detalle->>'status', '')) in ('delivered', 'read', 'entregado', 'leido')
                then coalesce(delivery.entregado_en, e.procesado_en, e.creado_en)
                else delivery.entregado_en
            end as entregado_en,
            row_number() over (
                partition by m.organizacion_id, b.campana_id, m.conversacion_id
                order by m.creado_en, m.id
            ) as envio_orden
        from public.prospeccion_contacto_envio e
        join public.prospeccion_contacto_batch b
          on b.organizacion_id=e.organizacion_id
         and b.id=e.batch_id
        join public.mensajes m
          on m.organizacion_id=e.organizacion_id
         and (
             m.proveedor_mensaje_id=e.mensaje_id
             or (
                 nullif(m.datos->>'batch_id','')=b.id::text
                 and nullif(m.datos->>'envio_id','')=e.id::text
             )
         )
        join public.conversaciones cv
          on cv.organizacion_id=m.organizacion_id
         and cv.id=m.conversacion_id
        left join public.cobro_mensajes cm
          on cm.organizacion_id=m.organizacion_id
         and cm.mensaje_id=m.id
        left join lateral (
            select max(e.proveedor_ts) as entregado_en
            from public.eventos_entrega e
            where e.organizacion_id=m.organizacion_id
              and e.proveedor='meta'
              and e.proveedor_mensaje_id=m.proveedor_mensaje_id
              and e.evento in ('entregado','leido')
        ) delivery on true
        where m.direccion='saliente'
          and m.organizacion_id is not null
          and e.estado not in ('fallido','failed','error','cancelado')
          and b.campana_id is not null
          and (p_organizacion_id is null or m.organizacion_id=p_organizacion_id)
          and (p_desde is null or m.creado_en >= p_desde)
        order by m.id, m.creado_en
        limit p_limite
    )
    insert into public.campana_mensaje_atribucion (
        organizacion_id,
        campana_id,
        lote_id,
        envio_id,
        mensaje_id,
        cobro_mensaje_id,
        conversacion_id,
        persona_id,
        direccion,
        tipo_atribucion,
        es_mensaje_inicial,
        entregado_en,
        regla_atribucion
    )
    select
        s.organizacion_id,
        s.campana_id,
        s.lote_id,
        s.envio_id,
        s.mensaje_id,
        s.cobro_mensaje_id,
        s.conversacion_id,
        s.persona_id,
        s.direccion,
        'envio_campana',
        s.envio_orden=1
        and not exists (
            select 1
            from public.campana_mensaje_atribucion existing_initial
            where existing_initial.organizacion_id=s.organizacion_id
              and existing_initial.campana_id=s.campana_id
              and existing_initial.conversacion_id=s.conversacion_id
              and existing_initial.es_mensaje_inicial
        ),
        s.entregado_en,
        'batch_envio_explicito'
    from source_rows s
    on conflict (organizacion_id, mensaje_id) where mensaje_id is not null
    do update set
        cobro_mensaje_id=coalesce(
            public.campana_mensaje_atribucion.cobro_mensaje_id,
            excluded.cobro_mensaje_id
        ),
        entregado_en=excluded.entregado_en,
        actualizado_en=now();

    get diagnostics v_mensajes_campana = row_count;

    -- 2. Primera respuesta por campaña y conversación. Una conversación se
    -- cuenta una sola vez aunque contenga más mensajes o hilos técnicos.
    with outbound_campaign as (
        select distinct on (e.organizacion_id, b.campana_id, phone.phone10)
            e.organizacion_id,
            b.campana_id,
            m.conversacion_id as envio_conversacion_id,
            coalesce(cv.persona_id, cv.contacto_id) as envio_persona_id,
            e.creado_en as envio_en,
            phone.phone10
        from public.prospeccion_contacto_envio e
        join public.prospeccion_contacto_batch b
          on b.organizacion_id=e.organizacion_id and b.id=e.batch_id
        join public.prospeccion_prospectos prospecto
          on prospecto.id=e.prospecto_id
        left join public.mensajes m
          on m.organizacion_id=e.organizacion_id
         and m.proveedor_mensaje_id=e.mensaje_id
         and m.direccion='saliente'
        left join public.conversaciones cv
          on cv.organizacion_id=m.organizacion_id and cv.id=m.conversacion_id
        left join public.personas person
          on person.organizacion_id=e.organizacion_id and person.id=cv.persona_id
        left join public.contactos contact
          on contact.organizacion_id=e.organizacion_id and contact.id=cv.contacto_id
        cross join lateral (
            select right(regexp_replace(
                coalesce(
                    person.telefono_principal_e164,
                    contact.telefono_e164,
                    contact.telefono,
                    prospecto.phone_e164,
                    prospecto.telefono_principal_e164,
                    prospecto.phone
                ),
                '[^0-9]', '', 'g'
            ), 10) as phone10
        ) phone
        where e.estado not in ('fallido','failed','error','cancelado')
          and e.organizacion_id is not null
          and b.campana_id is not null
          and phone.phone10 is not null
          and (p_organizacion_id is null or e.organizacion_id=p_organizacion_id)
        order by e.organizacion_id,b.campana_id,phone.phone10,e.creado_en,e.id
    ), inbound_candidates as (
        select
            oc.organizacion_id,
            oc.campana_id,
            response_cv.id as conversacion_id,
            coalesce(response_cv.persona_id, response_cv.contacto_id) as persona_id,
            m.id as mensaje_id,
            m.creado_en as respondio_en,
            row_number() over (
                partition by oc.organizacion_id,oc.campana_id,oc.phone10
                order by m.creado_en,m.id
            ) as rn,
            row_number() over (
                partition by oc.organizacion_id,m.id
                order by oc.envio_en desc,oc.campana_id
            ) as mensaje_rn
        from outbound_campaign oc
        join public.conversaciones response_cv
          on response_cv.organizacion_id=oc.organizacion_id
        left join public.personas response_person
          on response_person.organizacion_id=response_cv.organizacion_id
         and response_person.id=response_cv.persona_id
        left join public.contactos response_contact
          on response_contact.organizacion_id=response_cv.organizacion_id
         and response_contact.id=response_cv.contacto_id
        cross join lateral (
            select right(regexp_replace(
                coalesce(
                    response_person.telefono_principal_e164,
                    response_contact.telefono_e164,
                    response_contact.telefono
                ),
                '[^0-9]', '', 'g'
            ), 10) as phone10
        ) response_phone
        join public.mensajes m
          on m.organizacion_id=oc.organizacion_id
         and m.conversacion_id=response_cv.id
         and m.direccion='entrante'
         and m.creado_en > oc.envio_en
         and response_phone.phone10=oc.phone10
        where (p_desde is null or m.creado_en >= p_desde)
    )
    insert into public.campana_mensaje_atribucion (
        organizacion_id,
        campana_id,
        mensaje_id,
        conversacion_id,
        persona_id,
        direccion,
        tipo_atribucion,
        respondio,
        respondio_en,
        regla_atribucion
    )
    select
        i.organizacion_id,
        i.campana_id,
        i.mensaje_id,
        i.conversacion_id,
        i.persona_id,
        'entrante',
        'respuesta',
        true,
        i.respondio_en,
        'primera_respuesta_conversacion'
    from inbound_candidates i
    where i.rn=1 and i.mensaje_rn=1
    on conflict (organizacion_id, mensaje_id) where mensaje_id is not null
    do update set
        respondio=true,
        respondio_en=coalesce(
            public.campana_mensaje_atribucion.respondio_en,
            excluded.respondio_en
        ),
        actualizado_en=now();

    get diagnostics v_mensajes_respuesta = row_count;

    -- 3. Una conversión por campaña y conversación. La oportunidad se busca
    -- por la relación explícita de conversación que ya usa CRM.
    with response_rows as (
        select distinct on (a.organizacion_id,a.campana_id,a.conversacion_id)
            a.organizacion_id,
            a.campana_id,
            a.conversacion_id,
            a.persona_id,
            a.mensaje_id,
            a.respondio_en
        from public.campana_mensaje_atribucion a
        where a.tipo_atribucion='respuesta'
          and (p_organizacion_id is null or a.organizacion_id=p_organizacion_id)
        order by a.organizacion_id,a.campana_id,a.conversacion_id,a.respondio_en,a.mensaje_id
    ), opportunity_rows as (
        select
            r.*,
            o.id as oportunidad_id,
            o.estado as oportunidad_estado,
            o.creado_en as oportunidad_creada_en,
            o.cerrado_en as oportunidad_cerrada_en
        from response_rows r
        left join lateral (
            select o.id,o.estado,o.creado_en,o.cerrado_en
            from public.oportunidades o
            where o.organizacion_id=r.organizacion_id
              and coalesce(
                    nullif(o.metadata->>'conversation_id',''),
                    nullif(o.metadata->>'conversacion_id','')
                  )=r.conversacion_id::text
            order by o.creado_en,o.id
            limit 1
        ) o on true
    )
    insert into public.campana_conversion (
        organizacion_id,
        campana_id,
        conversacion_id,
        persona_id,
        mensaje_respuesta_id,
        oportunidad_id,
        respondio_en,
        oportunidad_creada_en,
        cliente_ganado_en,
        estado_atribucion,
        regla_atribucion
    )
    select
        r.organizacion_id,
        r.campana_id,
        r.conversacion_id,
        r.persona_id,
        r.mensaje_id,
        r.oportunidad_id,
        r.respondio_en,
        r.oportunidad_creada_en,
        case when r.oportunidad_estado='ganada' then r.oportunidad_cerrada_en else null end,
        case
            when r.oportunidad_estado='ganada' then 'ganada'
            when r.oportunidad_estado='perdida' then 'perdida'
            when r.oportunidad_id is not null then 'oportunidad'
            else 'respondio'
        end,
        'respuesta_conversacion_campana'
    from opportunity_rows r
    on conflict (organizacion_id,campana_id,conversacion_id)
    do update set
        persona_id=coalesce(public.campana_conversion.persona_id,excluded.persona_id),
        mensaje_respuesta_id=coalesce(public.campana_conversion.mensaje_respuesta_id,excluded.mensaje_respuesta_id),
        oportunidad_id=coalesce(excluded.oportunidad_id,public.campana_conversion.oportunidad_id),
        respondio_en=coalesce(public.campana_conversion.respondio_en,excluded.respondio_en),
        oportunidad_creada_en=coalesce(excluded.oportunidad_creada_en,public.campana_conversion.oportunidad_creada_en),
        cliente_ganado_en=coalesce(excluded.cliente_ganado_en,public.campana_conversion.cliente_ganado_en),
        estado_atribucion=excluded.estado_atribucion,
        actualizado_en=now();

    get diagnostics v_conversiones = row_count;

    return query
    select
        v_mensajes_campana,
        v_mensajes_respuesta,
        v_conversiones,
        count(*)::bigint
    from public.campana_mensaje_atribucion a
    where a.mensaje_id is not null
      and a.cobro_mensaje_id is null
      and (p_organizacion_id is null or a.organizacion_id=p_organizacion_id);
end;
$$;

revoke all on function public.sync_campana_atribucion(uuid,timestamptz,integer) from public;
revoke all on function public.sync_campana_atribucion(uuid,timestamptz,integer) from anon, authenticated;
grant execute on function public.sync_campana_atribucion(uuid,timestamptz,integer) to service_role;

comment on function public.sync_campana_atribucion(uuid,timestamptz,integer) is
    'Sincroniza de forma idempotente envíos, primeras respuestas y conversiones de campañas WhatsApp; no crea cobros.';


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
        join public.prospeccion_contacto_envio envio
          on envio.organizacion_id = a.organizacion_id
         and envio.id = a.envio_id
        where a.organizacion_id = p_organizacion_id
          and a.tipo_atribucion = 'envio_campana'
          and a.direccion = 'saliente'
          and a.mensaje_id is not null
          and envio.estado not in ('fallido','failed','error','cancelado')
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
        union
        select distinct
            conversion.organizacion_id,
            conversion.campana_id,
            conversion.conversacion_id
        from public.campana_conversion conversion
        where conversion.organizacion_id = p_organizacion_id
          and conversion.conversacion_id is not null
          and (p_campana_id is null or conversion.campana_id = p_campana_id)
          and (p_desde is null or conversion.respondio_en >= p_desde)
          and (p_hasta is null or conversion.respondio_en < p_hasta)
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
