"""Utility para obtener referencia temporal legible en español para los asistentes."""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.core.config import settings

SPANISH_DAYS = (
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
    "domingo",
)
SPANISH_MONTHS = (
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)


def get_current_time_reference(timezone_hint: str | None = None) -> str:
    """Devuelve una frase con la fecha/hora actual y la zona en español."""
    tz_name = timezone_hint or settings.webchat_calendar_timezone or "America/Mexico_City"
    try:
        local_tz = ZoneInfo(tz_name)
    except Exception:
        local_tz = timezone.utc
        tz_name = "UTC"
    now_local = datetime.now(local_tz)
    day_spanish = SPANISH_DAYS[now_local.weekday()]
    month_spanish = SPANISH_MONTHS[now_local.month - 1]
    timezone_label = getattr(local_tz, "key", None) or getattr(local_tz, "zone", None) or tz_name
    return (
        f"Fecha actual: {day_spanish} {now_local.day} de {month_spanish} de {now_local.year} "
        f"a las {now_local.strftime('%H:%M')} ({timezone_label})."
    )
