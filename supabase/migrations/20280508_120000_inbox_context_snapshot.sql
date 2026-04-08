-- Persist inbox provenance/context on conversaciones so inbox list can read
-- labels and source without expensive per-request enrichment.

alter table if exists public.conversaciones
  add column if not exists inbox_context jsonb not null default '{}'::jsonb;

comment on column public.conversaciones.inbox_context
  is 'Snapshot persistente para inbox: source, source_detail y referencias/labels de prospeccion.';

with latest_message as (
  select distinct on (m.conversacion_id)
    m.conversacion_id,
    m.datos
  from public.mensajes m
  order by m.conversacion_id, m.creado_en desc
),
latest_attribution as (
  select distinct on (e.conversacion_id)
    e.conversacion_id,
    e.regla_id,
    e.canal_publicitario,
    e.campana_publicitaria,
    e.adset,
    e.anuncio,
    e.creado_en,
    r.nombre_regla
  from public.prospeccion_whatsapp_atribucion_eventos e
  left join public.prospeccion_whatsapp_atribucion_reglas r on r.id = e.regla_id
  order by e.conversacion_id, e.creado_en desc
),
resolved as (
  select
    c.id as conversacion_id,
    jsonb_strip_nulls(
      coalesce(c.inbox_context, '{}'::jsonb)
      || jsonb_build_object(
        'source',
        coalesce(
          nullif(c.inbox_context->>'source', ''),
          case when la.conversacion_id is not null then 'publicidad_whatsapp' end,
          nullif(lower(lm.datos->>'source'), '')
        ),
        'source_detail',
        coalesce(
          case
            when jsonb_typeof(c.inbox_context->'source_detail') = 'object'
            then c.inbox_context->'source_detail'
            else null
          end,
          case
            when la.conversacion_id is not null then jsonb_strip_nulls(
              jsonb_build_object(
                'canal_publicitario', nullif(la.canal_publicitario, ''),
                'campana_publicitaria', nullif(la.campana_publicitaria, ''),
                'adset', nullif(la.adset, ''),
                'anuncio', nullif(la.anuncio, ''),
                'regla_id', la.regla_id,
                'regla_nombre', nullif(la.nombre_regla, ''),
                'atribuido_en', la.creado_en
              )
            )
            else null
          end,
          case
            when jsonb_typeof(lm.datos->'source_detail') = 'object'
            then lm.datos->'source_detail'
            else null
          end
        ),
        'batch_id', case when parsed_msg.batch_id is not null then parsed_msg.batch_id::text else null end,
        'batch_label',
        coalesce(
          nullif(c.inbox_context->>'batch_label', ''),
          nullif(batch.titulo, ''),
          nullif(batch.metadata->>'campana_nombre', ''),
          nullif(batch.metadata->>'lista_nombre', '')
        ),
        'campana_id', case when parsed_campana.campana_id is not null then parsed_campana.campana_id::text else null end,
        'campana_label',
        coalesce(
          nullif(c.inbox_context->>'campana_label', ''),
          nullif(campaign.nombre, '')
        ),
        'template_id', case when parsed_template.template_id is not null then parsed_template.template_id::text else null end,
        'template_slug',
        coalesce(
          nullif(lower(c.inbox_context->>'template_slug'), ''),
          parsed_template.template_slug,
          nullif(lower(template_by_id.slug), ''),
          nullif(lower(template_by_slug.slug), '')
        ),
        'template_label',
        coalesce(
          nullif(c.inbox_context->>'template_label', ''),
          nullif(template_by_id.nombre, ''),
          nullif(template_by_slug.nombre, ''),
          parsed_template.template_label
        )
      )
    ) as inbox_context
  from public.conversaciones c
  left join latest_message lm on lm.conversacion_id = c.id
  left join latest_attribution la on la.conversacion_id = c.id
  left join lateral (
    select
      coalesce(
        case
          when (c.inbox_context->>'batch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (c.inbox_context->>'batch_id')::uuid
        end,
        case
          when (lm.datos->>'batch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (lm.datos->>'batch_id')::uuid
        end
      ) as batch_id,
      coalesce(
        case
          when (c.inbox_context->>'campana_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (c.inbox_context->>'campana_id')::uuid
        end,
        case
          when (lm.datos->>'campana_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (lm.datos->>'campana_id')::uuid
        end
      ) as campana_id,
      coalesce(
        case
          when (c.inbox_context->>'template_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (c.inbox_context->>'template_id')::uuid
        end,
        case
          when (lm.datos->>'template_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (lm.datos->>'template_id')::uuid
        end
      ) as message_template_id,
      coalesce(
        nullif(lower(c.inbox_context->>'template_slug'), ''),
        nullif(lower(lm.datos->>'template_slug'), '')
      ) as message_template_slug,
      coalesce(
        nullif(c.inbox_context->>'template_label', ''),
        nullif(lm.datos->>'template_label', ''),
        nullif(lm.datos->>'template_nombre', '')
      ) as message_template_label
  ) parsed_msg on true
  left join public.prospeccion_contacto_batch batch on batch.id = parsed_msg.batch_id
  left join lateral (
    select coalesce(parsed_msg.campana_id, batch.campana_id) as campana_id
  ) parsed_campana on true
  left join public.campanas campaign on campaign.id = parsed_campana.campana_id
  left join lateral (
    select
      coalesce(
        case
          when (batch.metadata->>'template_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (batch.metadata->>'template_id')::uuid
        end,
        case
          when (batch.metadata->>'contact_template_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (batch.metadata->>'contact_template_id')::uuid
        end,
        parsed_msg.message_template_id
      ) as template_id,
      coalesce(
        nullif(lower(batch.metadata->>'template_slug'), ''),
        nullif(lower(batch.metadata->>'kw'), ''),
        parsed_msg.message_template_slug
      ) as template_slug,
      coalesce(
        nullif(batch.metadata->>'template_nombre', ''),
        nullif(batch.metadata->>'template_name', ''),
        parsed_msg.message_template_label
      ) as template_label
  ) parsed_template on true
  left join public.prospeccion_contacto_templates template_by_id on template_by_id.id = parsed_template.template_id
  left join public.prospeccion_contacto_templates template_by_slug
    on lower(template_by_slug.slug) = parsed_template.template_slug
)
update public.conversaciones c
set inbox_context = resolved.inbox_context
from resolved
where c.id = resolved.conversacion_id
  and resolved.inbox_context is not null
  and resolved.inbox_context <> coalesce(c.inbox_context, '{}'::jsonb);

drop function if exists public.panel_inbox_threads(
  text,
  uuid,
  integer,
  integer,
  integer,
  text,
  text,
  uuid,
  uuid,
  timestamptz,
  timestamptz
);

create or replace function public.panel_inbox_threads(
    p_estado text default null,
    p_asignado uuid default null,
    p_limit integer default 50,
    p_offset integer default 0,
    p_message_limit integer default 20,
    p_source text default null,
    p_channel text default null,
    p_batch_id uuid default null,
    p_campana_id uuid default null,
    p_from timestamptz default null,
    p_to timestamptz default null
) returns table(
    conversacion_id uuid,
    contacto_id uuid,
    contacto_nombre text,
    contacto_correo text,
    contacto_telefono text,
    canal text,
    source text,
    batch_id uuid,
    campana_id uuid,
    estado text,
    prioridad integer,
    iniciada_en timestamptz,
    ultimo_mensaje_en timestamptz,
    no_leidos integer,
    asignado_id uuid,
    asignado_nombre text,
    tags text[],
    manual_override boolean,
    oportunidad_id uuid,
    parent_opportunity_id uuid,
    restart_sequence integer,
    conversation_history text[],
    last_message_preview text,
    last_message_at timestamptz,
    messages jsonb,
    total_rows bigint,
    reengage_attempts integer,
    inbox_context jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $function$
with filtered as (
    select
        c.id as conversacion_id,
        c.contacto_id,
        ct.nombre_completo as contacto_nombre,
        nullif(ct.correo, '') as contacto_correo,
        nullif(ct.telefono_e164, '') as contacto_telefono,
        coalesce(snap.canal, c.canal) as canal,
        coalesce(nullif(c.inbox_context->>'source', ''), snap.source) as source,
        coalesce(
            case
                when (c.inbox_context->>'batch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then (c.inbox_context->>'batch_id')::uuid
            end,
            snap.batch_id
        ) as batch_id,
        coalesce(
            case
                when (c.inbox_context->>'campana_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then (c.inbox_context->>'campana_id')::uuid
            end,
            snap.campana_id
        ) as campana_id,
        c.estado,
        c.prioridad,
        c.iniciada_en,
        c.ultimo_mensaje_en,
        coalesce(c.no_leidos, 0) as no_leidos,
        c.asignado_a_usuario_id as asignado_id,
        asignado.nombre_completo as asignado_nombre,
        array(
            select jsonb_array_elements_text(coalesce(ci.tags, '[]'::jsonb))
        ) as tags,
        coalesce(cc.manual_override, false) as manual_override,
        opp.oportunidad_id,
        (opp.oportunidad_metadata->>'parent_opportunity_id')::uuid as parent_opportunity_id,
        coalesce(
            (opp.oportunidad_metadata->>'restart_sequence')::integer,
            c.restart_sequence,
            1
        ) as restart_sequence,
        coalesce(
            (opp.oportunidad_metadata->'whatsapp_followup'->'reengage'->>'attempts')::integer,
            0
        ) as reengage_attempts,
        coalesce(
            array(
                select jsonb_array_elements_text(
                    coalesce(opp.oportunidad_metadata->'conversation_history', '[]'::jsonb)
                )
            ),
            array[c.id::text]
        ) as conversation_history,
        snap.last_message_preview,
        snap.last_message_at,
        coalesce(snap.sort_key, c.ultimo_mensaje_en, c.iniciada_en) as sort_key,
        jsonb_strip_nulls(
            coalesce(c.inbox_context, '{}'::jsonb)
            || jsonb_build_object(
                'source', coalesce(nullif(c.inbox_context->>'source', ''), snap.source),
                'batch_id',
                case
                  when coalesce(
                    case
                      when (c.inbox_context->>'batch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                      then (c.inbox_context->>'batch_id')::uuid
                    end,
                    snap.batch_id
                  ) is not null
                  then coalesce(
                    case
                      when (c.inbox_context->>'batch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                      then (c.inbox_context->>'batch_id')::uuid
                    end,
                    snap.batch_id
                  )::text
                  else null
                end,
                'batch_label',
                coalesce(
                    nullif(c.inbox_context->>'batch_label', ''),
                    nullif(batch.titulo, ''),
                    nullif(batch.metadata->>'campana_nombre', ''),
                    nullif(batch.metadata->>'lista_nombre', '')
                ),
                'campana_id',
                case
                  when coalesce(
                    case
                      when (c.inbox_context->>'campana_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                      then (c.inbox_context->>'campana_id')::uuid
                    end,
                    batch.campana_id,
                    snap.campana_id
                  ) is not null
                  then coalesce(
                    case
                      when (c.inbox_context->>'campana_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                      then (c.inbox_context->>'campana_id')::uuid
                    end,
                    batch.campana_id,
                    snap.campana_id
                  )::text
                  else null
                end,
                'campana_label', coalesce(nullif(c.inbox_context->>'campana_label', ''), nullif(campaign.nombre, '')),
                'template_id',
                case
                  when resolved_template.template_id is not null then resolved_template.template_id::text else null
                end,
                'template_slug', resolved_template.template_slug,
                'template_label', resolved_template.template_label
            )
        ) as inbox_context
    from public.conversaciones c
    join public.contactos ct on ct.id = c.contacto_id
    left join public.usuarios asignado on asignado.id = c.asignado_a_usuario_id
    left join public.conversaciones_insights ci on ci.conversacion_id = c.id
    left join public.conversaciones_controles cc on cc.conversacion_id = c.id
    left join public.inbox_conversation_snapshot_mv snap on snap.conversacion_id = c.id
    left join public.prospeccion_contacto_batch batch on batch.id = coalesce(
        case
            when (c.inbox_context->>'batch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (c.inbox_context->>'batch_id')::uuid
        end,
        snap.batch_id
    )
    left join public.campanas campaign on campaign.id = coalesce(
        case
            when (c.inbox_context->>'campana_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (c.inbox_context->>'campana_id')::uuid
        end,
        batch.campana_id,
        snap.campana_id
    )
    left join lateral (
        select
            coalesce(
                case
                    when (c.inbox_context->>'template_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    then (c.inbox_context->>'template_id')::uuid
                end,
                case
                    when (batch.metadata->>'template_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    then (batch.metadata->>'template_id')::uuid
                end,
                case
                    when (batch.metadata->>'contact_template_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    then (batch.metadata->>'contact_template_id')::uuid
                end
            ) as template_id,
            coalesce(
                nullif(lower(c.inbox_context->>'template_slug'), ''),
                nullif(lower(batch.metadata->>'template_slug'), ''),
                nullif(lower(batch.metadata->>'kw'), '')
            ) as template_slug_seed,
            coalesce(
                nullif(c.inbox_context->>'template_label', ''),
                nullif(batch.metadata->>'template_nombre', ''),
                nullif(batch.metadata->>'template_name', '')
            ) as template_label_seed
    ) resolved_template_seed on true
    left join public.prospeccion_contacto_templates template_by_id
      on template_by_id.id = resolved_template_seed.template_id
    left join public.prospeccion_contacto_templates template_by_slug
      on lower(template_by_slug.slug) = resolved_template_seed.template_slug_seed
    left join lateral (
        select
            coalesce(
                resolved_template_seed.template_id,
                template_by_slug.id
            ) as template_id,
            coalesce(
                nullif(lower(c.inbox_context->>'template_slug'), ''),
                resolved_template_seed.template_slug_seed,
                nullif(lower(template_by_id.slug), ''),
                nullif(lower(template_by_slug.slug), '')
            ) as template_slug,
            coalesce(
                nullif(c.inbox_context->>'template_label', ''),
                nullif(template_by_id.nombre, ''),
                nullif(template_by_slug.nombre, ''),
                resolved_template_seed.template_label_seed
            ) as template_label
    ) resolved_template on true
    left join lateral (
        select o.id as oportunidad_id, o.metadata as oportunidad_metadata
        from public.oportunidades o
        where o.metadata->>'conversation_id' = c.id::text
        order by o.creado_en desc
        limit 1
    ) opp on true
    where public.puede_ver_conversacion(c.id)
      and (p_estado is null or lower(c.estado) = lower(p_estado))
      and (p_asignado is null or c.asignado_a_usuario_id = p_asignado)
      and (
        p_channel is null
        or lower(coalesce(nullif(snap.canal, ''), c.canal)) = lower(p_channel)
      )
      and (p_source is null or lower(coalesce(nullif(c.inbox_context->>'source', ''), snap.source, '')) = lower(p_source))
      and (
        p_batch_id is null
        or coalesce(
            (
                case
                    when (c.inbox_context->>'batch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    then (c.inbox_context->>'batch_id')::uuid
                end
            )::text,
            snap.batch_id::text,
            ''
        ) = p_batch_id::text
      )
      and (
        p_campana_id is null
        or coalesce(
            (
                case
                    when (c.inbox_context->>'campana_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    then (c.inbox_context->>'campana_id')::uuid
                end
            )::text,
            batch.campana_id::text,
            snap.campana_id::text,
            ''
        ) = p_campana_id::text
      )
      and (p_from is null or coalesce(c.ultimo_mensaje_en, c.iniciada_en) >= p_from)
      and (p_to is null or coalesce(c.ultimo_mensaje_en, c.iniciada_en) <= p_to)
),
annotated as (
    select
        f.*,
        count(*) over () as total_rows
    from filtered f
),
messages_by_thread as (
    select
        a.conversacion_id,
        jsonb_agg(
            jsonb_build_object(
                'message_id', msg.id,
                'author', case
                    when msg.direccion = 'entrante' then coalesce(a.contacto_nombre, 'Visitante')
                    else coalesce(a.asignado_nombre, 'Equipo Tal-IA')
                end,
                'role', case when msg.direccion = 'entrante' then 'contacto' else 'usuario' end,
                'timestamp', msg.creado_en,
                'body', array[coalesce(nullif(msg.texto, ''), '(mensaje sin texto)')],
                'tipo_contenido', msg.tipo_contenido,
                'datos', msg.datos,
                'attachments', coalesce(
                    (
                        select jsonb_agg(
                            jsonb_build_object(
                                'id', adj.id,
                                'url', adj.url,
                                'mime', adj.mime,
                                'size', coalesce(adj.size_bytes, adj.tamano_bytes),
                                'name', adj.nombre,
                                'provider_id', adj.proveedor_id,
                                'path', adj.path
                            ) order by adj.creado_en asc
                        )
                        from public.adjuntos adj
                        where adj.mensaje_id = msg.id
                    ),
                    '[]'::jsonb
                )
            )
            order by msg.creado_en
        ) filter (where msg.id is not null) as items
    from annotated a
    left join lateral (
        select m.*
        from public.mensajes m
        where m.conversacion_id = a.conversacion_id
        order by m.creado_en desc
        limit greatest(coalesce(p_message_limit, 20), 1)
    ) as msg on true
    group by a.conversacion_id
)
select
    a.conversacion_id,
    a.contacto_id,
    a.contacto_nombre,
    a.contacto_correo,
    a.contacto_telefono,
    a.canal,
    a.source,
    a.batch_id,
    a.campana_id,
    a.estado,
    a.prioridad,
    a.iniciada_en,
    a.ultimo_mensaje_en,
    a.no_leidos,
    a.asignado_id,
    a.asignado_nombre,
    a.tags,
    a.manual_override,
    a.oportunidad_id,
    a.parent_opportunity_id,
    a.restart_sequence,
    a.conversation_history,
    a.last_message_preview,
    a.last_message_at,
    coalesce(messages.items, '[]'::jsonb) as messages,
    a.total_rows,
    a.reengage_attempts,
    a.inbox_context
from annotated a
left join messages_by_thread messages on messages.conversacion_id = a.conversacion_id
order by a.sort_key desc
limit coalesce(nullif(p_limit, 0), 50)
offset greatest(p_offset, 0);
$function$;
