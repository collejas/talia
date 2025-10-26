"""Esquemas Pydantic para webchat."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class WebchatMessage(BaseModel):
    """Representa un mensaje enviado desde el widget."""

    session_id: str = Field(..., description="Identificador del hilo")
    author: str = Field(..., description="`user` o `assistant`")
    content: str
    locale: str | None = None
    client_message_id: str | None = Field(
        default=None,
        description="Identificador único generado por el cliente para prevenir duplicados",
        max_length=120,
    )


class WebchatResponse(BaseModel):
    """Respuesta del backend para un mensaje del usuario."""

    session_id: str
    reply: str
    metadata: dict[str, Any] | None = None


class WebchatHistoryItem(BaseModel):
    """Mensaje almacenado dentro del historial webchat."""

    message_id: str
    direction: str
    content: str
    created_at: datetime | str
    sender_type: str | None = None
    metadata: dict[str, Any] | None = None


class WebchatHistoryResponse(BaseModel):
    """Respuesta al consultar historial de un session_id."""

    session_id: str
    messages: list[WebchatHistoryItem]
    next_since: str | None = Field(default=None, description="Cursor para seguir consultando")
