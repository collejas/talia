BEGIN;

CREATE OR REPLACE FUNCTION public.panel_inbox_threads(
    p_estado text DEFAULT NULL,
    p_asignado uuid DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0,
    p_message_limit integer DEFAULT 20,
    p_source text DEFAULT NULL,
    p_channel text DEFAULT NULL,
    p_batch_id uuid DEFAULT NULL,
    p_campana_id uuid DEFAULT NULL,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
) RETURNS TABLE(
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
        coalesce(nullif(pe.nombre_completo, ''), nullif(ct_legacy.nombre_completo, '')) as contacto_nombre,
        coalesce(nullif(pe.correo_principal, ''), nullif(ct_legacy.correo, '')) as contacto_correo,
        coalesce(
            nullif(pe.telefono_principal_e164, ''),
            nullif(ct_legacy.telefono_e164, '')
        ) as contacto_telefono,
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
    left join public.personas pe on pe.id = c.contacto_id
    left join public.contactos ct_legacy on ct_legacy.id = c.contacto_id
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
paged as (
    select *
    from annotated
    order by sort_key desc
    limit coalesce(nullif(p_limit, 0), 50)
    offset greatest(p_offset, 0)
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
    from paged a
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
from paged a
left join messages_by_thread messages on messages.conversacion_id = a.conversacion_id
order by a.sort_key desc;
$function$;

COMMIT;
