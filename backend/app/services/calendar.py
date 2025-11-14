"""Helpers para interactuar con el calendario en Supabase."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Iterable

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("app.services.calendar")


class CalendarError(RuntimeError):
    """Errores generados al operar con el calendario."""


def _normalize_datetime(value: datetime | str) -> str:
    if isinstance(value, datetime):
        dt = value
    else:
        raw = value.replace("Z", "+00:00") if isinstance(value, str) else value
        dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _normalize_date(value: date | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


async def _call_rpc(function: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
    if not settings.supabase_url or not settings.supabase_service_role:
        raise CalendarError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")

    base_url = settings.supabase_url.rstrip("/")
    url = f"{base_url}/rest/v1/rpc/{function}"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.RequestError as exc:  # pragma: no cover - errores de red
        logger.exception(
            "calendar.rpc_network_error", extra={"function": function, "error": str(exc)}
        )
        raise CalendarError(f"Error de red al invocar {function}") from exc

    if response.status_code >= 400:
        body = response.text
        logger.error(
            "calendar.rpc_error",
            extra={
                "function": function,
                "status_code": response.status_code,
                "body": body,
            },
        )
        raise CalendarError(f"Supabase respondió error al ejecutar {function}: {body}")

    try:
        data = response.json()
    except ValueError as exc:  # pragma: no cover
        raise CalendarError(f"Respuesta inválida desde {function}") from exc

    if isinstance(data, dict):
        return [data]
    if not isinstance(data, Iterable):
        raise CalendarError(f"Respuesta inesperada desde {function}: {data!r}")
    return list(data)


def _compute_slot_id(resource_id: str, slot_start_iso: str) -> str:
    return f"{resource_id}:{slot_start_iso}"


def _compute_slot_duration_minutes(slots: list[dict[str, Any]]) -> int:
    if not slots:
        return settings.webchat_calendar_hold_minutes
    first = slots[0]
    start_raw = first.get("slot_start")
    end_raw = first.get("slot_end")
    if not start_raw or not end_raw:
        return settings.webchat_calendar_hold_minutes
    start = datetime.fromisoformat(start_raw.replace("Z", "+00:00"))
    end = datetime.fromisoformat(end_raw.replace("Z", "+00:00"))
    minutes = int((end - start).total_seconds() // 60)
    return minutes if minutes > 0 else settings.webchat_calendar_hold_minutes


async def list_slots(
    *,
    resource_id: str,
    start_date: date,
    end_date: date,
    timezone_hint: str,
    max_days: int,
) -> dict[str, Any]:
    """Obtiene la disponibilidad de un recurso en el rango solicitado."""
    payload = {
        "p_resource_id": resource_id,
        "p_from": _normalize_date(start_date),
        "p_to": _normalize_date(end_date),
        "p_timezone": timezone_hint,
        "p_max_days": max_days,
    }
    rows = await _call_rpc("fn_calendar_list_slots", payload)
    slots: list[dict[str, Any]] = []
    for row in rows:
        slot_start = row.get("slot_start")
        slot_end = row.get("slot_end")
        timezone_value = row.get("timezone") or timezone_hint
        slot_id = _compute_slot_id(resource_id, slot_start) if slot_start else None
        slots.append(
            {
                "slot_id": slot_id,
                "start_at": slot_start,
                "end_at": slot_end,
                "timezone": timezone_value,
                "local_date": row.get("local_date"),
                "local_time": row.get("local_time"),
                "capacity": row.get("capacity"),
                "booked": row.get("booked"),
                "holds": row.get("holds"),
                "is_available": row.get("is_available"),
            }
        )

    window_start = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
    window_end = datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc)
    return {
        "resource_id": resource_id,
        "timezone": timezone_hint,
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "slot_duration_minutes": _compute_slot_duration_minutes(rows),
        "slots": slots,
    }


async def hold_slot(
    *,
    resource_id: str,
    slot_start: datetime,
    conversation_id: str,
    contact_id: str | None = None,
    tarjeta_id: str | None = None,
    hold_minutes: int = 5,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Crea un hold temporal para evitar doble reserva."""
    payload = {
        "p_resource_id": resource_id,
        "p_slot_start": _normalize_datetime(slot_start),
        "p_conversacion_id": conversation_id,
        "p_contact_id": contact_id,
        "p_hold_minutes": hold_minutes,
        "p_metadata": metadata or {},
    }
    if tarjeta_id:
        payload["p_tarjeta_id"] = tarjeta_id
    rows = await _call_rpc("fn_calendar_hold_slot", payload)
    if not rows:
        raise CalendarError("No se pudo crear el hold solicitado")
    row = rows[0]
    return {
        "hold_id": row.get("hold_id"),
        "resource_id": row.get("resource_id"),
        "slot_start": row.get("slot_start"),
        "slot_end": row.get("slot_end"),
        "expires_at": row.get("expires_at"),
    }


async def confirm_slot(
    *,
    hold_id: str,
    notes: str | None = None,
    metadata: dict[str, Any] | None = None,
    meeting_url: str | None = None,
    external_join_url: str | None = None,
) -> dict[str, Any]:
    """Convierte un hold activo en una cita confirmada."""
    payload = {
        "p_hold_id": hold_id,
        "p_notes": notes,
        "p_metadata": metadata or {},
        "p_meeting_url": meeting_url,
        "p_external_join_url": external_join_url,
    }
    rows = await _call_rpc("fn_calendar_confirm_slot", payload)
    if not rows:
        raise CalendarError("No se pudo confirmar la cita")
    row = rows[0]
    return {
        "booking_id": row.get("booking_id"),
        "resource_id": row.get("resource_id"),
        "start_at": row.get("start_at"),
        "end_at": row.get("end_at"),
        "timezone": row.get("timezone"),
        "status": row.get("status"),
        "hold_id": hold_id,
    }


async def cancel_booking(*, booking_id: str, reason: str | None = None) -> dict[str, Any]:
    """Cancela una cita confirmada."""
    payload = {
        "p_booking_id": booking_id,
        "p_reason": reason,
    }
    rows = await _call_rpc("fn_calendar_cancel_booking", payload)
    if not rows:
        raise CalendarError("No se encontró la cita a cancelar")
    return rows[0]


async def reschedule_booking(
    *,
    booking_id: str,
    new_slot_start: datetime,
    notes: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Reprograma una cita existente hacia un nuevo horario."""
    payload = {
        "p_booking_id": booking_id,
        "p_new_slot_start": _normalize_datetime(new_slot_start),
        "p_notes": notes,
        "p_metadata": metadata or {},
    }
    rows = await _call_rpc("fn_calendar_reschedule_booking", payload)
    if not rows:
        raise CalendarError("No se pudo reprogramar la cita solicitada")
    return rows[0]


async def release_hold(*, hold_id: str, reason: str | None = None) -> dict[str, Any]:
    """Libera un hold activo sin confirmar la cita."""
    payload = {
        "p_hold_id": hold_id,
        "p_reason": reason,
    }
    rows = await _call_rpc("fn_calendar_release_hold", payload)
    if not rows:
        raise CalendarError("Hold no encontrado")
    return rows[0]
