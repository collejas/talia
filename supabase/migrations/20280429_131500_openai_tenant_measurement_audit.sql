create or replace view public.v_openai_tenant_measurement_audit as
with usage_30d as (
  select
    u.organizacion_id,
    count(*)::bigint as internal_requests_30d,
    count(*) filter (where nullif(trim(coalesce(u.openai_project_id, '')), '') is null)::bigint as requests_missing_project_30d,
    count(*) filter (where coalesce((u.request_metadata ->> 'measurement_incomplete')::boolean, false))::bigint as measurement_incomplete_requests_30d,
    max(u.created_at) as last_request_at
  from public.openai_request_usage u
  where u.created_at >= (now() - interval '30 days')
  group by u.organizacion_id
),
secret_status as (
  select
    s.organizacion_id,
    bool_or(s.clave in ('openai.general.api_key', 'openai.api_key')) as has_openai_api_secret,
    bool_or(s.clave = 'openai.voice.api_key') as has_openai_voice_secret
  from public.secretos s
  where s.clave in ('openai.general.api_key', 'openai.api_key', 'openai.voice.api_key')
  group by s.organizacion_id
)
select
  o.id as organizacion_id,
  o.nombre as organizacion_nombre,
  o.activo,
  nullif(trim(coalesce(o.config #>> '{openai,general,project_id}', '')), '') as openai_project_id,
  coalesce(ss.has_openai_api_secret, false) as has_openai_api_secret,
  coalesce(ss.has_openai_voice_secret, false) as has_openai_voice_secret,
  nullif(trim(coalesce(o.config #>> '{webchat,assistant_id}', '')), '') as webchat_assistant_id,
  nullif(trim(coalesce(o.config #>> '{whatsapp,prompt_id}', '')), '') as whatsapp_prompt_id,
  nullif(trim(coalesce(o.config #>> '{whatsapp,assistant_id}', '')), '') as whatsapp_assistant_id,
  case
    when lower(coalesce(o.config #>> '{features,webchat,enabled}', 'true')) in ('false', '0', 'no', 'off') then false
    else true
  end as webchat_enabled,
  case
    when nullif(trim(coalesce(o.config #>> '{whatsapp,prompt_id}', '')), '') is not null then true
    when nullif(trim(coalesce(o.config #>> '{whatsapp,assistant_id}', '')), '') is not null then true
    else false
  end as whatsapp_enabled,
  coalesce(u.internal_requests_30d, 0) as internal_requests_30d,
  coalesce(u.requests_missing_project_30d, 0) as requests_missing_project_30d,
  coalesce(u.measurement_incomplete_requests_30d, 0) as measurement_incomplete_requests_30d,
  u.last_request_at,
  (
    (
      case
        when lower(coalesce(o.config #>> '{features,webchat,enabled}', 'true')) in ('false', '0', 'no', 'off') then false
        else true
      end
    )
    and nullif(trim(coalesce(o.config #>> '{webchat,assistant_id}', '')), '') is not null
  )
  or nullif(trim(coalesce(o.config #>> '{whatsapp,prompt_id}', '')), '') is not null
  or nullif(trim(coalesce(o.config #>> '{whatsapp,assistant_id}', '')), '') is not null
  or coalesce(u.internal_requests_30d, 0) > 0
  or coalesce(ss.has_openai_api_secret, false)
  or coalesce(ss.has_openai_voice_secret, false) as uses_openai,
  case
    when not (
      (
        (
          case
            when lower(coalesce(o.config #>> '{features,webchat,enabled}', 'true')) in ('false', '0', 'no', 'off') then false
            else true
          end
        )
        and nullif(trim(coalesce(o.config #>> '{webchat,assistant_id}', '')), '') is not null
      )
      or nullif(trim(coalesce(o.config #>> '{whatsapp,prompt_id}', '')), '') is not null
      or nullif(trim(coalesce(o.config #>> '{whatsapp,assistant_id}', '')), '') is not null
      or coalesce(u.internal_requests_30d, 0) > 0
      or coalesce(ss.has_openai_api_secret, false)
      or coalesce(ss.has_openai_voice_secret, false)
    ) then 'not_applicable'
    when nullif(trim(coalesce(o.config #>> '{openai,general,project_id}', '')), '') is null
      and not coalesce(ss.has_openai_api_secret, false) then 'not_reconcilable'
    when coalesce(u.requests_missing_project_30d, 0) > 0
      or coalesce(u.measurement_incomplete_requests_30d, 0) > 0 then 'degraded'
    when nullif(trim(coalesce(o.config #>> '{openai,general,project_id}', '')), '') is null
      or not coalesce(ss.has_openai_api_secret, false) then 'incomplete'
    else 'complete'
  end as measurement_status,
  case
    when not (
      (
        (
          case
            when lower(coalesce(o.config #>> '{features,webchat,enabled}', 'true')) in ('false', '0', 'no', 'off') then false
            else true
          end
        )
        and nullif(trim(coalesce(o.config #>> '{webchat,assistant_id}', '')), '') is not null
      )
      or nullif(trim(coalesce(o.config #>> '{whatsapp,prompt_id}', '')), '') is not null
      or nullif(trim(coalesce(o.config #>> '{whatsapp,assistant_id}', '')), '') is not null
      or coalesce(u.internal_requests_30d, 0) > 0
      or coalesce(ss.has_openai_api_secret, false)
      or coalesce(ss.has_openai_voice_secret, false)
    ) then 'tenant_sin_uso_openai_detectado'
    when nullif(trim(coalesce(o.config #>> '{openai,general,project_id}', '')), '') is null
      and not coalesce(ss.has_openai_api_secret, false) then 'faltan_project_id_y_api_key'
    when coalesce(u.requests_missing_project_30d, 0) > 0 then 'requests_internas_sin_project_id'
    when coalesce(u.measurement_incomplete_requests_30d, 0) > 0 then 'requests_marcadas_como_medicion_incompleta'
    when nullif(trim(coalesce(o.config #>> '{openai,general,project_id}', '')), '') is null then 'falta_openai_general_project_id'
    when not coalesce(ss.has_openai_api_secret, false) then 'falta_openai_api_key_o_api_key_id'
    else 'ok'
  end as measurement_reason
from public.organizaciones o
left join usage_30d u
  on u.organizacion_id = o.id
left join secret_status ss
  on ss.organizacion_id = o.id;
