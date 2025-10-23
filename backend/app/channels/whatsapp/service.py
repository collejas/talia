"""Servicios específicos para WhatsApp via Twilio."""

from app.services import openai as openai_service
from app.services import twilio as twilio_service


async def handle_incoming_message(payload: bytes) -> None:
    """Stub de manejo para mensajes entrantes.

    En Fase 2 se conectará con Twilio y OpenAI. Aquí sólo registramos la recepción.
    """
    twilio_service.get_twilio_client()  # placeholder para validar import
    openai_service.get_assistant_client()  # placeholder para validar import
    _ = payload  # evitar warning
