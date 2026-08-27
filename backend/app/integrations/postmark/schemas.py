"""Contratos internos para las respuestas de la API de correo."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


MessageKind = Literal["transactional", "broadcast"]


class PostmarkDomainResult(BaseModel):
    """Datos de dominio normalizados para persistencia interna."""

    model_config = ConfigDict(extra="forbid")

    external_domain_id: int
    domain_name: str
    dkim_host: str | None = None
    dkim_record_value: str | None = None
    return_path_domain: str | None = None
    return_path_cname_target: str | None = None
    dkim_verified: bool = False
    return_path_verified: bool = False


class PostmarkMessage(BaseModel):
    """Mensaje ya validado por Talia antes de enviarse al proveedor."""

    model_config = ConfigDict(extra="forbid")

    from_email: str = Field(min_length=3, max_length=320)
    from_name: str | None = Field(default=None, max_length=200)
    to_email: str = Field(min_length=3, max_length=320)
    subject: str = Field(min_length=1, max_length=998)
    html_body: str | None = None
    text_body: str | None = None
    reply_to: str | None = Field(default=None, max_length=320)
    tag: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def require_body(self) -> "PostmarkMessage":
        if self.html_body is None and self.text_body is None:
            raise ValueError("message_body_required")
        return self

    @field_validator("from_email", "to_email", "reply_to")
    @classmethod
    def validate_email_shape(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if normalized.count("@") != 1 or normalized.startswith("@") or normalized.endswith("@"):
            raise ValueError("invalid_email")
        return normalized

    @field_validator("html_body", "text_body")
    @classmethod
    def validate_body(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            return None
        return value


class PostmarkSendResult(BaseModel):
    """Resultado normalizado de un destinatario."""

    accepted: bool
    provider_message_id: UUID | None = None
    error_code: int | None = None
    error_message: str | None = None


class PostmarkBatchResult(BaseModel):
    """Resultado por destinatario; HTTP 200 no implica éxito total."""

    items: list[PostmarkSendResult]
