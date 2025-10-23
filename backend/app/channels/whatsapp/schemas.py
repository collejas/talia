"""Esquemas Pydantic para payloads de WhatsApp."""

from pydantic import BaseModel


class WhatsAppMessage(BaseModel):
    """Mensajes entrantes desde Twilio."""

    from_: str
    body: str
    wa_id: str | None = None
    profile_name: str | None = None


class WhatsAppCallback(BaseModel):
    """Callbacks de estado de mensajes enviados."""

    message_sid: str
    status: str
