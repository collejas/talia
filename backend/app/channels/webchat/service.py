"""Servicios del canal webchat."""

from __future__ import annotations

import asyncio
import io
import json
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlparse
from uuid import UUID
from xml.etree import ElementTree as ET

import httpx
from fastapi import HTTPException, Request, UploadFile, status
from openai import AsyncOpenAI
from zoneinfo import ZoneInfo

from app.assistants import registry
from app.assistants.manager import AssistantConfig
from app.assistants.runtime import AssistantSpec, resolve_assistant_spec
from app.assistants.runtime import (
    build_prompt_payload as build_assistant_prompt_payload,
)
from app.assistants.tool_runtime import ToolRuntimeContext, run_tool_loop
from app.assistants.tools import lead as lead_tools
from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import (
    EmailSendError,
    geolocation,
    leads_geo,
    send_email,
    storage,
    webchat_followups,
)
from app.channels.webchat import notifications as webchat_notifications
from app.services import calendar as calendar_service
from app.services import openai as openai_service
from app.services.calendar import CalendarError
from app.services.catalog_context import (
    CatalogContext,
    build_catalog_context,
)
from app.services.catalog_embeddings import CatalogEmbeddingService
from app.services.catalog_fraccionamientos import list_catalog_fraccionamientos
from app.services.storage import StorageError

from . import schemas

logger = get_logger("app.channels.webchat")
visit_logger = get_logger("app.analytics.visitas")

MAX_ATTACHMENTS_PER_MESSAGE = 3
MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024  # 8 MB
MAX_TEXT_ATTACHMENT_CHARS = 4000
TEXT_MIME_PREFIXES = ("text/",)
TEXT_MIME_WHITELIST = {
    "application/json",
    "application/xml",
    "application/x-yaml",
    "application/yaml",
}
TEXT_EXTENSION_WHITELIST = {
    ".txt",
    ".md",
    ".markdown",
    ".csv",
    ".json",
    ".yaml",
    ".yml",
    ".log",
}

CALENDAR_MAX_WINDOW_DAYS = 60

DEFAULT_FALLBACK = (
    "Tu mensaje quedó registrado, pero tuve un problema momentáneo al responder. "
    "Intentemos nuevamente en unos instantes."
)

DEFAULT_DEMO_DURATION_MINUTES = 45
REMINDER_MINUTES_DEFAULT = 120
REMINDER_MINUTES_MIN = 15
REMINDER_MINUTES_MAX = 720
REMINDER_SETTINGS_TTL_SECONDS = 300
DEMO_STAGE_CODE = "demo"
CONTACT_ASSIGNMENT_ERROR = (
    "Necesito al menos un teléfono o correo para conectarte con un vendedor."
)


_REMINDER_SETTINGS_CACHE: dict[str, Any] | None = None
_REMINDER_SETTINGS_LOADED_AT: datetime | None = None


def _resolve_calendar_resource_id() -> str:
    resource_id = settings.webchat_calendar_resource_id
    if not resource_id:
        raise ValueError("No se configuró el calendario de demos para el webchat.")
    return resource_id


def _normalize_reminder_offset(value: Any) -> int:
    try:
        minutes = int(value)
    except (TypeError, ValueError):
        minutes = REMINDER_MINUTES_DEFAULT
    return max(REMINDER_MINUTES_MIN, min(REMINDER_MINUTES_MAX, minutes))


async def _get_reminder_settings() -> dict[str, Any]:
    global _REMINDER_SETTINGS_CACHE, _REMINDER_SETTINGS_LOADED_AT
    now = datetime.now(timezone.utc)
    if (
        _REMINDER_SETTINGS_CACHE is not None
        and _REMINDER_SETTINGS_LOADED_AT is not None
        and (now - _REMINDER_SETTINGS_LOADED_AT).total_seconds() < REMINDER_SETTINGS_TTL_SECONDS
    ):
        return _REMINDER_SETTINGS_CACHE

    settings_payload = {
        "enabled": True,
        "offset_minutes": REMINDER_MINUTES_DEFAULT,
    }
    try:
        record = await storage.fetch_calendar_settings()
        settings_payload["enabled"] = bool(record.get("reminder_enabled", True))
        settings_payload["offset_minutes"] = _normalize_reminder_offset(
            record.get("reminder_offset_minutes"),
        )
    except StorageError as exc:
        logger.warning(
            "calendar.reminder_settings_fetch_failed",
            extra={"error": str(exc)},
        )

    _REMINDER_SETTINGS_CACHE = settings_payload
    _REMINDER_SETTINGS_LOADED_AT = now
    return settings_payload


def _normalize_window_days(raw_value: Any) -> int:
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        value = settings.webchat_calendar_default_days
    value = max(1, value)
    return min(value, CALENDAR_MAX_WINDOW_DAYS)


def _parse_calendar_date(raw_value: Any) -> date:
    today = datetime.now(timezone.utc).date()
    if not raw_value:
        return today
    try:
        parsed = date.fromisoformat(str(raw_value))
    except ValueError as exc:  # pragma: no cover - validación defensiva
        raise ValueError(f"Fecha inválida para start_date: {raw_value}") from exc
    if parsed < today:
        return today
    return parsed


