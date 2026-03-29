-- Nombres legibles para proyecto, asistente y conversación.

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
  coalesce(nullif(u.openai_project_id, ''), 'shared-default') as openai_project_key,
  case
    when coalesce(nullif(u.openai_project_id, ''), 'shared-default') = 'shared-default'
      then 'Proyecto compartido maestro'
    else coalesce(nullif(u.openai_project_id, ''), 'shared-default')
  end as openai_project_display_name,
  u.openai_api_key_fingerprint,
  u.openai_model,
  regexp_replace(u.openai_model, '-\\d{4}-\\d{2}-\\d{2}$', '') as openai_model_family,
  u.openai_provider,
  u.assistant_kind,
  u.assistant_ref,
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
  end as assistant_display_name,
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
  date_trunc('month', u.created_at) as usage_month
from public.openai_request_usage u
left join public.organizaciones o
  on o.id = u.organizacion_id;

create or replace view public.v_openai_costs_daily
with (security_invoker = true) as
select
  usage_date,
  organizacion_id,
  organizacion_nombre,
  source_tenant_mode,
  channel,
  feature,
  openai_project_key,
  openai_project_display_name,
  openai_model_family,
  count(*) as requests_count,
  count(distinct conversation_id) filter (where conversation_id is not null) as conversations_count,
  sum(input_tokens) as input_tokens,
  sum(cached_input_tokens) as cached_input_tokens,
  sum(output_tokens) as output_tokens,
  sum(reasoning_tokens) as reasoning_tokens,
  sum(total_tokens) as total_tokens,
  sum(estimated_total_cost_usd) as estimated_total_cost_usd,
  avg(latency_ms)::numeric(12,2) as avg_latency_ms,
  percentile_cont(0.5) within group (order by latency_ms) filter (where latency_ms is not null) as p50_latency_ms,
  percentile_cont(0.9) within group (order by latency_ms) filter (where latency_ms is not null) as p90_latency_ms,
  count(*) filter (where fallback_used) as fallback_count,
  count(*) filter (where quality_retry_used) as quality_retry_count,
  count(*) filter (where pricing_found is false) as missing_pricing_count
from public.v_openai_usage_enriched
group by usage_date, organizacion_id, organizacion_nombre, source_tenant_mode, channel, feature, openai_project_key, openai_project_display_name, openai_model_family;

create or replace view public.v_openai_costs_by_conversation
with (security_invoker = true) as
select
  agg.conversation_id,
  agg.first_request_at,
  agg.last_request_at,
  agg.organizacion_id,
  agg.organizacion_nombre,
  agg.source_tenant_mode,
  agg.channel,
  agg.feature,
  agg.openai_project_key,
  agg.openai_project_display_name,
  coalesce(
    nullif(trim(ct.nombre_completo), ''),
    nullif(trim(ct.company_name), ''),
    nullif(trim(ct.correo), ''),
    nullif(trim(ct.telefono_e164), ''),
    concat(initcap(coalesce(agg.channel, 'Conversación')), ' · ', left(agg.conversation_id::text, 8))
  ) as conversation_display_name,
  agg.requests_count,
  agg.models_count,
  agg.models_used,
  agg.input_tokens,
  agg.cached_input_tokens,
  agg.output_tokens,
  agg.reasoning_tokens,
  agg.total_tokens,
  agg.estimated_total_cost_usd,
  agg.avg_latency_ms,
  agg.fallback_count,
  agg.quality_retry_count
from (
  select
    conversation_id,
    min(created_at) as first_request_at,
    max(created_at) as last_request_at,
    organizacion_id,
    max(organizacion_nombre) as organizacion_nombre,
    max(source_tenant_mode) as source_tenant_mode,
    max(channel) as channel,
    max(feature) as feature,
    max(openai_project_key) as openai_project_key,
    max(openai_project_display_name) as openai_project_display_name,
    count(*) as requests_count,
    count(distinct openai_model_family) as models_count,
    array_agg(distinct openai_model_family order by openai_model_family) filter (where openai_model_family is not null) as models_used,
    sum(input_tokens) as input_tokens,
    sum(cached_input_tokens) as cached_input_tokens,
    sum(output_tokens) as output_tokens,
    sum(reasoning_tokens) as reasoning_tokens,
    sum(total_tokens) as total_tokens,
    sum(estimated_total_cost_usd) as estimated_total_cost_usd,
    avg(latency_ms)::numeric(12,2) as avg_latency_ms,
    count(*) filter (where fallback_used) as fallback_count,
    count(*) filter (where quality_retry_used) as quality_retry_count
  from public.v_openai_usage_enriched
  where conversation_id is not null
  group by conversation_id, organizacion_id
) agg
left join public.conversaciones c
  on c.id = agg.conversation_id
