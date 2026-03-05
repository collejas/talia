"""Resolver central para zona horaria efectiva y rangos de fecha."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Literal, TypedDict
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.config import settings

TimezoneSource = Literal["user", "organization", "default"]


class ResolvedTimezone(TypedDict):
    timezone: str
    source: TimezoneSource


DEFAULT_TIMEZONE = "America/Mexico_City"


def _normalize_timezone_name(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    if not candidate:
        return None
    return candidate


def _validate_timezone_name(value: str | None) -> str | None:
    candidate = _normalize_timezone_name(value)
    if not candidate:
        return None
    try:
        ZoneInfo(candidate)
    except ZoneInfoNotFoundError:
        return None
    return candidate


def resolve_effective_timezone(
    *,
    user_timezone: str | None = None,
    organization_timezone: str | None = None,
    default_timezone: str | None = None,
) -> ResolvedTimezone:
    user_tz = _validate_timezone_name(user_timezone)
    if user_tz:
        return {"timezone": user_tz, "source": "user"}

    org_tz = _validate_timezone_name(organization_timezone)
    if org_tz:
        return {"timezone": org_tz, "source": "organization"}

    fallback = _validate_timezone_name(default_timezone) or _validate_timezone_name(
        settings.webchat_calendar_timezone
    )
    if fallback:
        return {"timezone": fallback, "source": "default"}

    return {"timezone": DEFAULT_TIMEZONE, "source": "default"}


def resolve_timezone_zoneinfo(
    *,
    user_timezone: str | None = None,
    organization_timezone: str | None = None,
    default_timezone: str | None = None,
) -> tuple[ZoneInfo, ResolvedTimezone]:
    resolved = resolve_effective_timezone(
        user_timezone=user_timezone,
        organization_timezone=organization_timezone,
        default_timezone=default_timezone,
    )
    return ZoneInfo(resolved["timezone"]), resolved


def local_date_range_to_utc(
    *,
    date_from: date | None,
    date_to: date | None,
    timezone_name: str,
) -> tuple[datetime | None, datetime | None]:
    """Convierte rango local (inclusive por día) a UTC [from, to_exclusive)."""
    zone = ZoneInfo(timezone_name)
    from_utc: datetime | None = None
    to_utc_exclusive: datetime | None = None

    if date_from:
        start_local = datetime.combine(date_from, time.min, tzinfo=zone)
        from_utc = start_local.astimezone(timezone.utc)

    if date_to:
        end_local = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=zone)
        to_utc_exclusive = end_local.astimezone(timezone.utc)

    return from_utc, to_utc_exclusive

