"""Servicios para el canal de voz."""

from app.core.logging import get_logger, log_event

from .schemas import VoiceStatusCallback

logger = get_logger(__name__)


async def handle_voice_status(callback: VoiceStatusCallback) -> None:
    """Placeholder para manejar estatus de llamadas Twilio."""
    log_event(
        logger,
        "voice.status_stub",
        call_sid=callback.call_sid,
        call_status=callback.call_status,
        direction=callback.direction,
    )
