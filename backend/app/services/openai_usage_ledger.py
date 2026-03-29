"""Ledger interno para uso y costos estimados de OpenAI."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

import httpx

from app.assistants.manager import AssistantConfig
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("app.services.openai_usage_ledger")

_ZERO = Decimal("0")
_ONE_MILLION = Decimal("1000000")


@dataclass(slots=True)
class PricingBreakdown:
    input_cost: Decimal = _ZERO
    cached_input_cost: Decimal = _ZERO
    output_cost: Decimal = _ZERO
    reasoning_cost: Decimal = _ZERO
    tools_cost: Decimal = _ZERO

    @property
    def total(self) -> Decimal:
        return self.input_cost + self.cached_input_cost + self.output_cost + self.reasoning_cost + self.tools_cost


def _ensure_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _to_int(value: Any) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _to_decimal(value: Any) -> Decimal:
    if value is None:
        return _ZERO
    try:
        return Decimal(str(value))
    except Exception:
        return _ZERO


def _quantize_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.00000001"))


def api_key_fingerprint(api_key: str | None) -> str | None:
    if not api_key:
        return None
    digest = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    return f"sha256:{digest[:16]}"


def _assistant_kind(assistant: AssistantConfig | None) -> str:
    if not assistant:
        return "raw_model"
    if assistant.is_prompt:
        return "prompt"
    if assistant.assistant_id:
        return "assistant"
    return "raw_model"


def _assistant_ref(assistant: AssistantConfig | None) -> str | None:
    if not assistant:
        return None
    return assistant.prompt_id or assistant.assistant_id


def _source_tenant_mode(organizacion_id: UUID | None, project_id: str | None) -> str:
    if organizacion_id and str(organizacion_id) != "00000000-0000-0000-0000-000000000001" and project_id:
        return "tenant_dedicated"
    return "master_shared"


def _coerce_uuid(value: UUID | str | None) -> UUID | None:
    if isinstance(value, UUID):
        return value
    if isinstance(value, str):
        try:
            return UUID(value)
        except (TypeError, ValueError):
            return None
    return None


async def _request(
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json_payload: Any = None,
    prefer: str | None = None,
) -> httpx.Response:
    if not settings.supabase_url or not settings.supabase_service_role:
        raise RuntimeError("supabase_not_configured")
    headers = {
        "Accept": "application/json",
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
    }
    if prefer:
        headers["Prefer"] = prefer
    url = f"{settings.supabase_url.rstrip('/')}{path}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.request(method, url, params=params, json=json_payload, headers=headers)
    response.raise_for_status()
    return response


async def _find_active_pricing(*, provider: str, model: str, at: datetime | None = None) -> dict[str, Any] | None:
    ts = (at or datetime.now(timezone.utc)).isoformat()
    try:
        response = await _request(
            "GET",
            "/rest/v1/openai_pricing_catalog",
            params={
                "select": (
                    "input_per_1m_usd,cached_input_per_1m_usd,output_per_1m_usd,"
                    "reasoning_per_1m_usd,tool_call_unit_usd"
                ),
                "provider": f"eq.{provider}",
                "model": f"eq.{model}",
                "effective_from": f"lte.{ts}",
                "or": f"(effective_to.is.null,effective_to.gt.{ts})",
                "order": "effective_from.desc",
                "limit": "1",
            },
        )
    except Exception as exc:
        logger.warning(
            "openai_usage_ledger.pricing_lookup_failed",
            extra={"provider": provider, "model": model, "error": str(exc)},
        )
        return None
    data = response.json()
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data[0]
    if isinstance(data, dict):
        return data
    return None


async def _estimate_cost(
    *,
    provider: str,
    model: str,
    input_tokens: int,
    cached_input_tokens: int,
    output_tokens: int,
    reasoning_tokens: int,
) -> tuple[PricingBreakdown, bool]:
    pricing = await _find_active_pricing(provider=provider, model=model)
    if not pricing:
        return PricingBreakdown(), False

    input_rate = _to_decimal(pricing.get("input_per_1m_usd"))
    cached_input_rate = _to_decimal(pricing.get("cached_input_per_1m_usd"))
    output_rate = _to_decimal(pricing.get("output_per_1m_usd"))
    reasoning_rate = _to_decimal(pricing.get("reasoning_per_1m_usd"))

    billable_input_tokens = max(0, input_tokens - cached_input_tokens)
    breakdown = PricingBreakdown(
        input_cost=_quantize_money(Decimal(billable_input_tokens) * input_rate / _ONE_MILLION),
        cached_input_cost=_quantize_money(Decimal(cached_input_tokens) * cached_input_rate / _ONE_MILLION),
        output_cost=_quantize_money(Decimal(output_tokens) * output_rate / _ONE_MILLION),
        reasoning_cost=_quantize_money(Decimal(reasoning_tokens) * reasoning_rate / _ONE_MILLION),
        tools_cost=_ZERO,
    )
    return breakdown, True


async def record_response_usage(
    *,
    organizacion_id: UUID | str | None,
    channel: str,
    feature: str | None,
    assistant: AssistantConfig | None,
    response_payload: dict[str, Any],
    request_purpose: str,
    latency_ms: int | None = None,
    api_key: str | None = None,
    request_metadata: dict[str, Any] | None = None,
    conversation_id: UUID | str | None = None,
    message_id: UUID | str | None = None,
    contact_id: UUID | str | None = None,
    opportunity_id: UUID | str | None = None,
    quality_retry_used: bool = False,
    fallback_used: bool = False,
    request_status: str = "completed",
    error_code: str | None = None,
    error_message: str | None = None,
    model_override: str | None = None,
    project_id: str | None = None,
) -> None:
    if not organizacion_id:
        return
    usage = _ensure_dict(response_payload.get("usage"))
    input_details = _ensure_dict(usage.get("input_tokens_details"))
    output_details = _ensure_dict(usage.get("output_tokens_details"))
    input_tokens = _to_int(usage.get("input_tokens"))
    cached_input_tokens = _to_int(input_details.get("cached_tokens"))
    output_tokens = _to_int(usage.get("output_tokens"))
    reasoning_tokens = _to_int(output_details.get("reasoning_tokens"))
    total_tokens = _to_int(usage.get("total_tokens"))

    model = (
        model_override
        or response_payload.get("model")
        or (response_payload.get("response") or {}).get("model")
        or "unknown"
    )
    resolved_project_id = project_id or (assistant.project_id if assistant else None)
    costs, pricing_found = await _estimate_cost(
        provider="openai",
        model=str(model),
        input_tokens=input_tokens,
        cached_input_tokens=cached_input_tokens,
        output_tokens=output_tokens,
        reasoning_tokens=reasoning_tokens,
    )
    metadata = _ensure_dict(request_metadata)
    metadata.setdefault("pricing_found", pricing_found)
    payload = {
        "organizacion_id": str(organizacion_id),
        "source_tenant_mode": _source_tenant_mode(
            _coerce_uuid(organizacion_id),
            resolved_project_id,
        ),
        "channel": channel,
        "feature": feature,
        "conversation_id": str(conversation_id) if conversation_id else None,
        "message_id": str(message_id) if message_id else None,
        "contact_id": str(contact_id) if contact_id else None,
        "opportunity_id": str(opportunity_id) if opportunity_id else None,
        "openai_response_id": response_payload.get("id"),
        "openai_conversation_id": _ensure_dict(response_payload.get("conversation")).get("id"),
        "openai_project_id": resolved_project_id,
        "openai_api_key_fingerprint": api_key_fingerprint(api_key),
        "openai_model": str(model),
        "openai_provider": "openai",
        "assistant_kind": _assistant_kind(assistant),
        "assistant_ref": _assistant_ref(assistant),
        "prompt_version": assistant.prompt_version if assistant else None,
        "request_purpose": request_purpose,
        "request_metadata": metadata,
        "input_tokens": input_tokens,
        "cached_input_tokens": cached_input_tokens,
        "output_tokens": output_tokens,
        "reasoning_tokens": reasoning_tokens,
        "total_tokens": total_tokens,
        "estimated_input_cost_usd": str(costs.input_cost),
        "estimated_cached_input_cost_usd": str(costs.cached_input_cost),
        "estimated_output_cost_usd": str(costs.output_cost),
        "estimated_reasoning_cost_usd": str(costs.reasoning_cost),
        "estimated_tools_cost_usd": str(costs.tools_cost),
        "estimated_total_cost_usd": str(costs.total),
        "latency_ms": latency_ms,
        "request_status": request_status,
        "error_code": error_code,
        "error_message": error_message,
        "fallback_used": fallback_used,
        "quality_retry_used": quality_retry_used,
    }
    try:
        await _request(
            "POST",
            "/rest/v1/openai_request_usage",
            json_payload=payload,
            prefer="return=minimal",
        )
    except Exception as exc:
        logger.warning(
            "openai_usage_ledger.persist_failed",
            extra={
                "organizacion_id": str(organizacion_id),
                "channel": channel,
                "request_purpose": request_purpose,
                "response_id": response_payload.get("id"),
                "error": str(exc),
            },
        )
