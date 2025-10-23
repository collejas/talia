"""Servicios para el canal de voz."""
from .schemas import VoiceStatusCallback


async def handle_voice_status(callback: VoiceStatusCallback) -> None:
    """Placeholder para manejar estatus de llamadas Twilio."""
    _ = callback  # Implementación pendiente
