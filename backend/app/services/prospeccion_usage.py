"""Resolución comercial de límites y uso mensual de prospección."""

from __future__ import annotations

import calendar
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Protocol
from uuid import UUID

CREDITS_KEY = "limit.prospeccion.credits_month"
RAW_RESULTS_KEY = "limit.prospeccion.denue_raw_results_month"
ALLOWED_ACCESS_STATUSES = frozenset({"active", "grace", "internal_free"})


class ProspeccionUsageError(RuntimeError):
    """Error estable al resolver el runtime comercial de prospección."""


class ProspeccionUsageRepository(Protocol):
    async def get_prospeccion_commercial_context(
        self, *, organizacion_id: UUID, now: datetime
    ) -> dict[str, Any]: ...


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif value:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _calendar_month(now: datetime) -> tuple[datetime, datetime]:
    current = now.astimezone(timezone.utc)
    start = current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_day = calendar.monthrange(start.year, start.month)[1]
    end = start.replace(day=last_day) + timedelta(days=1)
    return start, end


def _integer_limit(value: Any, *, error_code: str) -> int:
    try:
        decimal_value = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ProspeccionUsageError(error_code) from exc
    if decimal_value != decimal_value.to_integral_value() or decimal_value < 0:
        raise ProspeccionUsageError(error_code)
    return int(decimal_value)


def _effective_limit(
    entitlements: list[dict[str, Any]],
    overrides: list[dict[str, Any]],
    *,
    key: str,
) -> int:
    override = next((row for row in overrides if row.get("override_key") == key), None)
    if override is not None:
        return _integer_limit(override.get("override_value"), error_code="prospeccion_override_invalid")
    entitlement = next(
        (row for row in entitlements if row.get("entitlement_key") == key and row.get("enabled") is True),
        None,
    )
    if entitlement is None:
        raise ProspeccionUsageError("prospeccion_credits_not_configured")
    return _integer_limit(entitlement.get("limit_value"), error_code="prospeccion_entitlement_invalid")


async def resolve_prospeccion_usage(
    *,
    repo: ProspeccionUsageRepository,
    organizacion_id: UUID,
    now: datetime | None = None,
) -> dict[str, Any]:
    effective_now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    context = await repo.get_prospeccion_commercial_context(
        organizacion_id=organizacion_id,
        now=effective_now,
    )
    billing = context.get("billing")
    if not isinstance(billing, dict) or not billing.get("plan_id"):
        raise ProspeccionUsageError("prospeccion_plan_not_configured")

    access_status = str(billing.get("access_status") or "").strip().lower()
    if access_status not in ALLOWED_ACCESS_STATUSES:
        raise ProspeccionUsageError("prospeccion_access_blocked")

    plan = context.get("plan")
    if not isinstance(plan, dict) or plan.get("active") is not True:
        raise ProspeccionUsageError("prospeccion_plan_not_configured")

    # La calidad del lote la decide cada usuario con los filtros DENUE.
    # `any` permanece como protección mínima para no guardar filas sin contacto.
    contact_mode = "any"

    entitlements = [row for row in context.get("entitlements", []) if isinstance(row, dict)]
    overrides = [row for row in context.get("overrides", []) if isinstance(row, dict)]
    credits_limit = _effective_limit(entitlements, overrides, key=CREDITS_KEY)
    raw_limit = _effective_limit(entitlements, overrides, key=RAW_RESULTS_KEY)

    billing_start = _parse_datetime(billing.get("current_period_start"))
    billing_end = _parse_datetime(billing.get("current_period_end"))
    if billing_start and billing_end and billing_start <= effective_now < billing_end:
        period_start, period_end = billing_start, billing_end
        period_source = "billing"
    else:
        period_start, period_end = _calendar_month(effective_now)
        period_source = "calendar_utc"

    period = context.get("usage_period") if isinstance(context.get("usage_period"), dict) else None
    credits_consumed = (
        _integer_limit(
            period.get("credits_consumed") or 0,
            error_code="prospeccion_usage_period_invalid",
        )
        if period
        else 0
    )
    raw_consumed = (
        _integer_limit(
            period.get("raw_results_consumed") or 0,
            error_code="prospeccion_usage_period_invalid",
        )
        if period
        else 0
    )
    credits_remaining = max(credits_limit - credits_consumed, 0)
    raw_remaining = max(raw_limit - raw_consumed, 0)

    return {
        "ok": True,
        "plan": {"code": plan.get("code"), "name": plan.get("name")},
        "access_status": access_status,
        "period": {
            "start": period_start.isoformat(),
            "end": period_end.isoformat(),
            "source": period_source,
            "persisted": period is not None,
        },
        "credits": {
            "limit": credits_limit,
            "consumed": credits_consumed,
            "remaining": credits_remaining,
            "usage_percentage": round((credits_consumed / credits_limit) * 100, 2) if credits_limit else 100.0,
        },
        "raw_results": {
            "limit": raw_limit,
            "consumed": raw_consumed,
            "remaining": raw_remaining,
        },
        "required_contact_mode": contact_mode,
    }