def _parse_calendar_datetime(raw_value: Any) -> datetime:
    if not raw_value:
        raise ValueError("start_at requerido para la operación solicitada")
    text = str(raw_value).strip()
    if text.endswith("Z"):
        text = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError as exc:  # pragma: no cover
        raise ValueError(f"Fecha/hora inválida: {raw_value}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except ValueError:  # pragma: no cover - defensivo ante respuestas inválidas
        return None


def _resolve_timezone_preference(value: Any) -> str:
    preferred = str(value).strip() if isinstance(value, str) else ""
    fallback = settings.webchat_calendar_timezone
    return preferred or fallback


def _build_slot_identifier(resource_id: str, slot_start: datetime) -> str:
    return f"{resource_id}:{slot_start.isoformat()}"


async def _resolve_conversation_metadata(conversation_id: str) -> dict[str, Any]:
    if not conversation_id:
        raise ValueError("conversation_id es requerido para esta operación.")
    try:
        conversation_meta = await storage.fetch_webchat_conversation(conversation_id)
    except storage.StorageError as exc:
        logger.exception(
            "calendar.conversation_lookup_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        raise ValueError("No se encontró la conversación solicitada.") from exc
    contact_id = conversation_meta.get("contact_id")
    if not contact_id:
        raise ValueError("No se encontró el contacto asociado a la conversación.")
    return conversation_meta


async def _ensure_opportunity_when_contact_ready(
    *,
    conversation_id: str,
    contact_id: str,
    channel: str | None = None,
    contact: dict[str, Any] | None = None,
) -> str:
    contact_key = (contact_id or "").strip()
    if not contact_key:
        raise ValueError("No se pudo determinar el contacto para asignar a un vendedor.")
    ready = await webchat_followups.ensure_contact_ready_for_assignment(
        conversation_id=conversation_id,
        contact_id=contact_key,
        contact=contact,
    )
    if not ready:
        log_event(
            logger,
            "webchat.assignment.blocked_contact_missing",
            conversation_id=conversation_id,
            contact_id=contact_key,
        )
        raise ValueError(CONTACT_ASSIGNMENT_ERROR)
    return await storage.ensure_conversation_opportunity(
        conversation_id=conversation_id,
        contact_id=contact_key,
        channel=channel,
    )


def _build_booking_response(data: dict[str, Any]) -> schemas.CalendarBookingResponse:
    start_at = _parse_iso_datetime(data.get("start_at"))
    end_at = _parse_iso_datetime(data.get("end_at"))
    timezone_value = data.get("timezone")
    booking_status = str(data.get("status") or "confirmed")
    return schemas.CalendarBookingResponse(
        status=booking_status,
        booking_id=str(data.get("booking_id")),
        resource_id=str(data.get("resource_id")),
        start_at=start_at or datetime.now(timezone.utc),
        end_at=end_at,
        timezone=timezone_value,
        hold_id=data.get("hold_id"),
        notes=data.get("notes"),
        metadata=data.get("metadata") if isinstance(data.get("metadata"), dict) else None,
        tarjeta_id=data.get("tarjeta_id"),
    )


def _build_booking_response_from_db_row(row: dict[str, Any]) -> schemas.CalendarBookingResponse:
    payload = {
        "booking_id": row.get("id"),
        "resource_id": row.get("resource_id"),
        "start_at": row.get("start_at"),
        "end_at": row.get("end_at"),
        "timezone": row.get("timezone"),
        "hold_id": row.get("hold_id"),
        "notes": row.get("notes"),
        "metadata": row.get("metadata") if isinstance(row.get("metadata"), dict) else None,
        "tarjeta_id": row.get("tarjeta_id"),
        "status": row.get("status"),
    }
    if not payload["resource_id"]:
        payload["resource_id"] = settings.webchat_calendar_resource_id
    return _build_booking_response(payload)


def _sanitize_ics_text(value: str) -> str:
    text = value.replace("\\", "\\\\")
    text = text.replace("\r\n", "\n")
    return text.replace("\n", "\\n")


def _build_demo_ics_attachment(
    booking: schemas.CalendarBookingResponse,
    timezone_name: str,
    contact_name: str | None,
    contact_email: str,
) -> dict[str, object]:
    start_utc = booking.start_at.astimezone(timezone.utc)
    end_source = booking.end_at or (
        booking.start_at + timedelta(minutes=DEFAULT_DEMO_DURATION_MINUTES)
    )
    end_utc = end_source.astimezone(timezone.utc)
    organizer_email = (settings.mail_username or contact_email).strip() or contact_email
    description_parts = [
        "Demo de Tal-IA confirmada.",
        f"Zona horaria preferida: {timezone_name.replace('_', ' ')}.",
    ]
    if booking.notes:
        description_parts.append(f"Notas: {booking.notes.strip()}")
    description = _sanitize_ics_text(" ".join(description_parts))
    summary = _sanitize_ics_text("Demo Tal-IA")
    attendee_name = contact_name.strip() if isinstance(contact_name, str) else contact_email
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Tal-IA//Demo Booking//ES",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        f"UID:{booking.booking_id}@talia.mx",
        f"DTSTAMP:{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
        f"DTSTART:{start_utc.strftime('%Y%m%dT%H%M%SZ')}",
        f"DTEND:{end_utc.strftime('%Y%m%dT%H%M%SZ')}",
        f"SUMMARY:{summary}",
        f"DESCRIPTION:{description}",
        f"ATTENDEE;CN={_sanitize_ics_text(attendee_name)}:mailto:{contact_email}",
        f"ORGANIZER;CN=Tal-IA:mailto:{organizer_email}",
        "STATUS:CONFIRMED",
        "SEQUENCE:0",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    ics_payload = "\r\n".join(lines) + "\r\n"
    return {
        "content": ics_payload.encode("utf-8"),
        "filename": f"tal-ia-demo-{booking.booking_id}.ics",
        "maintype": "text",
        "subtype": "calendar",
        "headers": {"Content-Class": "urn:content-classes:calendarmessage"},
    }


async def _patch_booking_metadata(
    booking: schemas.CalendarBookingResponse,
    patch: dict[str, Any],
    *,
    event: str,
) -> None:
    if not patch:
        return
    try:
        metadata = await storage.update_calendar_booking_metadata(
            booking_id=booking.booking_id,
            metadata_patch=patch,
            current_metadata=booking.metadata,
        )
        booking.metadata = metadata
    except StorageError as exc:
        logger.warning(
            event,
            extra={"booking_id": booking.booking_id, "error": str(exc)},
        )


async def _mark_booking_invite_status(
    booking: schemas.CalendarBookingResponse,
    patch: dict[str, Any],
) -> None:
    await _patch_booking_metadata(
        booking,
        patch,
        event="calendar.booking_metadata_update_failed",
    )


async def _send_booking_confirmation_email(
    *,
    booking: schemas.CalendarBookingResponse,
    contact_id: str | None,
    conversation_id: str,
    tarjeta_id: str | None,
    contact: dict[str, Any] | None = None,
) -> None:
    if not contact_id and contact is None:
        return
    contact = contact or await _resolve_contact(contact_id)
    metadata = booking.metadata if isinstance(booking.metadata, dict) else {}
    org_hint = _extract_contact_org(contact)
    if not org_hint and isinstance(metadata, dict):
        org_value = metadata.get("organizacion_id")
        if isinstance(org_value, str) and org_value.strip():
            org_hint = org_value.strip()
    email_value = _extract_contact_email(contact)
    needs_fallback = (not email_value or email_value.lower() == "none") or contact is None
    if needs_fallback and tarjeta_id:
        try:
            fallback_contact = await storage.fetch_opportunity_contact(
                oportunidad_id=tarjeta_id,
                organizacion_id=str(org_hint) if org_hint else None,
            )
        except StorageError as exc:
            logger.warning(
                "calendar.opportunity_contact_lookup_failed",
                extra={
                    "tarjeta_id": tarjeta_id,
                    "booking_id": booking.booking_id,
                    "error": str(exc),
                },
            )
        else:
            if fallback_contact:
                fallback_email = _extract_contact_email(fallback_contact)
                if fallback_email:
                    contact = fallback_contact
                    contact_id = str(fallback_contact.get("id") or contact_id)
                    email_value = fallback_email
                    org_hint = _extract_contact_org(fallback_contact) or org_hint
                    logger.info(
                        "calendar.invite_contact_fallback",
                        extra={
                            "booking_id": booking.booking_id,
                            "tarjeta_id": tarjeta_id,
                            "contact_id": contact_id,
                        },
                    )
    if not email_value:
        await _mark_booking_invite_status(
            booking,
            {
                "invite_status": "skipped",
                "invite_reason": "missing_contact_email",
                "invite_attempt_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        logger.info(
            "calendar.invite_skipped_missing_email",
            extra={"conversation_id": conversation_id, "booking_id": booking.booking_id},
        )
        return

    timezone_name = booking.timezone or settings.webchat_calendar_timezone
    tz_label = timezone_name.replace("_", " ")
    try:
        zone = ZoneInfo(timezone_name)
    except Exception:
        zone = timezone.utc
    start_local = booking.start_at.astimezone(zone)
    end_local = (
        booking.end_at or (booking.start_at + timedelta(minutes=DEFAULT_DEMO_DURATION_MINUTES))
    ).astimezone(zone)
    date_label = start_local.strftime("%d/%m/%Y")
    time_label = start_local.strftime("%H:%M")

    contact_name = contact.get("nombre_completo") if contact else None
    greeting = f"Geoactiv - Tal-IA {contact_name}," if contact_name else "Hola,"
    end_label = end_local.strftime("%H:%M")

    body_lines = [
        greeting,
        "",
        f"Tu demo con Tal-IA quedó confirmada para el {date_label} a las {time_label} ({tz_label}).",
        f"El espacio queda reservado aproximadamente hasta las {end_label} ({tz_label}).",
        "Te enviaré un recordatorio antes del horario confirmado. Si necesitas moverla o cancelarla, responde este correo o escríbeme por el chat.",
    ]
    if booking.notes:
        body_lines.extend(["", f"Notas registradas: {booking.notes.strip()}"])
    body_lines.extend(
        [
            "",
            "Adjunté un evento de calendario para que lo agregues a tu agenda.",
            "",
            "Tal-IA · Geoactiv",
        ]
    )
    subject = "Tal-IA · Demo confirmada"
    attachments = [
        _build_demo_ics_attachment(
            booking=booking,
            timezone_name=timezone_name,
            contact_name=contact_name,
            contact_email=email_value,
        )
    ]

    try:
        message_id = await asyncio.to_thread(
            send_email,
            subject=subject,
            body_text="\n".join(body_lines),
            recipients=[email_value],
            attachments=attachments,
        )
    except EmailSendError as exc:
        await _mark_booking_invite_status(
            booking,
            {
                "invite_status": "failed",
                "invite_error": str(exc),
                "invite_attempt_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        logger.error(
            "calendar.invite_send_failed",
            extra={
                "conversation_id": conversation_id,
                "booking_id": booking.booking_id,
                "error": str(exc),
            },
        )
        return
    except Exception:  # pragma: no cover - defensivo
        await _mark_booking_invite_status(
            booking,
            {
                "invite_status": "failed",
                "invite_error": "unexpected_error",
                "invite_attempt_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        logger.exception(
            "calendar.invite_send_unexpected",
            extra={"conversation_id": conversation_id, "booking_id": booking.booking_id},
        )
        return

    reminder_settings = await _get_reminder_settings()
    patch: dict[str, Any] = {
        "invite_status": "sent",
        "invite_message_id": message_id,
        "invite_sent_at": datetime.now(timezone.utc).isoformat(),
        "invite_email": email_value,
    }
    if reminder_settings.get("enabled", True):
        offset_minutes = _normalize_reminder_offset(reminder_settings.get("offset_minutes"))
        reminder_at = booking.start_at - timedelta(minutes=offset_minutes)
        patch.update(
            {
                "reminder_status": "pending",
                "reminder_scheduled_at": reminder_at.isoformat(),
                "reminder_offset_minutes": offset_minutes,
            }
        )
    await _mark_booking_invite_status(booking, patch)
    logger.info(
        "calendar.invite_sent",
        extra={
            "conversation_id": conversation_id,
            "booking_id": booking.booking_id,
            "email": email_value,
            "tarjeta_id": tarjeta_id,
        },
    )


async def ensure_booking_invite_sent_for_opportunity(
    *,
    booking_id: str,
    oportunidad_id: str,
) -> None:
    """Intenta enviar el correo de confirmación cuando la cita se registra desde el embudo."""
    booking_key = (booking_id or "").strip()
    if not booking_key:
        return
    try:
        booking_row = await storage.fetch_calendar_booking(booking_key)
    except StorageError as exc:
        logger.warning(
            "calendar.booking_lookup_failed",
            extra={"booking_id": booking_key, "error": str(exc)},
        )
        return
    if not booking_row:
        logger.warning(
            "calendar.booking_missing_for_invite",
            extra={"booking_id": booking_key, "tarjeta_id": oportunidad_id},
        )
        return
    metadata = booking_row.get("metadata")
    if isinstance(metadata, dict) and metadata.get("invite_status") == "sent":
        return
    booking_response = _build_booking_response_from_db_row(booking_row)
    tarjeta_id = booking_response.tarjeta_id or str(booking_row.get("tarjeta_id") or oportunidad_id)
    contact_value = booking_row.get("contact_id")
    conversation_value = booking_row.get("conversacion_id")
    await _send_booking_confirmation_email(
        booking=booking_response,
        contact_id=str(contact_value) if contact_value else None,
        conversation_id=str(conversation_value or "manual"),
        tarjeta_id=tarjeta_id,
        contact=None,
    )


async def _sync_booking_with_opportunity(
    *,
    booking: schemas.CalendarBookingResponse,
    tarjeta_id: str | None,
    contact: dict[str, Any] | None,
    channel: str,
) -> None:
    if not tarjeta_id:
        return
    resolved_contact = contact
    if not resolved_contact or not resolved_contact.get("organizacion_id"):
        try:
            fallback_contact = await storage.fetch_opportunity_contact(
                oportunidad_id=tarjeta_id,
                organizacion_id=str(resolved_contact.get("organizacion_id"))
                if resolved_contact and resolved_contact.get("organizacion_id")
                else None,
            )
        except StorageError as exc:
            logger.warning(
                "calendar.stage_contact_lookup_failed",
                extra={
                    "tarjeta_id": tarjeta_id,
                    "booking_id": booking.booking_id,
                    "error": str(exc),
                },
            )
            return
        if fallback_contact:
            resolved_contact = fallback_contact
            logger.info(
                "calendar.stage_contact_fallback",
                extra={"tarjeta_id": tarjeta_id, "booking_id": booking.booking_id},
            )
    if not resolved_contact:
        return
    organizacion_value = resolved_contact.get("organizacion_id")
    if not organizacion_value:
        return
    organizacion_id = str(organizacion_value)

    try:
        await storage.promote_opportunity_stage(
            oportunidad_id=tarjeta_id,
            organizacion_id=organizacion_id,
            stage_code=DEMO_STAGE_CODE,
            source="calendar_booking",
            channel=channel,
        )
    except StorageError as exc:
        logger.warning(
            "calendar.stage_promotion_failed",
            extra={
                "tarjeta_id": tarjeta_id,
                "booking_id": booking.booking_id,
                "error": str(exc),
            },
        )

    try:
        await storage.record_demo_booking_metadata(
            oportunidad_id=tarjeta_id,
            organizacion_id=organizacion_id,
            scheduled_at=booking.start_at,
            booking_id=booking.booking_id,
        )
    except StorageError as exc:
        logger.warning(
            "calendar.demo_metadata_update_failed",
            extra={
                "tarjeta_id": tarjeta_id,
                "booking_id": booking.booking_id,
                "error": str(exc),
            },
        )


async def _send_booking_cancellation_email(
    *,
    booking: schemas.CalendarBookingResponse,
    contact_id: str | None,
    conversation_id: str,
    reason: str | None,
) -> None:
    if not contact_id:
        return
    contact = await _resolve_contact(contact_id)
    if not contact:
        return
    email_value = str(contact.get("correo") or "").strip()
    if not email_value:
        await _patch_booking_metadata(
            booking,
            {
                "cancel_email_status": "skipped",
                "cancel_email_reason": "missing_contact_email",
                "cancel_email_attempt_at": datetime.now(timezone.utc).isoformat(),
            },
            event="calendar.cancel_email_metadata_failed",
        )
        logger.info(
            "calendar.cancel_email_skipped_missing_email",
            extra={"conversation_id": conversation_id, "booking_id": booking.booking_id},
        )
        return

    timezone_name = booking.timezone or settings.webchat_calendar_timezone
    tz_label = timezone_name.replace("_", " ") if isinstance(timezone_name, str) else "UTC"
    try:
        zone = ZoneInfo(timezone_name)
    except Exception:
        zone = timezone.utc
    start_local = booking.start_at.astimezone(zone)
    date_label = start_local.strftime("%d/%m/%Y")
    time_label = start_local.strftime("%H:%M")

    contact_name = contact.get("nombre_completo")
    greeting = f"Hola {contact_name}," if contact_name else "Hola,"

    body_lines = [
        greeting,
        "",
        "Te confirmo que la demo programada con Tal-IA fue cancelada.",
        f"El horario original era el {date_label} a las {time_label} ({tz_label}).",
    ]
    if reason:
        body_lines.extend(["", f"Motivo registrado: {reason.strip()}."])
    body_lines.extend(
        [
            "",
            "Cuando quieras agendar un nuevo espacio, respóndeme por este medio y te comparto la disponibilidad.",
            "",
            "Tal-IA · Geoactiv",
        ]
    )

    try:
        message_id = await asyncio.to_thread(
            send_email,
            subject="Tal-IA · Demo cancelada",
            body_text="\n".join(body_lines),
            recipients=[email_value],
        )
    except EmailSendError as exc:
        await _patch_booking_metadata(
            booking,
            {
                "cancel_email_status": "failed",
                "cancel_email_error": str(exc),
                "cancel_email_attempt_at": datetime.now(timezone.utc).isoformat(),
            },
            event="calendar.cancel_email_metadata_failed",
        )
        logger.error(
            "calendar.cancel_email_failed",
            extra={
                "conversation_id": conversation_id,
                "booking_id": booking.booking_id,
                "error": str(exc),
            },
        )
        return
    except Exception:  # pragma: no cover - defensivo
        await _patch_booking_metadata(
            booking,
            {
                "cancel_email_status": "failed",
                "cancel_email_error": "unexpected_error",
                "cancel_email_attempt_at": datetime.now(timezone.utc).isoformat(),
            },
            event="calendar.cancel_email_metadata_failed",
        )
        logger.exception(
            "calendar.cancel_email_unexpected",
            extra={"conversation_id": conversation_id, "booking_id": booking.booking_id},
        )
        return

    await _patch_booking_metadata(
        booking,
        {
            "cancel_email_status": "sent",
            "cancel_email_sent_at": datetime.now(timezone.utc).isoformat(),
            "cancel_email_message_id": message_id,
            "cancel_email_to": email_value,
            "cancel_email_reason": reason,
        },
        event="calendar.cancel_email_metadata_failed",
    )


async def get_calendar_availability_response(
    *,
    conversation_id: str | None,
    timezone_preference: str | None,
    start_date: date | None,
    window_days: int | None,
) -> schemas.AvailabilityResponse:
    resource_id = _resolve_calendar_resource_id()
    timezone_value = _resolve_timezone_preference(timezone_preference)
    base_date = start_date or datetime.now(timezone.utc).date()
    days = _normalize_window_days(window_days)
    end_date = base_date + timedelta(days=days - 1)
    try:
        availability_raw = await calendar_service.list_slots(
            resource_id=resource_id,
            start_date=base_date,
            end_date=end_date,
            timezone_hint=timezone_value,
            max_days=days,
        )
    except CalendarError as exc:
        raise ValueError(str(exc)) from exc

    generated_at = _parse_iso_datetime(availability_raw.get("generated_at")) or datetime.now(
        timezone.utc
    )
    window_start = _parse_iso_datetime(availability_raw.get("window_start")) or generated_at
    window_end = _parse_iso_datetime(availability_raw.get("window_end")) or generated_at

    slots_payload: list[schemas.AvailabilitySlot] = []
    for slot in availability_raw.get("slots", []):
        if not slot.get("is_available"):
            continue
        start_dt = _parse_iso_datetime(slot.get("start_at"))
        end_dt = _parse_iso_datetime(slot.get("end_at"))
        slots_payload.append(
            schemas.AvailabilitySlot(
                slot_id=slot.get("slot_id"),
                start_at=start_dt or generated_at,
                end_at=end_dt or generated_at,
                timezone=slot.get("timezone") or timezone_value,
                label=slot.get("local_time"),
                local_date=slot.get("local_date"),
                local_time=slot.get("local_time"),
                weekday=(start_dt.weekday() if start_dt else None),
            )
        )

    return schemas.AvailabilityResponse(
        status="ok",
        conversation_id=conversation_id,
        resource_id=resource_id,
        timezone=timezone_value,
        generated_at=generated_at,
        window_start=window_start,
        window_end=window_end,
        slot_duration_minutes=availability_raw.get("slot_duration_minutes", 0),
        slots=slots_payload,
    )


async def schedule_calendar_booking(
    *,
    conversation_id: str,
    slot_id: str | None,
    start_at: datetime,
    notes: str | None,
    session_id: str | None = None,
) -> schemas.CalendarBookingResponse:
    conversation_meta = await _resolve_conversation_metadata(conversation_id)
    contact_value = conversation_meta.get("contact_id")
    contact_id = str(contact_value) if contact_value else None
    if not contact_id:
        raise ValueError("No fue posible asociar la cita con el contacto de la conversación.")
    raw_channel = conversation_meta.get("channel")
    channel_value = raw_channel.strip().lower() if isinstance(raw_channel, str) else ""
    if not channel_value:
        channel_value = "webchat"
    contact: dict[str, Any] | None = await _resolve_contact(contact_id)
    organizacion_id = _extract_contact_org(contact)
    try:
        tarjeta_id = await _ensure_opportunity_when_contact_ready(
            conversation_id=conversation_id,
            contact_id=contact_id,
            channel=channel_value,
            contact=contact,
        )
    except storage.StorageError as exc:
        logger.exception(
            "calendar.ensure_opportunity_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        raise ValueError("No pude asociar la oportunidad para agendar la demo.") from exc
    resource_id = _resolve_calendar_resource_id()
    hold_minutes = max(1, settings.webchat_calendar_hold_minutes)
    slot_identifier = slot_id or _build_slot_identifier(resource_id, start_at)

    try:
        hold_metadata: dict[str, Any] = {
            "slot_id": slot_identifier,
            "source": channel_value,
            "session_id": session_id,
            "conversation_id": conversation_id,
            "tarjeta_id": tarjeta_id,
            "oportunidad_id": tarjeta_id,
        }
        if organizacion_id:
            hold_metadata["organizacion_id"] = organizacion_id
        hold = await calendar_service.hold_slot(
            resource_id=resource_id,
            slot_start=start_at,
            conversation_id=conversation_id,
            contact_id=contact_id,
            tarjeta_id=tarjeta_id,
            hold_minutes=hold_minutes,
            metadata=hold_metadata,
        )
        booking_metadata: dict[str, Any] = {
            "conversation_id": conversation_id,
            "contact_id": contact_id,
            "session_id": session_id,
            "tarjeta_id": tarjeta_id,
            "channel": channel_value,
        }
        if organizacion_id:
            booking_metadata["organizacion_id"] = organizacion_id
        booking = await calendar_service.confirm_slot(
            hold_id=hold.get("hold_id"),
            notes=notes,
            metadata=booking_metadata,
        )
    except CalendarError as exc:
        raise ValueError(str(exc)) from exc

    booking["hold_id"] = hold.get("hold_id")
    booking_response = _build_booking_response(booking)
    if contact is None:
        contact = await _resolve_contact(contact_id)
    await _sync_booking_with_opportunity(
        booking=booking_response,
        tarjeta_id=tarjeta_id,
        contact=contact,
        channel=channel_value,
    )
    await _send_booking_confirmation_email(
        booking=booking_response,
        contact_id=contact_id,
        conversation_id=conversation_id,
        tarjeta_id=tarjeta_id,
        contact=contact,
    )
    try:
        await webchat_followups.mark_information_delivered(
            conversation_id=conversation_id,
            contact_id=contact_id,
            reason="demo_booking",
        )
    except StorageError as exc:
        logger.warning(
            "webchat.booking.followup_mark_failed",
            extra={"conversation_id": conversation_id, "contact_id": contact_id, "error": str(exc)},
        )
    return booking_response


async def reschedule_calendar_booking(
    *,
    conversation_id: str,
    booking_id: str,
    start_at: datetime,
    notes: str | None = None,
) -> schemas.CalendarBookingResponse:
    conversation_meta = await _resolve_conversation_metadata(conversation_id)
    contact_raw = conversation_meta.get("contact_id") if conversation_meta else None
    contact_id = str(contact_raw) if contact_raw else None
    raw_channel = conversation_meta.get("channel") if conversation_meta else None
    channel_value = raw_channel.strip().lower() if isinstance(raw_channel, str) else ""
    if not channel_value:
        channel_value = "webchat"
    try:
        booking = await calendar_service.reschedule_booking(
            booking_id=booking_id,
            new_slot_start=start_at,
            notes=notes,
            metadata={"conversation_id": conversation_id},
        )
    except CalendarError as exc:
        raise ValueError(str(exc)) from exc
    booking_response = _build_booking_response(booking)
    contact = await _resolve_contact(contact_id)
    await _sync_booking_with_opportunity(
        booking=booking_response,
        tarjeta_id=booking_response.tarjeta_id,
        contact=contact,
        channel=channel_value,
    )
    await _send_booking_confirmation_email(
        booking=booking_response,
        contact_id=contact_id,
        conversation_id=conversation_id,
        tarjeta_id=booking_response.tarjeta_id,
        contact=contact,
    )
    return booking_response


async def cancel_calendar_booking(
    *,
    conversation_id: str,
    booking_id: str,
    reason: str | None = None,
) -> schemas.CalendarBookingResponse:
    conversation_meta = await _resolve_conversation_metadata(conversation_id)
    contact_raw = conversation_meta.get("contact_id") if conversation_meta else None
    contact_id = str(contact_raw) if contact_raw else None
    try:
        booking = await calendar_service.cancel_booking(
            booking_id=booking_id,
            reason=reason,
        )
    except CalendarError as exc:
        raise ValueError(str(exc)) from exc
    booking_response = _build_booking_response(booking)
    await _send_booking_cancellation_email(
        booking=booking_response,
        contact_id=contact_id,
        conversation_id=conversation_id,
        reason=reason,
    )
    return booking_response


@dataclass(slots=True)
class WebchatContext:
    """Contexto mínimo necesario para resolver function calls."""

    conversation_id: str
    contact_id: str
    session_id: str


def _extract_client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        for chunk in forwarded.split(","):
            candidate = chunk.strip()
            if candidate:
                return candidate
    client = request.client
    return client.host if client else None


def _normalise_device_type(value: Any) -> str | None:
    if not value:
        return None
    text = str(value).strip().lower()
    if text in {"mobile", "tablet", "desktop", "laptop", "phone"}:
        if text == "laptop":
            return "desktop"
        if text == "phone":
            return "mobile"
        return text
    return None


def _classify_device_type(user_agent: str | None, client_meta: dict[str, Any]) -> str | None:
    device = _normalise_device_type(client_meta.get("device_type"))
    if device:
        return device
    ua = (client_meta.get("user_agent") or user_agent or "").lower()
    if not ua:
        return None
    if "mobile" in ua or "iphone" in ua or "ipod" in ua or "windows phone" in ua:
        return "mobile"
    if "ipad" in ua or "tablet" in ua:
        return "tablet"
    if "android" in ua:
        if "mobile" in ua:
            return "mobile"
        return "tablet"
    return "desktop"


def _safe_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return parsed
    return {}


def _extract_text_from_response(payload: dict[str, Any]) -> str | None:
    """Compone la respuesta textual desde el payload de Responses API."""
    fragments: list[str] = []
    for item in payload.get("output") or []:
        if item.get("type") != "message":
            continue
        for content in item.get("content") or []:
            if content.get("type") == "output_text":
                text = content.get("text")
                if text:
                    fragments.append(str(text))
    if fragments:
        return "\n".join(fragment.strip() for fragment in fragments if fragment)
    if payload.get("status") == "requires_action":
        logger.warning("webchat.tool_call_unhandled", extra={"output": payload.get("output")})
    return None


async def _resolve_contact(contact_id: str | None) -> dict[str, Any] | None:
    if not contact_id:
        return None
    try:
        return await storage.fetch_contact(contact_id)
    except StorageError as exc:
        logger.warning(
            "webchat.contact_lookup_failed",
            extra={"contact_id": contact_id, "error": str(exc)},
        )
        return None


def _extract_contact_email(contact: dict[str, Any] | None) -> str | None:
    if not contact:
        return None
    value = contact.get("correo")
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


def _extract_contact_org(contact: dict[str, Any] | None) -> str | None:
    if not contact:
        return None
    value = contact.get("organizacion_id")
    if not value:
        return None
    try:
        text = str(value).strip()
    except Exception:
        return None
    return text or None


def _safe_str_value(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    try:
        return str(value).strip() or None
    except Exception:
        return None


def _normalized_alias_map() -> dict[str, str]:
    configured = getattr(settings, "webchat_tenant_alias_map", {}) or {}
    normalized: dict[str, str] = {}
    for alias, org in configured.items():
        alias_key = _safe_str_value(alias)
        org_value = _safe_str_value(org)
        if alias_key and org_value:
            normalized[alias_key.lower()] = org_value
    default_org = _safe_str_value(settings.webchat_default_organizacion_id)
    default_alias = _safe_str_value(settings.webchat_default_tenant_alias)
    if not default_alias and default_org:
        default_alias = "default"
    if default_alias and default_org and default_alias.lower() not in normalized:
        normalized[default_alias.lower()] = default_org
    return normalized


def get_webchat_tenant_alias() -> str | None:
    """Alias que debe exponerse al widget del sitio."""
    explicit_alias = _safe_str_value(settings.webchat_default_tenant_alias)
    alias_map = _normalized_alias_map()
    if explicit_alias and explicit_alias.lower() in alias_map:
        return explicit_alias
    if alias_map:
        # Devuelve el primer alias disponible para no dejar al widget sin contexto.
        return next(iter(alias_map.keys()))
    return None


def _resolve_org_uuid(value: str | None) -> str | None:
    if not value:
        return None
    candidate = value.strip()
    if not candidate:
        return None
    try:
        return str(UUID(candidate))
    except ValueError:
        pass
    alias_map = _normalized_alias_map()
    mapped = alias_map.get(candidate.lower())
    if mapped:
        try:
            return str(UUID(mapped))
        except ValueError:
            pass
    default_org = _safe_str_value(settings.webchat_default_organizacion_id)
    if default_org:
        try:
            return str(UUID(default_org))
        except ValueError:
            pass
    return None


def _extract_metadata_alias(metadata: dict[str, Any] | None) -> str | None:
    if not isinstance(metadata, dict):
        return None
    alias = metadata.get("tenant_alias") or metadata.get("tenantAlias")
    alias_value = _safe_str_value(alias)
    if alias_value:
        return alias_value
    extra = metadata.get("extra")
    if isinstance(extra, dict):
        extra_alias = extra.get("tenant_alias") or extra.get("tenantAlias")
        return _safe_str_value(extra_alias)
    return None


def _extract_metadata_organizacion(metadata: dict[str, Any] | None) -> str | None:
    if not isinstance(metadata, dict):
        return None
    candidate = metadata.get("organizacion_id") or metadata.get("organizacionId")
    value = _safe_str_value(candidate)
    if value:
        return value
    extra = metadata.get("extra")
    if isinstance(extra, dict):
        extra_value = extra.get("organizacion_id") or extra.get("organizacionId")
        return _safe_str_value(extra_value)
    return None


def _resolve_alias_to_org(alias: str | None) -> str | None:
    alias_key = _safe_str_value(alias)
    if not alias_key:
        return None
    alias_map = _normalized_alias_map()
    return alias_map.get(alias_key.lower())


def resolve_webchat_organizacion(
    metadata: dict[str, Any] | None,
    contact: dict[str, Any] | None = None,
) -> str | None:
    """Determina el organizacion_id para eventos del webchat."""
    contact_org = _extract_contact_org(contact)
    if contact_org:
        return contact_org
    metadata_org = _extract_metadata_organizacion(metadata)
    if metadata_org:
        return metadata_org
    alias_value = _extract_metadata_alias(metadata)
    alias_org = _resolve_alias_to_org(alias_value)
    if alias_org:
        return alias_org
    fallback_alias = get_webchat_tenant_alias()
    alias_org = _resolve_alias_to_org(fallback_alias)
    if alias_org:
        return alias_org
    return _safe_str_value(settings.webchat_default_organizacion_id)


def _guess_extension(name: str | None, url: str | None) -> str:
    candidates: list[str] = []
    if name:
        candidates.append(Path(name).suffix.lower())
    if url:
        parsed = urlparse(url)
        candidates.append(Path(parsed.path).suffix.lower())
    for candidate in candidates:
        if candidate:
            return candidate
    return ""


def _is_image_mime(mime: str | None, *, extension: str) -> bool:
    if not mime and extension:
        return extension in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff"}
    return bool(mime and mime.startswith("image/"))


def _is_text_attachment(mime: str | None, *, extension: str) -> bool:
    if mime:
        if mime.startswith(TEXT_MIME_PREFIXES):
            return True
        if mime in TEXT_MIME_WHITELIST:
            return True
    if extension in TEXT_EXTENSION_WHITELIST:
        return True
    return False


def _derive_filename(name: str | None, url: str | None) -> str:
    if name:
        return Path(name).name
    if url:
        parsed = urlparse(url)
        candidate = Path(parsed.path).name
        if candidate:
            return candidate
    return "adjunto"


def _trim_text_payload(text: str, limit: int) -> tuple[str, bool]:
    if len(text) <= limit:
        return text, False
    return text[:limit], True


async def _prepare_user_content_with_attachments(
    client: AsyncOpenAI,
    user_message: schemas.MessageRequest,
) -> list[dict[str, Any]]:
    """Construye el payload `content` considerando adjuntos compatibles."""

    content_items: list[dict[str, Any]] = [
        {
            "type": "input_text",
            "text": user_message.content,
        }
    ]
    attachments = user_message.attachments or []
    if not attachments:
        return content_items

    processed = 0
    warnings: list[str] = []
    http_client: httpx.AsyncClient | None = None

    async def _ensure_http_client() -> httpx.AsyncClient:
        nonlocal http_client
        if http_client is None:
            http_client = httpx.AsyncClient(timeout=10.0, follow_redirects=True)
        return http_client

    try:
        for attachment in attachments:
            if processed >= MAX_ATTACHMENTS_PER_MESSAGE:
                warnings.append(
                    f"Se ignoraron adjuntos extra; límite {MAX_ATTACHMENTS_PER_MESSAGE} por mensaje."
                )
                break
            url = attachment.url
            if not url:
                warnings.append("Se omitió un adjunto sin URL accesible.")
                continue
            name = _derive_filename(attachment.name, url)
            size_hint = attachment.size
            if size_hint and size_hint > MAX_ATTACHMENT_BYTES:
                warnings.append(
                    f"El archivo {name} supera el límite permitido de {MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB."
                )
                continue

            mime = attachment.mime.lower() if attachment.mime else None
            extension = _guess_extension(attachment.name, attachment.url)

            data_bytes: bytes | None = None
            try:
                client_http = await _ensure_http_client()
                response = await client_http.get(url)
                response.raise_for_status()
                data_bytes = response.content
            except Exception as exc:  # pragma: no cover - dependiente de red
                logger.warning(
                    "webchat.attachment_download_failed",
                    extra={"url": url, "error": str(exc)},
                )
                warnings.append(f"No se pudo descargar {name}.")
                continue

            if len(data_bytes) > MAX_ATTACHMENT_BYTES:
                warnings.append(
                    f"El archivo {name} supera el límite permitido de {MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB."
                )
                continue

            if _is_image_mime(mime, extension=extension):
                content_items.append(
                    {
                        "type": "input_image",
                        "image_url": url,
                    }
                )
                processed += 1
                continue

            if extension == ".docx":
                try:
                    doc_text = _extract_docx_text(data_bytes)
                except Exception as exc:  # pragma: no cover - archivos corruptos
                    logger.warning(
                        "webchat.attachment_docx_parse_failed",
                        extra={"name": name, "error": str(exc)},
                    )
                    warnings.append(f"No pude leer {name} (DOCX).")
                    continue
                trimmed_text, truncated = _trim_text_payload(doc_text, MAX_TEXT_ATTACHMENT_CHARS)
                if truncated:
                    trimmed_text += f"\n\n[Nota interna: contenido truncado a {MAX_TEXT_ATTACHMENT_CHARS} caracteres.]"
                content_items.append(
                    {
                        "type": "input_text",
                        "text": f"Contenido de {name} (extraído de DOCX):\n{trimmed_text}",
                    }
                )
                processed += 1
                continue

            if extension in {".xlsx", ".xlsm"}:
                try:
                    sheet_text = _extract_xlsx_text(data_bytes)
                except Exception as exc:  # pragma: no cover - archivos corruptos
                    logger.warning(
                        "webchat.attachment_xlsx_parse_failed",
                        extra={"name": name, "error": str(exc)},
                    )
                    warnings.append(f"No pude leer {name} (XLSX).")
                    continue
                trimmed_text, truncated = _trim_text_payload(sheet_text, MAX_TEXT_ATTACHMENT_CHARS)
                if truncated:
                    trimmed_text += f"\n\n[Nota interna: contenido truncado a {MAX_TEXT_ATTACHMENT_CHARS} caracteres.]"
                content_items.append(
                    {
                        "type": "input_text",
                        "text": f"Contenido de {name} (extraído de Excel):\n{trimmed_text}",
                    }
                )
                processed += 1
                continue

            if _is_text_attachment(mime, extension=extension):
                encoding = "utf-8"
                try:
                    text_content = data_bytes.decode(encoding)
                except UnicodeDecodeError:
                    text_content = data_bytes.decode("utf-8", errors="replace")
                trimmed_text, truncated = _trim_text_payload(
                    text_content, MAX_TEXT_ATTACHMENT_CHARS
                )
                if truncated:
                    trimmed_text += f"\n\n[Nota interna: contenido truncado a {MAX_TEXT_ATTACHMENT_CHARS} caracteres.]"
                content_items.append(
                    {
                        "type": "input_text",
                        "text": f"Contenido de {name}:\n{trimmed_text}",
                    }
                )
                processed += 1
                continue

            # Fallback: subir archivo a OpenAI y referenciarlo como input_file
            file_tuple = (
                name,
                io.BytesIO(data_bytes),
                mime or "application/octet-stream",
            )
            try:
                upload = await client.files.create(file=file_tuple, purpose="assistants")
            except Exception as exc:  # pragma: no cover - dependiente de API
                logger.warning(
                    "webchat.attachment_upload_failed",
                    extra={"name": name, "error": str(exc)},
                )
                warnings.append(f"No se pudo compartir {name} con el asistente.")
                continue

            content_items.append(
                {
                    "type": "input_file",
                    "file_id": upload.id,
                }
            )
            processed += 1
    finally:
        if http_client:
            await http_client.aclose()

    if warnings:
        content_items.append(
            {
                "type": "input_text",
                "text": (
                    "Nota interna: Algunos adjuntos no pudieron procesarse. "
                    + " ".join(warnings)
                    + " Pide al visitante que los reenvíe en otro formato."
                ),
            }
        )

    return content_items


async def _maybe_enrich_contact_metadata(
    contact_id: str,
    *,
    client_context: dict[str, Any],
    device_type: str | None,
    geo_ip_data: dict[str, Any] | None,
    estado_clave: str | None,
    estado_nombre: str | None,
    municipio_clave: str | None,
    municipio_nombre: str | None,
    cvegeo: str | None,
    referrer: str | None,
    landing_url: str | None,
    contact: dict[str, Any] | None = None,
) -> None:
    if contact is None:
        try:
            contact = await storage.fetch_contact(contact_id)
        except storage.StorageError as exc:
            logger.exception(
                "webchat.contact_fetch_failed",
                extra={"contact_id": contact_id, "error": str(exc)},
            )
            return

    contacto_datos = _safe_dict(contact.get("contacto_datos"))
    if contacto_datos:
        try:
            updated_data = json.loads(json.dumps(contacto_datos))
        except (TypeError, ValueError):
            updated_data = dict(contacto_datos)
    else:
        updated_data = {}

    ubicacion_actual = _safe_dict(updated_data.get("ubicacion"))
    ubicacion_nueva = dict(ubicacion_actual)

    def _set_if(value: Any, key: str) -> None:
        if value is not None and value != "":
            formatted = str(value)
            if ubicacion_nueva.get(key) != formatted:
                ubicacion_nueva[key] = formatted

    _set_if(estado_clave, "cve_ent")
    _set_if(estado_nombre, "nom_ent")
    _set_if(municipio_clave, "cve_mun")
    _set_if(municipio_nombre, "nom_mun")
    _set_if(cvegeo, "cvegeo")

    if geo_ip_data:
        if geo_ip_data.get("latitude") is not None:
            ubicacion_nueva.setdefault("lat", geo_ip_data.get("latitude"))
        if geo_ip_data.get("longitude") is not None:
            ubicacion_nueva.setdefault("lng", geo_ip_data.get("longitude"))
        if geo_ip_data.get("timezone"):
            ubicacion_nueva.setdefault("timezone", geo_ip_data.get("timezone"))

    if ubicacion_nueva != ubicacion_actual and any(ubicacion_nueva.values()):
        updated_data["ubicacion"] = ubicacion_nueva

    dispositivo_actual = _safe_dict(updated_data.get("dispositivo"))
    dispositivo_nuevo = dict(dispositivo_actual)
    user_agent = (
        client_context.get("user_agent")
        if isinstance(client_context.get("user_agent"), str)
        else None
    )
    platform = (
        client_context.get("platform") if isinstance(client_context.get("platform"), str) else None
    )
    timezone = (
        client_context.get("timezone") if isinstance(client_context.get("timezone"), str) else None
    )
    language = (
        client_context.get("language") if isinstance(client_context.get("language"), str) else None
    )
    screen_info = _safe_dict(client_context.get("screen"))

    device_type_norm = _normalise_device_type(device_type)
    if device_type_norm and dispositivo_nuevo.get("tipo") != device_type_norm:
        dispositivo_nuevo["tipo"] = device_type_norm
    if user_agent and dispositivo_nuevo.get("user_agent") != user_agent:
        dispositivo_nuevo["user_agent"] = user_agent
    if platform and dispositivo_nuevo.get("plataforma") != platform:
        dispositivo_nuevo["plataforma"] = platform
    if timezone and dispositivo_nuevo.get("timezone") != timezone:
        dispositivo_nuevo["timezone"] = timezone
    if language and dispositivo_nuevo.get("idioma") != language:
        dispositivo_nuevo["idioma"] = language
    if screen_info:
        dispositivo_nuevo.setdefault("pantalla", {})
        for key, value in screen_info.items():
            if dispositivo_nuevo["pantalla"].get(key) != value:
                dispositivo_nuevo["pantalla"][key] = value
        if not dispositivo_nuevo["pantalla"]:
            dispositivo_nuevo.pop("pantalla", None)

    prefers_dark = client_context.get("prefers_dark_mode")
    if prefers_dark is not None and dispositivo_nuevo.get("prefiere_modo_oscuro") != prefers_dark:
        dispositivo_nuevo["prefiere_modo_oscuro"] = bool(prefers_dark)

    if dispositivo_nuevo != dispositivo_actual and dispositivo_nuevo:
        updated_data["dispositivo"] = dispositivo_nuevo

    trazabilidad_actual = _safe_dict(updated_data.get("trazabilidad"))
    trazabilidad_nueva = dict(trazabilidad_actual)
    if referrer and trazabilidad_nueva.get("referrer") != referrer:
        trazabilidad_nueva["referrer"] = referrer
    if landing_url and trazabilidad_nueva.get("landing") != landing_url:
        trazabilidad_nueva["landing"] = landing_url
    if trazabilidad_nueva != trazabilidad_actual and trazabilidad_nueva:
        updated_data["trazabilidad"] = trazabilidad_nueva

    if updated_data == contacto_datos:
        return

    try:
        await storage.update_contact(contact_id, {"contacto_datos": updated_data})
    except storage.StorageError as exc:
        logger.exception(
            "webchat.contact_update_failed",
            extra={"contact_id": contact_id, "error": str(exc)},
        )


async def _register_webchat_visit(
    session_id: str,
    *,
    request: Request | None,
    metadata: dict[str, Any] | None,
    contact_id_hint: str | None = None,
    contact: dict[str, Any] | None = None,
) -> str | None:
    """Registra la visita para métricas y enriquece metadatos del contacto."""
    client_meta = _safe_dict(metadata)
    client_context = _safe_dict(client_meta.get("client"))

    client_ip = _extract_client_ip(request)
    user_agent_header = request.headers.get("user-agent") if request else None
    device_type = _classify_device_type(user_agent_header, client_context)

    geo_ip_data: dict[str, Any] | None = None
    if client_ip:
        try:
            geo_ip_data = await geolocation.lookup_ip(client_ip)
        except Exception:  # pragma: no cover - best effort
            logger.exception(
                "webchat.geo_lookup_failed",
                extra={"session_id": session_id},
            )
            geo_ip_data = None

    client_geo = _safe_dict(client_context.get("geo"))
    geo_source: dict[str, Any] = {}
    if geo_ip_data:
        country_ip = geo_ip_data.get("country")
        if country_ip:
            geo_source["country"] = str(country_ip).upper()
        region_ip = geo_ip_data.get("region")
        if region_ip:
            geo_source["region"] = region_ip
            geo_source.setdefault("state", region_ip)
        city_ip = geo_ip_data.get("city")
        if city_ip:
            geo_source["city"] = city_ip
    if client_geo:
        country_client = client_geo.get("country_code") or client_geo.get("country")
        if country_client:
            geo_source["country"] = str(country_client).upper()
        for key in ("region", "state", "nom_ent", "city", "nom_mun"):
            value = client_geo.get(key)
            if value:
                geo_source[key] = value

    estado_clave: str | None
    estado_nombre: str | None
    municipio_clave: str | None
    municipio_nombre: str | None
    cvegeo: str | None
    estado_clave, estado_nombre, municipio_clave, municipio_nombre, cvegeo = (
        leads_geo.location_from_geo_metadata(geo_source or None)
    )

    visitor_geo_payload: dict[str, Any] = {}
    if geo_ip_data:
        visitor_geo_payload["ip_lookup"] = geo_ip_data
    if client_geo:
        visitor_geo_payload["client"] = client_geo
    if estado_nombre:
        visitor_geo_payload.setdefault("nom_ent", estado_nombre)
    if municipio_nombre:
        visitor_geo_payload.setdefault("nom_mun", municipio_nombre)

    referrer = (
        client_context.get("referrer") if isinstance(client_context.get("referrer"), str) else None
    )
    landing_url = (
        client_context.get("location_href")
        if isinstance(client_context.get("location_href"), str)
        else None
    )

    visit_logger.info(
        "visit.metadata_resolved",
        extra={
            "session_id": session_id,
            "visit": {
                "ip": client_ip,
                "device_type": device_type,
                "resolved_location": {
                    "cve_ent": estado_clave,
                    "nom_ent": estado_nombre,
                    "cve_mun": municipio_clave,
                    "nom_mun": municipio_nombre,
                    "cvegeo": cvegeo,
                },
                "referrer": referrer,
                "landing_url": landing_url,
                "geo_ip": geo_ip_data,
                "geo_client": client_geo,
                "client_context": client_context,
            },
        },
    )

    contact_id = str(contact_id_hint) if contact_id_hint else None
    if not contact_id:
        try:
            contact_id = await storage.get_webchat_contact_id(session_id)
        except storage.StorageError as exc:
            logger.exception(
                "webchat.resolve_contact_failed",
                extra={"session_id": session_id, "error": str(exc)},
            )
            contact_id = None
    resolved_contact = contact
    if contact_id and (
        not resolved_contact
        or _safe_str_value(resolved_contact.get("id")) != _safe_str_value(contact_id)
    ):
        resolved_contact = await _resolve_contact(contact_id)

    try:
        await storage.record_webchat_visit(
            session_id,
            ip=client_ip,
            device_type=device_type,
            geo=visitor_geo_payload or None,
            cve_ent=estado_clave,
            nom_ent=estado_nombre,
            cve_mun=municipio_clave,
            nom_mun=municipio_nombre,
            cvegeo=cvegeo,
            referrer=referrer,
            landing_url=landing_url,
            organizacion_id=resolve_webchat_organizacion(
                client_meta,
                contact=resolved_contact,
            ),
        )
    except storage.StorageError as exc:
        logger.exception(
            "webchat.record_visit_failed",
            extra={"session_id": session_id, "error": str(exc)},
        )

    if contact_id:
        try:
            await _maybe_enrich_contact_metadata(
                contact_id,
                client_context=client_context,
                device_type=device_type,
                geo_ip_data=geo_ip_data,
                estado_clave=estado_clave,
                estado_nombre=estado_nombre,
                municipio_clave=municipio_clave,
                municipio_nombre=municipio_nombre,
                cvegeo=cvegeo,
                referrer=referrer,
                landing_url=landing_url,
                contact=resolved_contact,
            )
        except Exception:  # pragma: no cover - best effort
            logger.exception(
                "webchat.contact_enrich_failed",
                extra={"contact_id": contact_id},
            )

    return contact_id


async def register_visit(
    session_id: str,
    *,
    metadata: dict[str, Any] | None,
    request: Request | None,
) -> str | None:
    """Endpoint público para registrar la visita aunque no haya mensajes."""
    return await _register_webchat_visit(
        session_id,
        request=request,
        metadata=metadata,
    )


async def handle_message(
    payload: schemas.MessageRequest,
    *,
    request: Request | None = None,
) -> schemas.MessageResponse:
    """Orquesta la recepción de un mensaje y delega en OpenAI/Supabase."""
    if payload.author != "user":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sólo se aceptan mensajes de usuario desde el widget.",
        )

    metadata_dict = payload.metadata if isinstance(payload.metadata, dict) else None
    attachments_payload = payload.attachments or []
    organizacion_hint = resolve_webchat_organizacion(metadata_dict)

    try:
        registration = await storage.register_webchat_message(
            session_id=payload.session_id,
            author="user",
            content=payload.content,
            inactivity_hours=settings.webchat_inactivity_hours,
            metadata={
                "client_message_id": payload.client_message_id,
                "locale": payload.locale,
                "fresh_load": payload.fresh_load,
                "extra": payload.metadata or {},
            },
            attachments=[attachment.model_dump(mode="json") for attachment in attachments_payload],
            organizacion_id=organizacion_hint,
        )
    except storage.StorageError as exc:
        logger.exception(
            "webchat.register_failed",
            extra={"session_id": payload.session_id, "error": str(exc)},
        )
        raise HTTPException(status_code=502, detail="No fue posible registrar el mensaje") from exc

    conversation_id = registration.get("conversation_id")
    if not conversation_id:
        raise HTTPException(status_code=500, detail="No se pudo identificar la conversación")

    try:
        conversation_meta = await storage.fetch_webchat_conversation(conversation_id)
    except storage.StorageError as exc:
        logger.exception(
            "webchat.conversation_lookup_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        raise HTTPException(status_code=500, detail="No se pudo recuperar la conversación") from exc

    openai_conversation_id = registration.get("openai_conversation_id") or conversation_meta.get(
        "openai_conversation_id"
    )
    manual_mode = bool(conversation_meta.get("manual_override"))
    metadata = schemas.MessageMetadata(
        conversation_id=str(conversation_id),
        openai_conversation_id=openai_conversation_id,
        previous_response_id=conversation_meta.get("last_response_id"),
        client_message_id=payload.client_message_id,
        manual_mode=manual_mode,
    )
    attachments_models = [
        schemas.Attachment(
            id=None,
            url=attachment.url,
            mime=attachment.mime,
            size=attachment.size,
            name=attachment.name,
            provider_id=attachment.provider_id,
            path=attachment.path,
        )
        for attachment in attachments_payload
    ]

    if manual_mode:
        log_event(
            logger,
            "webchat.manual_mode",
            conversation_id=str(conversation_id),
            session_id=payload.session_id,
        )
        return schemas.MessageResponse(
            reply=None,
            metadata=metadata,
            attachments=attachments_models or None,
        )

    contact_id = conversation_meta.get("contact_id")
    if not contact_id:
        raise HTTPException(
            status_code=500, detail="No se pudo asociar la conversación al contacto"
        )
    contact: dict[str, Any] | None = await _resolve_contact(str(contact_id))
    resolved_organizacion_id = (
        resolve_webchat_organizacion(metadata_dict, contact=contact) or organizacion_hint
    )

    contact_id_value = await _register_webchat_visit(
        payload.session_id,
        request=request,
        metadata=metadata_dict,
        contact_id_hint=str(contact_id),
        contact=contact,
    )
    contact_id = contact_id_value or str(contact_id)

    assistant: AssistantConfig
    try:
        assistant = registry.resolve_assistant("landing")
    except ValueError as exc:  # pragma: no cover - configuración inválida
        logger.exception("webchat.assistant_resolve_failed", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail="Asistente no configurado") from exc

    client = openai_service.get_assistant_client()
    assistant_spec: AssistantSpec | None = None
    if assistant.is_prompt:
        if not assistant.prompt_id:
            raise HTTPException(status_code=500, detail="No se configuró el prompt de OpenAI")
    else:
        if not assistant.assistant_id:
            raise HTTPException(status_code=500, detail="No se configuró el asistente de OpenAI")
        try:
            assistant_spec = await resolve_assistant_spec(client, assistant.assistant_id)
        except Exception as exc:  # pragma: no cover - configuración remota inválida
            logger.exception("webchat.assistant_spec_failed", extra={"error": str(exc)})
            raise HTTPException(
                status_code=500, detail="No se pudo cargar la configuración del asistente"
            ) from exc
    context = WebchatContext(
        conversation_id=str(conversation_id),
        contact_id=str(contact_id),
        session_id=payload.session_id,
    )

    catalog_context = await build_catalog_context(
        organizacion_hint,
        payload.content or "",
        user_id=context.contact_id,
        channel="webchat",
    )
    try:
        (
            assistant_reply,
            response_payload,
            tools_called,
            tool_call_ids,
            resolved_openai_conversation,
            side_effects,
        ) = await _run_assistant_turn(
            client=client,
            assistant=assistant,
            assistant_spec=assistant_spec,
            context=context,
            user_message=payload,
            openai_conversation_id=openai_conversation_id,
            previous_response_id=conversation_meta.get("last_response_id"),
            organizacion_id=organizacion_hint,
            catalog_context=catalog_context,
        )
    except Exception as exc:  # pragma: no cover - se registra y responde fallback
        logger.exception(
            "webchat.assistant_turn_failed",
            extra={"conversation_id": str(conversation_id), "error": str(exc)},
        )
        return schemas.MessageResponse(
            reply=DEFAULT_FALLBACK,
            metadata=metadata,
        )

    metadata.openai_conversation_id = (
        resolved_openai_conversation or metadata.openai_conversation_id
    )
    metadata.assistant_response_id = (
        response_payload.get("id") if isinstance(response_payload, dict) else None
    )
    metadata.tools_called = tools_called or None
    metadata.tool_call_ids = tool_call_ids or None
    if side_effects.get("availability"):
        metadata.availability = side_effects["availability"]
    if side_effects.get("booking"):
        metadata.booking = side_effects["booking"]

    if assistant_reply:
        try:
            message_metadata = {
                "openai_conversation_id": metadata.openai_conversation_id,
                "tools_called": tools_called,
                "tool_call_ids": tool_call_ids,
            }
            if side_effects:
                for key, value in side_effects.items():
                    if value is not None:
                        message_metadata[key] = value
            await storage.register_webchat_message(
                session_id=payload.session_id,
                author="assistant",
                content=assistant_reply,
                response_id=metadata.assistant_response_id,
                inactivity_hours=settings.webchat_inactivity_hours,
                metadata=message_metadata,
                organizacion_id=resolved_organizacion_id,
            )
        except storage.StorageError as exc:
            logger.exception(
                "webchat.register_assistant_failed",
                extra={
                    "conversation_id": str(conversation_id),
                    "response_id": metadata.assistant_response_id,
                    "error": str(exc),
                },
            )

    return schemas.MessageResponse(
        reply=assistant_reply,
        metadata=metadata,
        attachments=attachments_models or None,
    )


async def append_manual_agent_context(
    *,
    conversation_meta: dict[str, Any],
    session_id: str,
    content: str,
    locale: str | None = None,
) -> None:
    """Agrega una nota del agente humano al contexto del asistente sin generar respuesta."""
    if not content:
        return

    conversation_id = conversation_meta.get("id")
    contact_id = conversation_meta.get("contact_id")
    if not conversation_id or not contact_id:
        return

    openai_conversation_id = conversation_meta.get("openai_conversation_id")
    previous_response_id = conversation_meta.get("last_response_id")

    try:
        assistant = registry.resolve_assistant("landing")
    except ValueError as exc:  # pragma: no cover - configuración inválida
        logger.exception("webchat.manual_context.assistant_unavailable", extra={"error": str(exc)})
        return

    client = openai_service.get_assistant_client()
    assistant_spec: AssistantSpec | None = None
    if not assistant.is_prompt:
        if not assistant.assistant_id:
            logger.warning("webchat.manual_context.missing_assistant_id")
            return
        try:
            assistant_spec = await resolve_assistant_spec(client, assistant.assistant_id)
        except Exception as exc:  # pragma: no cover - configuración remota inválida
            logger.exception("webchat.manual_context.resolve_failed", extra={"error": str(exc)})
            return

    context = WebchatContext(
        conversation_id=str(conversation_id),
        contact_id=str(contact_id),
        session_id=session_id,
    )

    manual_text_parts = [
        "Nota del agente humano:",
        content,
        "",
        "El asistente no debe responder a esta nota; únicamente utilízala como contexto en turnos futuros.",
    ]
    manual_text = "\n".join(part for part in manual_text_parts if part is not None)

    request_kwargs: dict[str, Any] = {
        "input": [
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": manual_text,
                    }
                ],
            }
        ],
        "store": True,
        "metadata": {
            "source": "panel_manual",
            "skip_user_delivery": "true",
        },
    }
    if locale:
        request_kwargs["metadata"]["locale"] = locale

    if openai_conversation_id:
        request_kwargs["conversation"] = openai_conversation_id
    elif previous_response_id:
        request_kwargs["previous_response_id"] = previous_response_id

    if assistant.is_prompt:
        try:
            request_kwargs["prompt"] = _build_prompt_payload(assistant, context)
        except ValueError as exc:
            logger.exception(
                "webchat.manual_context.prompt_payload_failed", extra={"error": str(exc)}
            )
            return
        request_kwargs["text"] = {"format": {"type": "text"}}
    else:
        if not assistant_spec:
            return
        request_kwargs["model"] = assistant_spec.model
        instructions = assistant_spec.instructions or ""
        note = (
            "Nota interna: si recibes un mensaje marcado como nota del agente humano, "
            "no generes una respuesta para el visitante; únicamente incorpora el contenido al contexto."
        )
        request_kwargs["instructions"] = f"{instructions}\n\n{note}".strip()
        if assistant_spec.tools:
            request_kwargs["tools"] = assistant_spec.tools

    try:
        await client.responses.create(**request_kwargs)
    except Exception as exc:  # pragma: no cover - errores de OpenAI
        logger.exception(
            "webchat.manual_context.append_failed",
            extra={
                "conversation_id": str(conversation_id),
                "session_id": session_id,
                "error": str(exc),
            },
        )
    else:
        logger.info(
            "webchat.manual_context.appended",
            extra={
                "conversation_id": str(conversation_id),
                "session_id": session_id,
            },
        )


async def fetch_history(session_id: str, limit: int) -> schemas.HistoryResponse:
    """Devuelve mensajes recientes asociados al session_id del widget."""
    try:
        conversation = await storage.resolve_webchat_conversation_from_session(session_id)
    except storage.StorageError as exc:
        logger.exception("webchat.history_resolve_failed", extra={"session_id": session_id})
        raise HTTPException(
            status_code=500, detail="No fue posible consultar la conversación"
        ) from exc

    if not conversation:
        return schemas.HistoryResponse(conversation_id=None, messages=[], manual_mode=False)

    try:
        rows = await storage.fetch_recent_messages(
            conversation_id=str(conversation["id"]),
            limit=limit,
        )
    except storage.StorageError as exc:
        logger.exception(
            "webchat.history_fetch_failed",
            extra={"conversation_id": conversation.get("id"), "error": str(exc)},
        )
        raise HTTPException(
            status_code=500, detail="No fue posible recuperar el historial"
        ) from exc

    messages: list[schemas.HistoryMessage] = []
    for row in rows:
        raw_metadata = row.get("datos")
        metadata: dict[str, Any] | None = None
        if isinstance(raw_metadata, dict):
            metadata = raw_metadata
        elif isinstance(raw_metadata, str) and raw_metadata:
            try:
                metadata = json.loads(raw_metadata)
            except json.JSONDecodeError:
                metadata = None

        raw_attachments = row.get("attachments") or row.get("adjuntos")
        attachments: list[schemas.Attachment] = []

        candidate_sources: list[Any] = []
        if raw_attachments is not None:
            candidate_sources.append(raw_attachments)
        if metadata and isinstance(metadata.get("attachments"), list):
            candidate_sources.append(metadata.get("attachments"))

        for source in candidate_sources:
            if not isinstance(source, list):
                continue
            for item in source:
                if not isinstance(item, dict):
                    continue
                size_value = item.get("size")
                size_int: int | None = None
                if isinstance(size_value, (int, float)):
                    size_int = int(size_value)
                elif isinstance(size_value, str):
                    try:
                        size_int = int(size_value)
                    except ValueError:
                        size_int = None
                url_value = item.get("url")
                if not url_value:
                    continue
                attachments.append(
                    schemas.Attachment(
                        id=str(item.get("id")) if item.get("id") else None,
                        url=str(url_value),
                        mime=item.get("mime"),
                        size=size_int,
                        name=item.get("name"),
                        provider_id=item.get("provider_id"),
                        path=item.get("path"),
                    )
                )

        messages.append(
            schemas.HistoryMessage(
                id=str(row.get("id")),
                direction=str(row.get("direccion") or "entrante"),
                content=row.get("texto") or "",
                created_at=row.get("creado_en"),
                metadata=metadata,
                attachments=attachments,
            )
        )

    return schemas.HistoryResponse(
        conversation_id=str(conversation["id"]),
        messages=messages,
        manual_mode=bool(conversation.get("manual_override")),
    )


async def upload_attachment(
    file: UploadFile,
    *,
    session_id: str | None = None,
    conversation_id: str | None = None,
) -> schemas.UploadResponse:
    """Recibe un archivo y lo almacena en el bucket designado."""

    resolved_conversation_id: str | None = conversation_id

    if not resolved_conversation_id and session_id:
        try:
            conversation_meta = await storage.resolve_webchat_conversation_from_session(session_id)
        except storage.StorageError as exc:
            logger.exception(
                "webchat.upload.resolve_failed",
                extra={"session_id": session_id, "error": str(exc)},
            )
            raise HTTPException(
                status_code=502, detail="No se pudo obtener la conversación"
            ) from exc
        if conversation_meta:
            resolved_conversation_id = conversation_meta.get("id")

    try:
        uploaded = await storage.upload_webchat_attachment(
            file=file,
            session_id=session_id,
            conversation_id=resolved_conversation_id,
        )
    except storage.StorageError as exc:
        logger.exception(
            "webchat.upload_failed",
            extra={"error": str(exc)},
        )
        raise HTTPException(status_code=502, detail="No se pudo cargar el archivo") from exc

    return schemas.UploadResponse(**uploaded)


async def close_session(
    session_id: str,
    *,
    metadata: dict[str, Any] | None = None,
    request: Request | None = None,
) -> None:
    """Registra el cierre explícito de una sesión."""
    try:
        await storage.record_webchat_session_closure(session_id)
    except storage.StorageError as exc:
        logger.exception(
            "webchat.session_close_failed", extra={"session_id": session_id, "error": str(exc)}
        )
        raise HTTPException(status_code=502, detail="No fue posible registrar el cierre") from exc

    try:
        await _register_webchat_visit(
            session_id,
            request=request,
            metadata=metadata,
        )
    except Exception:  # pragma: no cover - best effort
        logger.exception(
            "webchat.visit_capture_failed",
            extra={"session_id": session_id},
        )


async def _run_assistant_turn(
    *,
    client: AsyncOpenAI,
    assistant: AssistantConfig,
    assistant_spec: AssistantSpec | None,
    context: WebchatContext,
    user_message: schemas.MessageRequest,
    openai_conversation_id: str | None,
    previous_response_id: str | None,
    organizacion_id: str | None = None,
    catalog_context: CatalogContext | None = None,
) -> tuple[str | None, dict[str, Any], list[str], list[str], str | None, dict[str, Any]]:
    """Gestiona la interacción con OpenAI y la resolución de tool calls."""
    metadata_payload = {
        "session_id": context.session_id,
        "conversation_id": context.conversation_id,
        "client_message_id": user_message.client_message_id,
        "locale": user_message.locale,
    }
    sanitized_metadata = {k: v for k, v in metadata_payload.items() if v is not None}

    try:
        user_content = await _prepare_user_content_with_attachments(client, user_message)
    except Exception as exc:  # pragma: no cover - defensivo ante adjuntos inesperados
        logger.exception(
            "webchat.build_user_content_failed",
            extra={
                "conversation_id": context.conversation_id,
                "session_id": context.session_id,
                "error": str(exc),
            },
        )
        user_content = [
            {
                "type": "input_text",
                "text": user_message.content,
            }
        ]

    has_attachments = bool(user_message.attachments)
    base_input: list[dict[str, Any]] = []
    if not has_attachments:
        base_input.append(
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Nota interna: este turno no incluye adjuntos. "
                            "Si el usuario no menciona explícitamente archivos, responde sin "
                            "inventarlos."
                        ),
                    }
                ],
            }
        )
    catalog_text = catalog_context.text if catalog_context and catalog_context.text else None
    if catalog_text:
        base_input.append(
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": catalog_text,
                    }
                ],
            }
        )
    base_input.append(
        {
            "role": "user",
            "content": user_content,
        }
    )
    request_kwargs: dict[str, Any] = {"input": base_input, "store": True}

    def _build_request_template() -> dict[str, Any]:
        if assistant.is_prompt:
            prompt_payload = _build_prompt_payload(assistant, context)
            return {
                "prompt": prompt_payload,
                "text": {"format": {"type": "text"}},
            }
        if not assistant_spec:
            raise ValueError("No se pudo resolver la configuración del asistente")
        payload: dict[str, Any] = {"model": assistant_spec.model}
        if assistant_spec.instructions:
            payload["instructions"] = assistant_spec.instructions
        if assistant_spec.tools:
            payload["tools"] = assistant_spec.tools
        return payload

    request_kwargs.update(_build_request_template())

    if sanitized_metadata:
        request_kwargs["metadata"] = sanitized_metadata
    if openai_conversation_id:
        request_kwargs["conversation"] = openai_conversation_id
    elif previous_response_id:
        request_kwargs["previous_response_id"] = previous_response_id

    runtime_context = ToolRuntimeContext(
        conversation_id=context.conversation_id,
        contact_id=context.contact_id,
        session_id=context.session_id,
        channel="webchat",
    )

    result = await run_tool_loop(
        client=client,
        assistant=assistant,
        assistant_spec=assistant_spec,
        context=runtime_context,
        initial_request=request_kwargs,
        request_template=_build_request_template,
        execute_tool=lambda name, args, _: _execute_function_call(name, args, context),
        openai_conversation_id=openai_conversation_id,
        previous_response_id=previous_response_id,
        log=logger,
    )

    assistant_reply = _extract_text_from_response(result.response)

    return (
        assistant_reply,
        result.response,
        result.tools_called,
        result.tool_call_ids,
        result.conversation_id,
        result.side_effects,
    )


