-- Snapshot del inbox basado en personas en lugar de contactos legacy.

drop materialized view if exists public.inbox_conversation_snapshot_mv;

create materialized view public.inbox_conversation_snapshot_mv
as
with latest_message as (
  select distinct on (m.conversacion_id)
    m.conversacion_id,
    lower(
      nullif(
        coalesce(m.datos->>'channel', m.datos->>'canal'),
        ''
      )
    ) as channel,
    lower(nullif(m.datos->>'source', '')) as source,
    case
      when (m.datos->>'batch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (m.datos->>'batch_id')::uuid
      else null
    end as batch_id,
    case
      when (m.datos->>'campana_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (m.datos->>'campana_id')::uuid
      else null
    end as campana_id,
    m.texto as last_message_preview,
    m.creado_en as last_message_at
  from public.mensajes m
  order by m.conversacion_id, m.creado_en desc
)
select
  c.id as conversacion_id,
  coalesce(nullif(lm.channel, ''), c.canal) as canal,
  lm.source,
  lm.batch_id,
  lm.campana_id,
  lm.last_message_preview,
  lm.last_message_at,
  coalesce(lm.last_message_at, c.ultimo_mensaje_en, c.iniciada_en) as sort_key
from public.conversaciones c
left join latest_message lm on lm.conversacion_id = c.id
with data;

create unique index if not exists inbox_conversation_snapshot_mv_uk
  on public.inbox_conversation_snapshot_mv (conversacion_id);

create index if not exists inbox_conversation_snapshot_mv_sort_idx
  on public.inbox_conversation_snapshot_mv (sort_key desc);

create index if not exists inbox_conversation_snapshot_mv_filter_idx
  on public.inbox_conversation_snapshot_mv (canal, source, batch_id, campana_id);
