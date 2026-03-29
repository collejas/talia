-- Desglose agregado por assistant_kind / assistant_ref.

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
  openai_model_family,
  assistant_kind,
  assistant_ref,
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
  openai_model_family,
  assistant_kind,
  assistant_ref;
