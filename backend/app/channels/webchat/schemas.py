"""Esquemas Pydantic para webchat."""

from pydantic import BaseModel, Field


class WebchatMessage(BaseModel):
    """Representa un mensaje enviado desde el widget."""

    session_id: str = Field(..., description="Identificador del hilo")
    author: str = Field(..., description="`user` o `assistant`")
    content: str
    locale: str | None = None


class WebchatResponse(BaseModel):
    """Respuesta del backend para un mensaje del usuario."""

    session_id: str
    reply: str
    metadata: dict[str, str] | None = None
