with latest_hint_message as (
  select distinct on (m.conversacion_id)
    m.conversacion_id,
    m.datos
  from public.mensajes m
  where
    coalesce(nullif(lower(m.datos->>'source'), ''), '') <> ''
    or coalesce(nullif(m.datos->>'batch_id', ''), '') <> ''
    or coalesce(nullif(m.datos->>'campana_id', ''), '') <> ''
    or coalesce(nullif(m.datos->>'template_id', ''), '') <> ''
    or coalesce(nullif(m.datos->>'template_slug', ''), '') <> ''
    or coalesce(nullif(m.datos->>'twilio_content_sid', ''), '') <> ''
  order by m.conversacion_id, m.creado_en desc
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
          nullif(lower(lhm.datos->>'source'), ''),
          case when parsed_msg.batch_id is not null then 'prospeccion' end
        ),
        'batch_id',
        coalesce(
          nullif(c.inbox_context->>'batch_id', ''),
          case when parsed_msg.batch_id is not null then parsed_msg.batch_id::text else null end
        ),
        'batch_label',
        coalesce(
          nullif(c.inbox_context->>'batch_label', ''),
          nullif(batch.titulo, ''),
          nullif(batch.metadata->>'campana_nombre', ''),
          nullif(batch.metadata->>'lista_nombre', '')
        ),
        'campana_id',
        coalesce(
          nullif(c.inbox_context->>'campana_id', ''),
          case when parsed_campana.campana_id is not null then parsed_campana.campana_id::text else null end
        ),
        'campana_label',
        coalesce(
          nullif(c.inbox_context->>'campana_label', ''),
          nullif(campaign.nombre, '')
        ),
        'template_id',
        coalesce(
          nullif(c.inbox_context->>'template_id', ''),
          case when parsed_template.template_id is not null then parsed_template.template_id::text else null end
        ),
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
  join latest_hint_message lhm on lhm.conversacion_id = c.id
  left join lateral (
    select
      case
        when (lhm.datos->>'batch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (lhm.datos->>'batch_id')::uuid
      end as batch_id,
      case
        when (lhm.datos->>'campana_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (lhm.datos->>'campana_id')::uuid
      end as campana_id,
      case
        when (lhm.datos->>'template_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (lhm.datos->>'template_id')::uuid
      end as message_template_id,
      coalesce(
        nullif(lower(lhm.datos->>'template_slug'), ''),
        nullif(lower(lhm.datos->>'kw'), ''),
        nullif(lower(lhm.datos->>'twilio_content_sid'), ''),
        nullif(lower(lhm.datos->>'template_sid'), '')
      ) as message_template_slug,
      coalesce(
        nullif(lhm.datos->>'template_label', ''),
        nullif(lhm.datos->>'template_nombre', ''),
        nullif(lhm.datos->>'template_name', '')
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
