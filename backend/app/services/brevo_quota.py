"""Utilidades para consultar cuota diaria y consumo en Brevo."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

import httpx


@dataclass(slots=True)
class BrevoQuotaSnapshot:
    sent_today: int | None
    daily_limit: int | None
    remaining: int | None
    usage_pct: float | None
    plan_type: str | None
    plan_credits: int | None
    warnings: list[str]


def _clean_text(value: Any) -> str | None:
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    if value is None:
        return None
    trimmed = str(value).strip()
    return trimmed or None


def _normalize_base_url(value: str | None) -> str:
    raw = _clean_text(value) or "https://api.brevo.com/v3"
    return raw.rstrip("/")


def _as_int(value: Any) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def _extract_plan_info(account_payload: Any) -> tuple[str | None, int | None]:
    if not isinstance(account_payload, dict):
        return None, None
    plans = account_payload.get("plan")
    if not isinstance(plans, list):
        return None, None
    for row in plans:
        if not isinstance(row, dict):
            continue
        plan_type = (_clean_text(row.get("type")) or "").lower()
        credits = _as_int(row.get("credits"))
        if credits is None:
            continue
        if plan_type == "free":
            return plan_type, credits
    # Si no hay plan free, exponemos créditos pero sin asumir que sean diarios.
    for row in plans:
        if not isinstance(row, dict):
            continue
        credits = _as_int(row.get("credits"))
        if credits is None:
            continue
        plan_type = _clean_text(row.get("type"))
        return plan_type.lower() if plan_type else None, credits
    return None, None


def _extract_sent_today(report_payload: Any) -> int | None:
    if not isinstance(report_payload, dict):
        return None
    for key in ("requests", "request", "messagesSent", "sent"):
        value = _as_int(report_payload.get(key))
        if value is not None:
            return value
    return None


async def fetch_brevo_daily_quota(
    *,
    api_key: str,
    base_url: str | None,
    local_day: date,
) -> BrevoQuotaSnapshot:
    if not _clean_text(api_key):
        raise ValueError("brevo_api_key_missing")
    normalized_base = _normalize_base_url(base_url)
    headers = {
        "api-key": api_key,
        "accept": "application/json",
    }
    day_iso = local_day.isoformat()
    warnings: list[str] = []
    account_payload: dict[str, Any] = {}
    report_payload: dict[str, Any] = {}

    async with httpx.AsyncClient(timeout=12.0) as client:
        account_exc: Exception | None = None
        report_exc: Exception | None = None
        try:
            account_response = await client.get(f"{normalized_base}/account", headers=headers)
            if account_response.status_code < 400:
                account_payload = account_response.json() if account_response.content else {}
            else:
                warnings.append(f"account_http_{account_response.status_code}")
        except Exception as exc:  # noqa: BLE001
            account_exc = exc
            warnings.append("account_request_failed")
        try:
            report_response = await client.get(
                f"{normalized_base}/smtp/statistics/aggregatedReport",
                headers=headers,
                params={"startDate": day_iso, "endDate": day_iso},
            )
            if report_response.status_code < 400:
                report_payload = report_response.json() if report_response.content else {}
            else:
                warnings.append(f"aggregated_report_http_{report_response.status_code}")
        except Exception as exc:  # noqa: BLE001
            report_exc = exc
            warnings.append("aggregated_report_request_failed")
        if account_exc and report_exc:
            raise RuntimeError("brevo_quota_unreachable")

    sent_today = _extract_sent_today(report_payload)
    plan_type, plan_credits = _extract_plan_info(account_payload)
    daily_limit: int | None = 300 if plan_type == "free" else None
    remaining: int | None = None
    usage_pct: float | None = None
    # En plan Free, Brevo /account.plan[].credits representa restantes del día.
    if plan_type == "free" and plan_credits is not None:
        remaining = plan_credits
    if daily_limit is not None and remaining is not None:
        sent_today = max(daily_limit - remaining, 0)
    elif daily_limit is not None and sent_today is not None:
        remaining = max(daily_limit - sent_today, 0)
    if daily_limit is not None and remaining is not None:
        used_today = max(daily_limit - remaining, 0)
        usage_pct = round((used_today / daily_limit * 100), 2) if daily_limit > 0 else None

    return BrevoQuotaSnapshot(
        sent_today=sent_today,
        daily_limit=daily_limit,
        remaining=remaining,
        usage_pct=usage_pct,
        plan_type=plan_type,
        plan_credits=plan_credits,
        warnings=warnings,
    )


__all__ = ["BrevoQuotaSnapshot", "fetch_brevo_daily_quota"]
