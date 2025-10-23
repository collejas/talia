"""Dependencias reutilizables para rutas de WhatsApp."""

from fastapi import Header

from app.core.config import settings
from app.core.security import mask_secret


async def verify_twilio_signature(x_twilio_signature: str = Header(default="")) -> None:
    """Stub de validación para firmas de Twilio.

    En Fase 2 se validará el cuerpo del request contra la firma. Por ahora
    únicamente dejamos un hook para logging/depuración.
    """
    _ = (x_twilio_signature, mask_secret(settings.twilio_auth_token))
