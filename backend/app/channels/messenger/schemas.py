"""Schemas básicos para Messenger."""

from pydantic import BaseModel


class MessengerMessage(BaseModel):
    sender_id: str
    recipient_id: str
    message_id: str
    text: str | None = None
    quick_reply: dict[str, str] | None = None
    attachments: list[dict[str, str]] | None = None