def _extract_docx_text(data: bytes) -> str:
    """Extrae texto legible de un archivo DOCX."""
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        try:
            xml_bytes = archive.read("word/document.xml")
        except KeyError as exc:
            raise ValueError("Documento DOCX sin document.xml") from exc

    root = ET.fromstring(xml_bytes)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []
    for para in root.findall(".//w:p", ns):
        runs = []
        for text_node in para.findall(".//w:t", ns):
            if text_node.text:
                runs.append(text_node.text)
        if runs:
            paragraphs.append("".join(runs))
    return "\n\n".join(paragraphs).strip()


def _extract_xlsx_text(data: bytes) -> str:
    """Extrae texto tabular de un archivo XLSX/XLSM."""
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        shared_strings: list[str] = []
        ns = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for si in shared_root.findall(".//main:si", ns):
                fragments: list[str] = []
                for text_node in si.findall(".//main:t", ns):
                    if text_node.text:
                        fragments.append(text_node.text)
                shared_strings.append("".join(fragments))

        rows_out: list[str] = []
        for name in archive.namelist():
            if not name.startswith("xl/worksheets/") or not name.endswith(".xml"):
                continue
            sheet_root = ET.fromstring(archive.read(name))
            for row in sheet_root.findall(".//main:row", ns):
                values: list[str] = []
                for cell in row.findall("main:c", ns):
                    cell_type = cell.get("t")
                    value_text = ""
                    if cell_type == "s":
                        idx_text = cell.findtext("main:v", default="", namespaces=ns)
                        if idx_text.isdigit():
                            idx = int(idx_text)
                            if 0 <= idx < len(shared_strings):
                                value_text = shared_strings[idx]
                    elif cell_type == "inlineStr":
                        value_text = "".join(t.text or "" for t in cell.findall(".//main:t", ns))
                    else:
                        raw = cell.findtext("main:v", default="", namespaces=ns)
                        value_text = raw
                    values.append(value_text.strip())
                if any(values):
                    rows_out.append("\t".join(values).strip())

        return "\n".join(rows_out).strip()

