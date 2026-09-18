-- Completa la atribución de campañas WhatsApp cuando el WAMID del envío
-- llegó antes que el mensaje local o no quedó persistido en mensajes.
-- El fallback exige tenant, teléfono normalizado y una respuesta posterior
-- al envío; no participa en la atribución de CTAs.

create index if not exists prospeccion_envio_org_batch_prospecto_idx
    on public.prospeccion_contacto_envio (organizacion_id, batch_id, prospecto_id, creado_en desc);

create index if not exists mensajes_org_conversacion_direction_created_idx
    on public.mensajes (organizacion_id, conversacion_id, direccion, creado_en);

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

    with envio_contexto as (
        select distinct on (e.id)
            e.organizacion_id,
            b.campana_id,
            b.id as lote_id,
            e.id as envio_id,
            m.id as mensaje_id,
            cm.id as cobro_mensaje_id,
            coalesce(m.conversacion_id, match_cv.id) as conversacion_id,
            coalesce(cv.persona_id, match_cv.persona_id) as persona_id,
            coalesce(delivery.entregado_en, e.entregado_en, e.procesado_en, e.creado_en) as entregado_en,
            row_number() over (
                partition by e.organizacion_id, b.campana_id, coalesce(m.conversacion_id, match_cv.id)
                order by coalesce(e.procesado_en, e.creado_en), e.id
            ) as envio_orden
        from public.prospeccion_contacto_envio e
        join public.prospeccion_contacto_batch b
          on b.organizacion_id=e.organizacion_id and b.id=e.batch_id
        left join public.mensajes m
          on m.organizacion_id=e.organizacion_id
         and m.proveedor_mensaje_id=e.mensaje_id
         and m.direccion='saliente'
        left join public.conversaciones cv
          on cv.organizacion_id=m.organizacion_id and cv.id=m.conversacion_id
        left join public.prospeccion_prospectos p
          on p.organizacion_id=e.organizacion_id and p.id=e.prospecto_id
        left join lateral (
            select cv2.id, cv2.persona_id, cv2.ultimo_entrante_en
            from public.conversaciones cv2
            left join public.personas person2
              on person2.organizacion_id=cv2.organizacion_id and person2.id=cv2.persona_id
            left join public.contactos contact2
              on contact2.organizacion_id=cv2.organizacion_id and contact2.id=cv2.contacto_id
            where cv2.organizacion_id=e.organizacion_id
              and cv2.canal='whatsapp'
              and cv2.ultimo_entrante_en is not null
              and cv2.ultimo_entrante_en > coalesce(e.procesado_en, e.creado_en)
              and right(regexp_replace(coalesce(
                    person2.telefono_principal_e164,
                    contact2.telefono_e164,
                    contact2.telefono
                  ), '[^0-9]', '', 'g'), 10)
                  = right(regexp_replace(coalesce(
                    p.phone_e164,
                    p.telefono_principal_e164,
                    p.phone_national,
                    p.phone
                  ), '[^0-9]', '', 'g'), 10)
            order by cv2.ultimo_entrante_en asc, cv2.id
            limit 1
        ) match_cv on m.id is null
        left join public.cobro_mensajes cm
          on cm.organizacion_id=e.organizacion_id and cm.mensaje_id=m.id
        left join lateral (
            select max(ed.proveedor_ts) as entregado_en
            from public.eventos_entrega ed
            where ed.organizacion_id=e.organizacion_id
              and ed.proveedor='meta'
              and ed.proveedor_mensaje_id=e.mensaje_id
              and ed.evento in ('entregado','leido')
        ) delivery on true
        where e.canal='whatsapp'
          and e.estado not in ('fallido','failed','error','cancelado')
          and b.campana_id is not null
          and (p_organizacion_id is null or e.organizacion_id=p_organizacion_id)
          and (p_desde is null or coalesce(e.procesado_en,e.creado_en) >= p_desde)
        order by e.id, coalesce(e.procesado_en,e.creado_en)
        limit p_limite
    ), source_rows as (
        select *
        from envio_contexto
        where conversacion_id is not null
    )
    insert into public.campana_mensaje_atribucion (
        organizacion_id,campana_id,lote_id,envio_id,mensaje_id,cobro_mensaje_id,
        conversacion_id,persona_id,direccion,tipo_atribucion,es_mensaje_inicial,
        entregado_en,regla_atribucion
    )
    select s.organizacion_id,s.campana_id,s.lote_id,s.envio_id,s.mensaje_id,
           s.cobro_mensaje_id,s.conversacion_id,s.persona_id,'saliente',
           'envio_campana',
           s.envio_orden=1 and not exists (
             select 1 from public.campana_mensaje_atribucion prior
             where prior.organizacion_id=s.organizacion_id
               and prior.campana_id=s.campana_id
               and prior.conversacion_id=s.conversacion_id
               and prior.es_mensaje_inicial
           ),
           s.entregado_en,
           case when s.mensaje_id is null
                then 'batch_envio_phone_fallback'
                else 'batch_envio_explicito' end
    from source_rows s
    on conflict do nothing;

    get diagnostics v_mensajes_campana = row_count;

    with recent_inbound as (
        select m.organizacion_id,m.id as mensaje_id,m.conversacion_id,
               cv.persona_id,m.creado_en as respondio_en,
               right(regexp_replace(coalesce(
                 person.telefono_principal_e164,
                 contact.telefono_e164,
                 contact.telefono
               ), '[^0-9]', '', 'g'), 10) as phone10
        from public.mensajes m
        join public.conversaciones cv
          on cv.organizacion_id=m.organizacion_id and cv.id=m.conversacion_id
        left join public.personas person
          on person.organizacion_id=cv.organizacion_id and person.id=cv.persona_id
        left join public.contactos contact
          on contact.organizacion_id=cv.organizacion_id and contact.id=cv.contacto_id
        where m.direccion='entrante'
          and (p_organizacion_id is null or m.organizacion_id=p_organizacion_id)
          and (p_desde is null or m.creado_en >= p_desde)
    ), outbound_campaign as (
        select distinct on (a.organizacion_id,a.campana_id,a.conversacion_id)
            a.organizacion_id,a.campana_id,a.conversacion_id,
            coalesce(sent.creado_en, e.procesado_en, e.creado_en, a.creado_en) as envio_en,
            right(regexp_replace(coalesce(
              person.telefono_principal_e164,
              contact.telefono_e164,
              contact.telefono
            ), '[^0-9]', '', 'g'), 10) as phone10
        from public.campana_mensaje_atribucion a
        left join public.prospeccion_contacto_envio e
          on e.organizacion_id=a.organizacion_id and e.id=a.envio_id
        left join public.mensajes sent
          on sent.organizacion_id=a.organizacion_id and sent.id=a.mensaje_id
        join public.conversaciones cv
          on cv.organizacion_id=a.organizacion_id and cv.id=a.conversacion_id
        left join public.personas person
          on person.organizacion_id=cv.organizacion_id and person.id=cv.persona_id
        left join public.contactos contact
          on contact.organizacion_id=cv.organizacion_id and contact.id=cv.contacto_id
        where a.tipo_atribucion='envio_campana'
          and a.es_mensaje_inicial
          and (p_organizacion_id is null or a.organizacion_id=p_organizacion_id)
        order by a.organizacion_id,a.campana_id,a.conversacion_id,
                 coalesce(sent.creado_en,e.procesado_en,e.creado_en,a.creado_en)
    ), inbound_candidates as (
        select oc.organizacion_id,oc.campana_id,ri.conversacion_id,
               ri.persona_id,ri.mensaje_id,ri.respondio_en,
               row_number() over (
                 partition by oc.organizacion_id,oc.campana_id,oc.conversacion_id
                 order by ri.respondio_en,ri.mensaje_id
               ) as rn,
               row_number() over (
                 partition by oc.organizacion_id,ri.mensaje_id
                 order by oc.envio_en desc,oc.campana_id
               ) as mensaje_rn
        from outbound_campaign oc
        join recent_inbound ri
          on ri.organizacion_id=oc.organizacion_id
         and (ri.conversacion_id=oc.conversacion_id
              or (oc.phone10 is not null and ri.phone10=oc.phone10))
         and ri.respondio_en > oc.envio_en
    )
    insert into public.campana_mensaje_atribucion (
        organizacion_id,campana_id,mensaje_id,conversacion_id,persona_id,
        direccion,tipo_atribucion,respondio,respondio_en,regla_atribucion
    )
    select i.organizacion_id,i.campana_id,i.mensaje_id,i.conversacion_id,
           i.persona_id,'entrante','respuesta',true,i.respondio_en,
           'primera_respuesta_conversacion'
    from inbound_candidates i
    where i.rn=1 and i.mensaje_rn=1
    on conflict (organizacion_id,mensaje_id) where mensaje_id is not null
    do update set
      respondio=true,
      respondio_en=coalesce(public.campana_mensaje_atribucion.respondio_en,excluded.respondio_en),
      actualizado_en=now();

    get diagnostics v_mensajes_respuesta = row_count;

    with response_rows as (
        select distinct on (a.organizacion_id,a.campana_id,a.conversacion_id)
            a.organizacion_id,a.campana_id,a.conversacion_id,a.persona_id,
            a.mensaje_id,a.respondio_en
        from public.campana_mensaje_atribucion a
        where a.tipo_atribucion='respuesta'
          and (p_organizacion_id is null or a.organizacion_id=p_organizacion_id)
        order by a.organizacion_id,a.campana_id,a.conversacion_id,a.respondio_en,a.mensaje_id
    ), opportunity_rows as (
        select r.*,o.id as oportunidad_id,o.estado as oportunidad_estado,
               o.creado_en as oportunidad_creada_en,o.cerrado_en as oportunidad_cerrada_en
        from response_rows r
        left join lateral (
            select o.id,o.estado,o.creado_en,o.cerrado_en
            from public.oportunidades o
            where o.organizacion_id=r.organizacion_id
              and coalesce(nullif(o.metadata->>'conversation_id',''),nullif(o.metadata->>'conversacion_id',''))=r.conversacion_id::text
            order by o.creado_en,o.id limit 1
        ) o on true
    )
    insert into public.campana_conversion (
        organizacion_id,campana_id,conversacion_id,persona_id,mensaje_respuesta_id,
        oportunidad_id,respondio_en,oportunidad_creada_en,cliente_ganado_en,
        estado_atribucion,regla_atribucion
    )
    select r.organizacion_id,r.campana_id,r.conversacion_id,r.persona_id,r.mensaje_id,
           r.oportunidad_id,r.respondio_en,r.oportunidad_creada_en,
           case when r.oportunidad_estado='ganada' then r.oportunidad_cerrada_en end,
           case when r.oportunidad_estado='ganada' then 'ganada'
                when r.oportunidad_estado='perdida' then 'perdida'
                when r.oportunidad_id is not null then 'oportunidad'
                else 'respondio' end,
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
      estado_atribucion=excluded.estado_atribucion,actualizado_en=now();

    get diagnostics v_conversiones = row_count;

    return query
    select v_mensajes_campana,v_mensajes_respuesta,v_conversiones,count(*)::bigint
    from public.campana_mensaje_atribucion a
    where a.mensaje_id is not null and a.cobro_mensaje_id is null
      and (p_organizacion_id is null or a.organizacion_id=p_organizacion_id);
end;
$$;

revoke all on function public.sync_campana_atribucion(uuid,timestamptz,integer) from public, anon, authenticated;
grant execute on function public.sync_campana_atribucion(uuid,timestamptz,integer) to service_role;
