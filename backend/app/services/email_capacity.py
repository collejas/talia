"""Capacidad de correo visible para la programación de prospección."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import tenant_runtime
from app.services.brevo_quota import fetch_brevo_daily_quota
from app.services.postmark.repository import PostmarkRepository, PostmarkRepositoryError


POSTMARK_ACTIVE_STATUSES = {"active", "validated", "migrated"}


def _base_response(*, timezone_name: str, local_day: date, utc_day: date) -> dict[str, Any]:
    return {
        "ok": True,
        "configured": True,
        "available": False,
        "period_kind": None,
        "period_start": None,
        "period_end": None,
        "sent": None,
        "scheduled": None,
        "projected": None,
        "limit": None,
        "remaining": None,
        "usage_pct": None,
        "timezone": timezone_name,
        "date_local": local_day.isoformat(),
        "date_utc": utc_day.isoformat(),
        "warnings": [],
    }


async def resolve_prospeccion_email_capacity(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    user_token: str,
    timezone_name: str,
) -> dict[str, Any]:
    """Devuelve una capacidad neutral sin exponer el proveedor al panel."""

    zoneinfo = ZoneInfo(timezone_name)
    local_day = datetime.now(zoneinfo).date()
    utc_day = datetime.now(timezone.utc).date()
    response = _base_response(
        timezone_name=timezone_name,
        local_day=local_day,
        utc_day=utc_day,
    )

    try:
        postmark_repository = PostmarkRepository()
        migration = await postmark_repository.get_migration(organizacion_id=organizacion_id)
    except PostmarkRepositoryError:
        response["warnings"] = ["email_service_unavailable"]
        return response

    postmark_enabled = bool(
        migration
        and migration.get("feature_enabled") is True
        and migration.get("status") in POSTMARK_ACTIVE_STATUSES
    )
    if postmark_enabled:
        try:
            plan = await postmark_repository.get_active_plan(organizacion_id=organizacion_id)
            usage = await postmark_repository.get_current_usage(organizacion_id=organizacion_id)
        except PostmarkRepositoryError:
            response["warnings"] = ["email_capacity_unavailable"]
            return response
        if not plan or not usage:
            response["warnings"] = ["email_plan_unavailable"]
            return response

        limit = max(int(plan.get("period_limit") or 0), 0)
        reserved = max(int(usage.get("reserved_recipients") or 0), 0)
        released = max(int(usage.get("released_recipients") or 0), 0)
        consumed = max(reserved - released, 0)
        remaining = max(limit - consumed, 0)
        response.update(
            {
                "period_kind": "monthly",
                "period_start": usage.get("period_start"),
                "period_end": usage.get("period_end"),
                "sent": consumed,
                "scheduled": 0,
                "projected": consumed,
                "limit": limit,
                "remaining": remaining,
                "usage_pct": round(consumed / limit * 100, 2) if limit else None,
                "available": True,
            }
        )
        return response

    day_start_utc = datetime.combine(utc_day, datetime.min.time(), tzinfo=timezone.utc)
    day_end_utc_exclusive = day_start_utc + timedelta(days=1)
    try:
        scheduled = await repo.count_pending_email_envios_for_local_day(
            usuario_token=user_token,
            start_utc=day_start_utc,
            end_utc_exclusive=day_end_utc_exclusive,
        )
    except CRMRepositoryError:
        scheduled = 0
        response["warnings"] = ["scheduled_email_count_unavailable"]

    brevo_settings = await tenant_runtime.get_brevo_runtime_settings(organizacion_id=organizacion_id)
    api_key = str(brevo_settings.api_key or "").strip()
    if not api_key:
        response["configured"] = False
        response["warnings"] = [*response["warnings"], "email_not_configured"]
        response["scheduled"] = scheduled
        return response

    try:
        snapshot = await fetch_brevo_daily_quota(
            api_key=api_key,
            base_url=brevo_settings.base_url,
            local_day=utc_day,
        )
    except Exception:  # noqa: BLE001
        response["warnings"] = [*response["warnings"], "email_capacity_unavailable"]
        response["scheduled"] = scheduled
        return response

    remaining = snapshot.remaining
    remaining_after_scheduled = (
        max(remaining - scheduled, 0) if remaining is not None else None
    )
    projected = snapshot.sent_today + scheduled if snapshot.sent_today is not None else None
    response.update(
        {
            "period_kind": "daily",
            "period_start": day_start_utc.isoformat(),
            "period_end": day_end_utc_exclusive.isoformat(),
            "sent": snapshot.sent_today,
            "scheduled": scheduled,
            "projected": projected,
            "limit": snapshot.daily_limit,
            "remaining": remaining_after_scheduled,
            "usage_pct": snapshot.usage_pct,
            "available": True,
        }
    )
    return response


__all__ = ["resolve_prospeccion_email_capacity"]
