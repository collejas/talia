"""Modelos base para conversaciones y leads."""
from datetime import datetime
from pydantic import BaseModel


class Conversation(BaseModel):
    """Representa una conversación multicanal."""

    id: str
    channel: str
    created_at: datetime
    metadata: dict[str, str] | None = None
