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
    attachments: list[AttachmentPayload] | None = Field(
        default=None,
        description="Adjuntos asociados al mensaje (cargados previamente).",
    )


class AttachmentPayload(BaseModel):
    """Representa un archivo adjunto transferido por el webchat."""

    url: str = Field(..., description="URL accesible del archivo adjunto.")
    name: str | None = Field(default=None, description="Nombre de archivo legible.")
    mime: str | None = Field(default=None, description="Tipo MIME del archivo.")
    size: int | None = Field(default=None, description="Peso del archivo en bytes.")
    provider_id: str | None = Field(
        default=None, description="Identificador interno del almacenamiento."
    )
    path: str | None = Field(default=None, description="Ruta interna en el bucket de storage.")


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
    availability: dict[str, Any] | None = None


class MessageResponse(BaseModel):
    """Respuesta a POST /messages."""

    reply: str | None
    metadata: MessageMetadata
    attachments: list[Attachment] | None = None


class HistoryMessage(BaseModel):
    """Elemento individual del historial de mensajes."""

    message_id: str = Field(..., alias="id")
    direction: Literal["entrante", "saliente"]
    content: str
    created_at: datetime
    metadata: dict[str, Any] | None = None
    attachments: list[Attachment] = Field(default_factory=list)


class HistoryResponse(BaseModel):
    """Respuesta de GET /messages."""

    conversation_id: str | None = None
    messages: list[HistoryMessage] = Field(default_factory=list)
    manual_mode: bool = False


class Attachment(BaseModel):
    """Adjunto normalizado utilizado en respuestas."""

    id: str | None = None
    url: str
    mime: str | None = None
    size: int | None = None
    name: str | None = None
    provider_id: str | None = None
    path: str | None = None


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


class UploadResponse(BaseModel):
    """Metadata devuelta tras subir un adjunto al canal webchat."""

    url: str
    name: str | None = None
    mime: str | None = None
    size: int | None = None
    provider_id: str | None = None
    path: str | None = None


class AvailabilitySlot(BaseModel):
    """Horario disponible sugerido para una demo."""

    start_at: datetime
    end_at: datetime
    timezone: str
    label: str | None = None
    local_date: str | None = None
    local_time: str | None = None
    weekday: int | None = None


class AvailabilityResponse(BaseModel):
    """Respuesta del endpoint de disponibilidad de demos."""

    status: str
    conversation_id: str | None = None
    timezone: str
    generated_at: datetime
    window_start: datetime
    window_end: datetime
    slot_duration_minutes: int
    slots: list[AvailabilitySlot] = Field(default_factory=list)
