"""Esquemas para Twilio Voice."""
from pydantic import BaseModel


class VoiceStatusCallback(BaseModel):
    """Modelo mínimo para callbacks de estado."""

    call_sid: str
    call_status: str
    direction: str | None = None
