"""Ayudas para inyectar información de agenda en el contexto del asistente."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from zoneinfo import ZoneInfo

from app.core.config import settings
from app.core.logging import get_logger
from app.services import storage
from app.services.storage import StorageError

logger = get_logger("app.channels.booking_context")

CANCELLED_STATUSES = {"cancelled", "canceled", "cancelado"}


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    text = str(value).replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _format_booking_labels(dt: datetime, timezone_hint: str | None) -> tuple[str, str, str]:
    tz_name = timezone_hint or settings.webchat_calendar_timezone or "America/Mexico_City"
    try:
        target_tz = ZoneInfo(tz_name)
        tz_label = getattr(target_tz, "key", None) or tz_name
    except Exception:
        target_tz = timezone.utc
        tz_label = "UTC"
    localized = dt.astimezone(target_tz)
    return (
        localized.strftime("%d/%m/%Y"),
        localized.strftime("%H:%M"),
        tz_label,
    )


async def _resolve_booking_detail(
    *,
    contact_id: str | None,
    conversation_id: str | None,
    channel: str | None,
    contact: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if not contact_id or not conversation_id:
        logger.debug(
            "booking_context.missing_identifiers",
            extra={"contact_id": contact_id, "conversation_id": conversation_id},
        )
        return None
    resolved_contact = contact
    if not resolved_contact:
        try:
            resolved_contact = await storage.fetch_contact(contact_id)
        except StorageError as exc:
            logger.debug(
                "booking_context.contact_lookup_failed",
                extra={"contact_id": contact_id, "error": str(exc)},
            )
            return None
    if not resolved_contact:
        logger.debug(
            "booking_context.contact_missing",
            extra={"contact_id": contact_id, "conversation_id": conversation_id},
        )
        return None
    organizacion_id = resolved_contact.get("organizacion_id")
    if not organizacion_id:
        logger.debug(
            "booking_context.contact_has_no_org",
            extra={"contact_id": contact_id, "conversation_id": conversation_id},
        )
        return None
    try:
        outcome = await storage.ensure_conversation_opportunity(
            conversation_id=conversation_id,
            contact_id=contact_id,
            channel=channel,
        )
    except StorageError as exc:
        logger.debug(
            "booking_context.opportunity_resolution_failed",
            extra={
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "channel": channel,
                "error": str(exc),
            },
        )
        return None
    opportunity_id = None
    if isinstance(outcome, dict):
        opportunity_id = outcome.get("oportunidad_id")
    else:
        opportunity_id = str(outcome)
    if not opportunity_id:
        logger.debug(
            "booking_context.opportunity_id_missing",
            extra={"conversation_id": conversation_id, "contact_id": contact_id},
        )
        return None
    booking_row: dict[str, Any] | None = None
    demo_metadata: dict[str, Any] | None = None
    try:
        demo_metadata = await storage.fetch_demo_booking_metadata(
            oportunidad_id=opportunity_id,
            organizacion_id=str(organizacion_id),
        )
    except StorageError as exc:
        logger.debug(
            "booking_context.demo_metadata_missing",
            extra={
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "opportunity_id": opportunity_id,
                "error": str(exc),
            },
        )
    else:
        if demo_metadata:
            booking_id = str(demo_metadata.get("demo_booking_id") or "").strip()
            if booking_id:
                try:
                    booking_row = await storage.fetch_calendar_booking(booking_id)
                except StorageError as exc:
                    logger.debug(
                        "booking_context.calendar_lookup_failed",
                        extra={
                            "conversation_id": conversation_id,
                            "booking_id": booking_id,
                            "error": str(exc),
                        },
                    )
                else:
                    if not booking_row:
                        logger.debug(
                            "booking_context.calendar_row_missing",
                            extra={"booking_id": booking_id},
                        )

    if not booking_row:
        try:
            booking_row = await storage.fetch_calendar_booking_by_conversation(conversation_id)
        except StorageError as exc:
            logger.debug(
                "booking_context.calendar_conversation_missing",
                extra={
                    "conversation_id": conversation_id,
                    "contact_id": contact_id,
                    "error": str(exc),
                },
            )
        else:
            if booking_row:
                logger.debug(
                    "booking_context.calendar_fallback_used",
                    extra={
                        "conversation_id": conversation_id,
                        "contact_id": contact_id,
                        "booking_id": booking_row.get("id"),
                    },
                )
    if not booking_row and contact_id:
        try:
            booking_row = await storage.fetch_calendar_booking_by_contact(contact_id)
        except StorageError as exc:
            logger.debug(
                "booking_context.calendar_contact_missing",
                extra={
                    "contact_id": contact_id,
                    "conversation_id": conversation_id,
                    "error": str(exc),
                },
            )
        else:
            if booking_row:
                logger.debug(
                    "booking_context.calendar_contact_used",
                    extra={
                        "contact_id": contact_id,
                        "conversation_id": conversation_id,
                        "booking_id": booking_row.get("id"),
                    },
                )
    if not booking_row:
        logger.debug(
            "booking_context.no_booking_found",
            extra={"conversation_id": conversation_id, "contact_id": contact_id},
        )
        return None
    status_value = str(booking_row.get("status") or "").strip().lower()
    if status_value in CANCELLED_STATUSES:
        return None
    scheduled_raw = booking_row.get("start_at") or (demo_metadata.get("demo_scheduled_at") if demo_metadata else None)
    booking_id_value = str(
        booking_row.get("id") or booking_row.get("booking_id") or ""
    ).strip()
    start_at = _parse_iso_datetime(scheduled_raw)
    if not start_at:
        logger.debug(
            "booking_context.start_at_missing",
            extra={"booking_id": booking_id_value},
        )
        return None
    logger.info(
        "booking_context.found_booking",
        extra={
            "conversation_id": conversation_id,
            "contact_id": contact_id,
            "booking_id": booking_id_value,
            "start_at": start_at.isoformat(),
        },
    )
    return {
        "booking_id": booking_id_value,
        "start_at": start_at,
        "timezone": booking_row.get("timezone"),
        "resource_id": booking_row.get("resource_id"),
        "status": booking_row.get("status"),
    }


async def build_booking_context_message(
    *,
    contact_id: str | None,
    conversation_id: str | None,
    channel: str | None,
    contact: dict[str, Any] | None = None,
) -> str | None:
    booking = await _resolve_booking_detail(
        contact_id=contact_id,
        conversation_id=conversation_id,
        channel=channel,
        contact=contact,
    )
    if not booking:
        return None
    start_at = booking.get("start_at")
    if not start_at:
        return None
    date_label, time_label, tz_label = _format_booking_labels(
        start_at, booking.get("timezone")
    )
    parts = [
        "Contexto de agenda:",
        f"el cliente ya tiene una demo confirmada para {date_label} a las {time_label} ({tz_label}).",
    ]
    booking_id = booking.get("booking_id")
    if booking_id:
        parts.append(f"Booking ID: {booking_id}.")
    resource = booking.get("resource_id")
    if resource:
        parts.append(f"Recurso: {resource}.")
    status = booking.get("status")
    if status:
        parts.append(f"Estatus del calendario: {status}.")
    return " ".join(parts)
