"""Esquemas de datos para el canal Webchat."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

AuthorType = Literal["user", "assistant"]


class MessageRequest(BaseModel):
    """Payload recibido desde el widget webchat."""

    session_id: str = Field(..., description="Identificador único por visitante/navegador.")
    author: AuthorType = Field(..., description="Rol del emisor (user o assistant).")
    content: str = Field(..., description="Mensaje en texto plano.")
    client_message_id: str | None = Field(
        default=None,
        description="ID generado en el frontend para deduplicar envíos.",
    )
    locale: str | None = Field(
        default=None,
        description="Locale detectado en el navegador (ej. es-MX).",
    )
    fresh_load: bool | None = Field(
        default=None,
        description="Indica si es la primera interacción tras cargar el widget.",
    )
    metadata: dict[str, Any] | None = Field(
        default=None,
        description="Metadatos opcionales capturados por el cliente (user-agent, etc.).",
    )


class MessageMetadata(BaseModel):
    """Información complementaria retornada al frontend."""

    conversation_id: str | None = None
    openai_conversation_id: str | None = None
    assistant_response_id: str | None = None
    previous_response_id: str | None = None
    manual_mode: bool = False
    tools_called: list[str] | None = None
    tool_call_ids: list[str] | None = None
    client_message_id: str | None = None


class MessageResponse(BaseModel):
    """Respuesta a POST /messages."""

    reply: str | None
    metadata: MessageMetadata


class HistoryMessage(BaseModel):
    """Elemento individual del historial de mensajes."""

    message_id: str = Field(..., alias="id")
    direction: Literal["entrante", "saliente"]
    content: str
    created_at: datetime
    metadata: dict[str, Any] | None = None


class HistoryResponse(BaseModel):
    """Respuesta de GET /messages."""

    conversation_id: str | None = None
    messages: list[HistoryMessage] = Field(default_factory=list)
    manual_mode: bool = False


class CloseSessionRequest(BaseModel):
    """Payload para POST /close."""

    session_id: str = Field(..., description="Identificador de sesión generado en el widget.")
    metadata: dict[str, Any] | None = Field(
        default=None,
        description="Metadatos opcionales capturados en el cliente.",
    )


class VisitRegistrationRequest(BaseModel):
    """Payload para registrar/actualizar una visita webchat."""

    session_id: str = Field(..., description="Identificador de sesión generado en el widget.")
    metadata: dict[str, Any] | None = Field(
        default=None,
        description="Metadatos opcionales capturados en el cliente.",
    )


class ClientConfig(BaseModel):
    """Configuración expuesta al widget para ajustar el comportamiento local."""

    persist_session: bool = Field(
        default=True,
        description="Indica si el widget debe reutilizar session_id entre recargas.",
    )
    inactivity_timeout_hours: int | None = Field(
        default=None,
        description="Horas de inactividad en backend antes de iniciar nueva conversación.",
    )
