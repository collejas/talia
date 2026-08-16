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

    -- 1. Envíos iniciales: la campaña proviene del batch relacionado al
    -- mensaje persistido. No se usa metadata como relación nueva: solo se
    -- leen los identificadores operativos ya emitidos por el flujo actual.
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
            coalesce(delivery.entregado_en, cm.aceptado_proveedor_en) as entregado_en,
            row_number() over (
                partition by m.organizacion_id, b.campana_id, m.conversacion_id
                order by m.creado_en, m.id
            ) as envio_orden
        from public.mensajes m
        join public.prospeccion_contacto_batch b
          on b.organizacion_id=m.organizacion_id
         and b.id=nullif(m.datos->>'batch_id','')::uuid
        join public.prospeccion_contacto_envio e
          on e.organizacion_id=m.organizacion_id
         and e.id=nullif(m.datos->>'envio_id','')::uuid
         and e.batch_id=b.id
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
          and lower(coalesce(m.datos->>'source',''))='prospeccion'
          and nullif(m.datos->>'batch_id','') is not null
          and nullif(m.datos->>'envio_id','') is not null
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
        entregado_en=coalesce(
            public.campana_mensaje_atribucion.entregado_en,
            excluded.entregado_en
        ),
        actualizado_en=now();

    get diagnostics v_mensajes_campana = row_count;

    -- 2. Primera respuesta por campaña y conversación. Una conversación se
    -- cuenta una sola vez aunque contenga más mensajes o hilos técnicos.
    with outbound_campaign as (
        select distinct on (a.organizacion_id, a.campana_id, a.conversacion_id)
            a.organizacion_id,
            a.campana_id,
            a.conversacion_id,
            a.persona_id,
            m.creado_en as envio_en
        from public.campana_mensaje_atribucion a
        join public.mensajes m
          on m.organizacion_id=a.organizacion_id and m.id=a.mensaje_id
        where a.es_mensaje_inicial
          and a.conversacion_id is not null
          and (p_organizacion_id is null or a.organizacion_id=p_organizacion_id)
        order by a.organizacion_id,a.campana_id,a.conversacion_id,m.creado_en
    ), inbound_candidates as (
        select
            oc.organizacion_id,
            oc.campana_id,
            oc.conversacion_id,
            oc.persona_id,
            m.id as mensaje_id,
            m.creado_en as respondio_en,
            row_number() over (
                partition by oc.organizacion_id,oc.campana_id,oc.conversacion_id
                order by m.creado_en,m.id
            ) as rn
        from outbound_campaign oc
        join public.mensajes m
          on m.organizacion_id=oc.organizacion_id
         and m.conversacion_id=oc.conversacion_id
         and m.direccion='entrante'
         and m.creado_en > oc.envio_en
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
    where i.rn=1
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
