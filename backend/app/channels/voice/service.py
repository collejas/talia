"""Servicios para el canal de voz."""

from __future__ import annotations

import asyncio
import html
from dataclasses import dataclass

from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.services import twilio as twilio_service

from .schemas import VoiceStatusCallback

logger = get_logger(__name__)


@dataclass(slots=True)
class VoiceCallResult:
    """Resultado resumido al iniciar una llamada."""

    sid: str | None
    status: str | None
    error: str | None = None


async def handle_voice_status(callback: VoiceStatusCallback) -> None:
    """Placeholder para manejar estatus de llamadas Twilio."""
    log_event(
        logger,
        "voice.status_stub",
        call_sid=callback.call_sid,
        call_status=callback.call_status,
        direction=callback.direction,
    )


async def start_outbound_call(*, to_number: str, message: str) -> VoiceCallResult:
    """Inicia una llamada mediante Twilio Voice y lee el mensaje provisto."""

    if (
        not settings.twilio_account_sid
        or not settings.twilio_auth_token
        or not settings.twilio_phone_number
    ):
        logger.warning("voice.twilio_not_configured")
        return VoiceCallResult(sid=None, status="skipped", error="twilio_not_configured")
    normalized_to = to_number.strip()
    if not normalized_to:
        return VoiceCallResult(sid=None, status="skipped", error="telefono_invalid")
    client = twilio_service.get_twilio_client()
    twiml_message = (
        "<Response><Say language=\"es-MX\" voice=\"Polly.Mia\">"
        f"{html.escape(message or 'Tal IA marcó esta llamada de seguimiento.')}"
        "</Say></Response>"
    )
    try:
        call = await asyncio.to_thread(
            client.calls.create,
            to=normalized_to,
            from_=settings.twilio_phone_number,
            twiml=twiml_message,
        )
    except Exception as exc:  # pragma: no cover - errores propios del SDK
        logger.exception("voice.twilio_call_failed", extra={"error": str(exc)})
        return VoiceCallResult(sid=None, status="failed", error=str(exc))
    return VoiceCallResult(
        sid=getattr(call, "sid", None),
        status=getattr(call, "status", None),
        error=None,
    )
