"""Servicios asociados al canal webchat."""
from .schemas import WebchatMessage


async def handle_webchat_message(message: WebchatMessage) -> None:
    """Placeholder para procesar mensajes del widget web."""
    _ = message  # Se implementará en Fase 2/3
