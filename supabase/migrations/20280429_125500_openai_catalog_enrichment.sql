create or replace view public.v_openai_usage_enriched
with (security_invoker = true) as
select
  u.id,
  u.created_at,
  u.organizacion_id,
  o.nombre as organizacion_nombre,
  u.source_tenant_mode,
  u.channel,
  u.feature,
  u.conversation_id,
  u.message_id,
  u.contact_id,
  u.opportunity_id,
  u.openai_response_id,
  u.openai_conversation_id,
  coalesce(nullif(u.openai_project_id, ''), 'shared-default') as openai_project_id,
  coalesce(nullif(u.openai_project_id, ''), 'shared-default') as openai_project_key,
  u.openai_api_key_fingerprint,
  u.openai_model,
  regexp_replace(u.openai_model, '-\\d{4}-\\d{2}-\\d{2}$', '') as openai_model_family,
  u.openai_provider,
  u.assistant_kind,
  u.assistant_ref,
  u.prompt_version,
  u.request_purpose,
  u.request_metadata,
  u.input_tokens,
  u.cached_input_tokens,
  u.output_tokens,
  u.reasoning_tokens,
  u.total_tokens,
  u.estimated_input_cost_usd,
  u.estimated_cached_input_cost_usd,
  u.estimated_output_cost_usd,
  u.estimated_reasoning_cost_usd,
  u.estimated_tools_cost_usd,
  u.estimated_total_cost_usd,
  u.latency_ms,
  u.http_status,
  u.request_status,
  u.error_code,
  u.error_message,
  u.fallback_used,
  u.quality_retry_used,
  (u.request_metadata ->> 'pricing_found')::boolean as pricing_found,
  u.created_at::date as usage_date,
  date_trunc('day', u.created_at) as usage_day,
  date_trunc('month', u.created_at) as usage_month,
  coalesce(
    pc.display_name,
    case
      when coalesce(nullif(u.openai_project_id, ''), 'shared-default') = 'shared-default'
        then 'Proyecto compartido maestro'
      else coalesce(nullif(u.openai_project_id, ''), 'shared-default')
    end
  ) as openai_project_display_name,
  coalesce(
    ac.display_name,
    case
      when u.assistant_kind = 'raw_model' and u.channel = 'summary' then 'Summary directo'
      when u.assistant_kind = 'raw_model' then 'Modelo directo'
      when u.assistant_ref is not null and u.assistant_ref = (o.config -> 'webchat' ->> 'assistant_id') then 'Webchat principal'
      when u.assistant_ref is not null and u.assistant_ref = (o.config -> 'whatsapp' ->> 'prompt_id') then 'WhatsApp principal'
      when u.assistant_ref is not null and u.assistant_ref = (o.config -> 'whatsapp' -> 'prospeccion' ->> 'prompt_id') then 'WhatsApp prospección'
      when u.assistant_ref is not null and u.assistant_ref = (o.config -> 'messenger' ->> 'prompt_id') then 'Messenger principal'
      when u.assistant_ref is not null and u.assistant_ref = (o.config -> 'messenger' ->> 'assistant_id') then 'Messenger principal'
      when u.assistant_kind = 'prompt' then 'Prompt'
      when u.assistant_kind = 'assistant' then 'Assistant'
      else 'Asistente'
    end
  ) as assistant_display_name
from public.openai_request_usage u
left join public.organizaciones o
  on o.id = u.organizacion_id
left join public.openai_projects_catalog pc
  on pc.project_id = coalesce(nullif(u.openai_project_id, ''), 'shared-default')
left join public.openai_assistants_catalog ac
  on ac.resource_id = u.assistant_ref;