left join public.contactos ct
  on ct.id = c.contacto_id;

create or replace view public.v_openai_costs_by_model
with (security_invoker = true) as
select
  usage_month,
  organizacion_id,
  organizacion_nombre,
  source_tenant_mode,
  channel,
  feature,
  openai_project_key,
  openai_project_display_name,
  openai_model_family,
  count(*) as requests_count,
  sum(input_tokens) as input_tokens,
  sum(cached_input_tokens) as cached_input_tokens,
  sum(output_tokens) as output_tokens,
  sum(reasoning_tokens) as reasoning_tokens,
  sum(total_tokens) as total_tokens,
  sum(estimated_total_cost_usd) as estimated_total_cost_usd,
  avg(latency_ms)::numeric(12,2) as avg_latency_ms,
  count(*) filter (where fallback_used) as fallback_count,
  count(*) filter (where quality_retry_used) as quality_retry_count
from public.v_openai_usage_enriched
group by usage_month, organizacion_id, organizacion_nombre, source_tenant_mode, channel, feature, openai_project_key, openai_project_display_name, openai_model_family;

create or replace view public.v_openai_costs_by_project
with (security_invoker = true) as
select
  usage_month,
  organizacion_id,
  organizacion_nombre,
  source_tenant_mode,
  openai_project_key,
  openai_project_display_name,
  count(*) as requests_count,
  count(distinct conversation_id) filter (where conversation_id is not null) as conversations_count,
  count(distinct openai_model_family) as models_count,
  sum(input_tokens) as input_tokens,
  sum(cached_input_tokens) as cached_input_tokens,
  sum(output_tokens) as output_tokens,
  sum(reasoning_tokens) as reasoning_tokens,
  sum(total_tokens) as total_tokens,
  sum(estimated_total_cost_usd) as estimated_total_cost_usd,
  avg(latency_ms)::numeric(12,2) as avg_latency_ms,
  count(*) filter (where fallback_used) as fallback_count,
  count(*) filter (where quality_retry_used) as quality_retry_count,
  count(*) filter (where pricing_found is false) as missing_pricing_count
from public.v_openai_usage_enriched
group by usage_month, organizacion_id, organizacion_nombre, source_tenant_mode, openai_project_key, openai_project_display_name;

create or replace view public.v_openai_costs_by_assistant
with (security_invoker = true) as
select
  usage_month,
  organizacion_id,
  organizacion_nombre,
  source_tenant_mode,
  channel,
  feature,
  openai_project_key,
  openai_project_display_name,
  openai_model_family,
  assistant_kind,
  assistant_ref,
  assistant_display_name,
  count(*) as requests_count,
  count(distinct conversation_id) filter (where conversation_id is not null) as conversations_count,
  sum(input_tokens) as input_tokens,
  sum(cached_input_tokens) as cached_input_tokens,
  sum(output_tokens) as output_tokens,
  sum(reasoning_tokens) as reasoning_tokens,
  sum(total_tokens) as total_tokens,
  sum(estimated_total_cost_usd) as estimated_total_cost_usd,
  avg(latency_ms)::numeric(12,2) as avg_latency_ms,
  count(*) filter (where fallback_used) as fallback_count,
  count(*) filter (where quality_retry_used) as quality_retry_count,
  count(*) filter (where pricing_found is false) as missing_pricing_count
from public.v_openai_usage_enriched
group by
  usage_month,
  organizacion_id,
  organizacion_nombre,
  source_tenant_mode,
  channel,
  feature,
  openai_project_key,
  openai_project_display_name,
  openai_model_family,
  assistant_kind,
  assistant_ref,
  assistant_display_name;