async def _execute_function_call(
    name: str | None,
    arguments_payload: Any,
    context: WebchatContext,
) -> dict[str, Any]:
    """Ejecuta la acción solicitada por el asistente."""
    if not name:
        raise ValueError("Nombre de función ausente en tool call")

    if isinstance(arguments_payload, str):
        try:
            arguments = json.loads(arguments_payload)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Arguments inválidos para {name}: {arguments_payload!r}") from exc
    elif isinstance(arguments_payload, dict):
        arguments = arguments_payload
    else:
        raise ValueError(
            f"Tipo de argumentos no soportado para {name}: {type(arguments_payload)!r}"
        )

    conv_id = str(arguments.get("conversacion_id") or "")
    if conv_id and conv_id != context.conversation_id:
        raise ValueError(
            f"El conversacion_id recibido ({conv_id}) no coincide con la conversación activa"
        )

    lead_context = ToolRuntimeContext(
        conversation_id=context.conversation_id,
        contact_id=context.contact_id,
        session_id=context.session_id,
    )
    lead_result = await lead_tools.try_execute_lead_tool(name, arguments, lead_context)
    if lead_result is not None:
        return lead_result

    if name == "close_lead":
        notes = (arguments.get("notes") or "").strip()
        necesidad = (arguments.get("necesidad_proposito") or "").strip()
        siguiente_accion = (arguments.get("siguiente_accion") or "").strip() or None
        if not notes or not necesidad:
            raise ValueError("notes y necesidad_proposito son requeridos para close_lead")
        await storage.update_contact(
            context.contact_id,
            {"notes": notes, "necesidad_proposito": necesidad},
        )
        await storage.update_conversation(context.conversation_id, {"estado": "pendiente"})
        await storage.upsert_conversation_insights(
            conversation_id=context.conversation_id,
            resumen=notes,
            intencion=necesidad,
            siguiente_accion=siguiente_accion,
        )
        contact_record = await _resolve_contact(context.contact_id)
        opportunity_id = None
        try:
            opportunity_id = await storage.ensure_conversation_opportunity(
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                channel="webchat",
            )
        except StorageError as exc:
            logger.warning(
                "webchat.close_lead.ensure_opportunity_failed",
                extra={"conversation_id": context.conversation_id, "error": str(exc)},
            )
        await webchat_notifications.notify_sales_rep(
            context=lead_context,
            trigger="close_lead",
            contact=contact_record,
            opportunity_id=str(opportunity_id) if opportunity_id else None,
            resumen=necesidad,
            notes=notes,
            email=None,
            extra={"siguiente_accion": siguiente_accion},
        )
        return {
            "status": "ok",
            "notes": notes,
            "necesidad_proposito": necesidad,
            "siguiente_accion": siguiente_accion,
        }

    if name == "list_demo_slots":
        resource_id = _resolve_calendar_resource_id()
        timezone_pref = _resolve_timezone_preference(arguments.get("timezone"))
        start_raw = arguments.get("start_date") or arguments.get("window_start")
        start_date = _parse_calendar_date(start_raw)
        window_days = _normalize_window_days(arguments.get("window_days") or arguments.get("days"))
        end_date = start_date + timedelta(days=window_days - 1)
        try:
            availability_raw = await calendar_service.list_slots(
                resource_id=resource_id,
                start_date=start_date,
                end_date=end_date,
                timezone_hint=timezone_pref,
                max_days=window_days,
            )
        except CalendarError as exc:
            raise ValueError(str(exc)) from exc

        slots = [slot for slot in availability_raw.get("slots", []) if slot.get("is_available")]
        availability_payload = dict(availability_raw)
        availability_payload["slots"] = slots

        return {
            "status": "ok",
            "resource_id": resource_id,
            "timezone": availability_payload.get("timezone"),
            "window_start": availability_payload.get("window_start"),
            "window_end": availability_payload.get("window_end"),
            "slot_duration_minutes": availability_payload.get("slot_duration_minutes"),
            "slots": availability_payload["slots"],
            "_side_effects": {"availability": availability_payload},
        }

    if name == "schedule_demo":
        resource_id = _resolve_calendar_resource_id()
        slot_id = str(arguments.get("slot_id") or "").strip()
        start_raw = arguments.get("start_at")
        if not start_raw and slot_id:
            _, _, candidate = slot_id.partition(":")
            if candidate:
                start_raw = candidate
        slot_datetime = _parse_calendar_datetime(start_raw)
        hold_minutes = max(1, settings.webchat_calendar_hold_minutes)
        slot_identifier = slot_id or _build_slot_identifier(resource_id, slot_datetime)
        notes = (arguments.get("notes") or "").strip() or None

        try:
            tarjeta_id = await _ensure_opportunity_when_contact_ready(
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                channel="webchat",
            )
        except storage.StorageError as exc:
            logger.exception(
                "calendar.ensure_opportunity_failed",
                extra={"conversation_id": context.conversation_id, "error": str(exc)},
            )
            raise ValueError("No pude asociar la oportunidad para agendar la demo.") from exc

        contact = await _resolve_contact(context.contact_id)
        organizacion_hint = _extract_contact_org(contact)
        hold_metadata = {
            "slot_id": slot_identifier,
            "source": "webchat",
            "conversation_id": context.conversation_id,
            "tarjeta_id": tarjeta_id,
            "oportunidad_id": tarjeta_id,
        }
        if organizacion_hint:
            hold_metadata["organizacion_id"] = organizacion_hint

        confirm_metadata = {
            "conversation_id": context.conversation_id,
            "contact_id": context.contact_id,
            "session_id": context.session_id,
            "tarjeta_id": tarjeta_id,
        }
        if organizacion_hint:
            confirm_metadata["organizacion_id"] = organizacion_hint

        try:
            hold = await calendar_service.hold_slot(
                resource_id=resource_id,
                slot_start=slot_datetime,
                conversation_id=context.conversation_id,
                contact_id=context.contact_id,
                tarjeta_id=tarjeta_id,
                hold_minutes=hold_minutes,
                metadata=hold_metadata,
            )
            booking = await calendar_service.confirm_slot(
                hold_id=hold.get("hold_id"),
                notes=notes,
                metadata=confirm_metadata,
            )
        except CalendarError as exc:
            raise ValueError(str(exc)) from exc

        booking_response = _build_booking_response(booking)
        booking_response.hold_id = hold.get("hold_id")
        contact = await _resolve_contact(context.contact_id)
        await _sync_booking_with_opportunity(
            booking=booking_response,
            tarjeta_id=tarjeta_id,
            contact=contact,
            channel="webchat",
        )
        await _send_booking_confirmation_email(
            booking=booking_response,
            contact_id=context.contact_id,
            conversation_id=context.conversation_id,
            tarjeta_id=tarjeta_id,
            contact=contact,
        )

        booking_payload = {
            "booking_id": booking_response.booking_id,
            "resource_id": booking_response.resource_id,
            "start_at": booking_response.start_at.isoformat(),
            "end_at": booking_response.end_at.isoformat() if booking_response.end_at else None,
            "timezone": booking_response.timezone,
            "status": booking_response.status,
            "hold_id": booking_response.hold_id,
        }
        return {
            "status": "ok",
            **booking_payload,
            "_side_effects": {"booking": booking_payload},
        }

    if name == "reschedule_demo":
        booking_id = str(arguments.get("booking_id") or "").strip()
        if not booking_id:
            raise ValueError("booking_id requerido para reschedule_demo")
        new_slot_raw = arguments.get("start_at") or arguments.get("slot_start")
        new_slot_datetime = _parse_calendar_datetime(new_slot_raw)
        notes = (arguments.get("notes") or "").strip() or None
        try:
            booking = await calendar_service.reschedule_booking(
                booking_id=booking_id,
                new_slot_start=new_slot_datetime,
                notes=notes,
                metadata={
                    "conversation_id": context.conversation_id,
                    "contact_id": context.contact_id,
                    "session_id": context.session_id,
                },
            )
        except CalendarError as exc:
            raise ValueError(str(exc)) from exc
        booking_response = _build_booking_response(booking)
        contact = await _resolve_contact(context.contact_id)
        await _sync_booking_with_opportunity(
            booking=booking_response,
            tarjeta_id=booking_response.tarjeta_id,
            contact=contact,
            channel="webchat",
        )
        await _send_booking_confirmation_email(
            booking=booking_response,
            contact_id=context.contact_id,
            conversation_id=context.conversation_id,
            tarjeta_id=booking_response.tarjeta_id,
            contact=contact,
        )
        booking_payload = {
            "booking_id": booking_response.booking_id,
            "resource_id": booking_response.resource_id,
            "start_at": booking_response.start_at.isoformat(),
            "end_at": booking_response.end_at.isoformat() if booking_response.end_at else None,
            "status": booking_response.status,
            "hold_id": booking_response.hold_id,
        }
        return {
            "status": "ok",
            **booking_payload,
            "_side_effects": {"booking": booking_payload},
        }

    if name == "cancel_demo":
        booking_id = str(arguments.get("booking_id") or "").strip()
        if not booking_id:
            raise ValueError("booking_id requerido para cancel_demo")
        reason = (arguments.get("reason") or "").strip() or None
        try:
            booking = await calendar_service.cancel_booking(
                booking_id=booking_id,
                reason=reason,
            )
        except CalendarError as exc:
            raise ValueError(str(exc)) from exc
        booking_payload = {
            "booking_id": booking.get("booking_id"),
            "resource_id": booking.get("resource_id"),
            "start_at": booking.get("start_at"),
            "end_at": booking.get("end_at"),
            "status": booking.get("status"),
        }
        return {
            "status": "ok",
            **booking_payload,
            "_side_effects": {"booking": booking_payload},
        }

    if name == "list_catalog_fraccionamientos":
        org_value = arguments.get("organizacion_id")
        if not org_value:
            contact = await _resolve_contact(context.contact_id)
            org_value = _extract_contact_org(contact)
        if not org_value:
            raise ValueError("organizacion_id requerido para listar fraccionamientos")
        resolved = _resolve_org_uuid(org_value)
        if not resolved:
            raise ValueError("organizacion_id inválido")
        org_uuid = UUID(resolved)

        include_inactive_raw = arguments.get("include_inactive")
        if isinstance(include_inactive_raw, str):
            include_inactive = include_inactive_raw.strip().lower() in {"1", "true", "sí", "si", "yes"}
        else:
            include_inactive = bool(include_inactive_raw)

        prototipos_limit_raw = arguments.get("prototipos_limit")
        try:
            prototipos_limit = int(prototipos_limit_raw)
        except (TypeError, ValueError):
            prototipos_limit = 6
        prototipos_limit = max(1, min(20, prototipos_limit))

        repo = CRMRepository()
        try:
            rows = await list_catalog_fraccionamientos(
                repo,
                organizacion_id=org_uuid,
                include_inactive=include_inactive,
                prototipos_limit=prototipos_limit,
            )
        except CRMRepositoryError as exc:
            raise ValueError(str(exc)) from exc
        return {"status": "ok", "fraccionamientos": rows}

    if name == "fetch_catalog_item_details":
        org_value = arguments.get("organizacion_id")
        if not org_value:
            contact = await _resolve_contact(context.contact_id)
            org_value = _extract_contact_org(contact)
        if not org_value:
            raise ValueError("organizacion_id requerido para fetch_catalog_item_details")
        resolved = _resolve_org_uuid(org_value)
        if not resolved:
            raise ValueError("organizacion_id inválido")
        org_uuid = UUID(resolved)

        query = str(arguments.get("query") or "").strip()
        if not query:
            raise ValueError("query requerido para fetch_catalog_item_details")
        detail_level = str(arguments.get("detail_level") or "metadata").strip()
        if detail_level not in {"metadata", "overview"}:
            raise ValueError("detail_level inválido")
        limit_raw = arguments.get("limit")
        try:
            limit = int(limit_raw)
        except (TypeError, ValueError):
            limit = 1
        limit = max(1, min(5, limit))

        repo = CRMRepository()
        service = CatalogEmbeddingService(repo)
        try:
            matches = await service.query_documents(
                org_uuid,
                query=query,
                limit=limit,
            )
        except CRMRepositoryError as exc:
            raise ValueError(str(exc)) from exc

        items: list[dict[str, Any]] = []
        for match in matches:
            slug = match.metadata.get("slug")
            item_data: dict[str, Any] | None = None
            if isinstance(slug, str) and slug.strip():
                try:
                    item_data = await repo.get_catalog_item_by_slug(
                        organizacion_id=org_uuid,
                        slug=slug.strip(),
                    )
                except CRMRepositoryError as exc:
                    logger.warning(
                        "catalog.item_lookup_failed",
                        extra={
                            "organizacion_id": str(org_uuid),
                            "slug": slug,
                            "error": str(exc),
                        },
                    )
            metadata_value = (
                item_data.get("metadata")
                if item_data and item_data.get("metadata")
                else item_data.get("metadatos")
                if item_data
                else None
            )
            content_metadata = _extract_metadata_from_content(match.contenido)
            normalized_metadata = _normalize_metadata_value(metadata_value)
            normalized_match = _normalize_metadata_value(match.metadata)
            merged_metadata: dict[str, Any] = {}
            if normalized_match:
                merged_metadata.update(normalized_match)
            if normalized_metadata:
                merged_metadata.update(normalized_metadata)
            if content_metadata:
                merged_metadata.update(content_metadata)
            metadata = merged_metadata or (
                metadata_value if isinstance(metadata_value, Mapping) else match.metadata
            )
            items.append(
                {
                    "nombre": item_data.get("nombre") if item_data else match.metadata.get("nombre"),
                    "slug": item_data.get("slug") if item_data else match.metadata.get("slug"),
                    "tipo": item_data.get("tipo") if item_data else match.metadata.get("tipo"),
                    "unidad": item_data.get("unidad") if item_data else None,
                    "precio_base": item_data.get("precio_base") if item_data else None,
                    "moneda": item_data.get("moneda") if item_data else match.metadata.get("moneda"),
                    "activo": item_data.get("activo") if item_data else match.metadata.get("activo"),
                    "metadata": metadata,
                    "similarity": match.similarity,
                }
            )
        return {
            "status": "ok",
            "items": items,
            "detail_level": detail_level,
            "source": "vector_store_supabase",
        }

    logger.warning(
        "webchat.unknown_tool_call",
        extra={"tool": name, "conversation_id": context.conversation_id},
    )
    return {"status": "ignored", "tool": name}


def _normalize_metadata_value(value: Any) -> dict[str, Any] | None:
    if isinstance(value, Mapping):
        return {str(key): val for key, val in value.items() if val is not None}
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, Mapping):
            return {str(key): val for key, val in parsed.items() if val is not None}
    return None


def _extract_metadata_from_content(content: str) -> dict[str, Any] | None:
    if not content:
        return None
    marker = "Metadata:"
    index = content.find(marker)
    if index == -1:
        return None
    start = content.find("{", index + len(marker))
    if start == -1:
        return None
    depth = 0
    end = None
    for pos in range(start, len(content)):
        char = content[pos]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = pos + 1
                break
    if end is None:
        return None
    snippet = content[start:end]
    try:
        metadata = json.loads(snippet)
    except json.JSONDecodeError:
        return None
    if isinstance(metadata, Mapping):
        return {str(key): val for key, val in metadata.items() if val is not None}
    return None


def _build_prompt_payload(assistant: AssistantConfig, context: WebchatContext) -> dict[str, Any]:
    """Puente específico para usar el helper compartido con el contexto webchat."""
    variables = {"conversacion_id": context.conversation_id}
    return build_assistant_prompt_payload(assistant, variables)
