"""Esquemas Pydantic para payloads de WhatsApp."""

from __future__ import annotations

from typing import Any, Iterable, Mapping

from pydantic import BaseModel, Field


def _iter_items(data: Mapping[str, Any] | Any) -> Iterable[tuple[str, Any]]:
    if hasattr(data, "multi_items"):
        for key, value in data.multi_items():
            yield str(key), value
    elif isinstance(data, Mapping):
        for key, value in data.items():
            yield str(key), value
    else:
        for key, value in list(data or []):  # pragma: no cover - fallback defensivo
            yield str(key), value


def _coerce_to_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        try:
            return value.decode()
        except UnicodeDecodeError:
            return value.decode(errors="ignore")
    return str(value)


def _lookup(payload: dict[str, Any], key: str) -> Any:
    direct = payload.get(key)
    if direct is not None:
        return direct
    lower = payload.get(key.lower())
    if lower is not None:
        return lower
    upper = payload.get(key.upper())
    if upper is not None:
        return upper
    return None


class WhatsAppMediaAttachment(BaseModel):
    """Metadatos básicos de archivos recibidos vía Twilio."""

    index: int
    url: str
    content_type: str | None = None
    filename: str | None = None


class WhatsAppIncomingMessage(BaseModel):
    """Representa un mensaje entrante del webhook de Twilio."""

    message_sid: str
    from_number: str
    to_number: str | None = None
    body: str | None = None
    wa_id: str | None = None
    profile_name: str | None = None
    num_media: int = 0
    media: list[WhatsAppMediaAttachment] = Field(default_factory=list)
    raw_payload: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_form_data(cls, form: Mapping[str, Any] | Any) -> WhatsAppIncomingMessage:
        raw: dict[str, Any] = {}
        for key, value in _iter_items(form):
            raw[key] = _coerce_to_str(value)

        num_media = int(_coerce_to_str(_lookup(raw, "NumMedia") or "0") or 0)
        attachments: list[WhatsAppMediaAttachment] = []
        for idx in range(num_media):
            media_url = _lookup(raw, f"MediaUrl{idx}") or _lookup(raw, f"mediaurl{idx}")
            if not media_url:
                continue
            attachments.append(
                WhatsAppMediaAttachment(
                    index=idx,
                    url=_coerce_to_str(media_url),
                    content_type=_lookup(raw, f"MediaContentType{idx}")
                    or _lookup(raw, f"mediacontenttype{idx}"),
                    filename=_lookup(raw, f"MediaFilename{idx}")
                    or _lookup(raw, f"mediafilename{idx}"),
                )
            )

        return cls(
            message_sid=_coerce_to_str(_lookup(raw, "MessageSid") or raw.get("SmsSid")),
            from_number=_coerce_to_str(_lookup(raw, "From") or raw.get("from")),
            to_number=_lookup(raw, "To"),
            body=_lookup(raw, "Body"),
            wa_id=_lookup(raw, "WaId"),
            profile_name=_lookup(raw, "ProfileName"),
            num_media=len(attachments),
            media=attachments,
            raw_payload=raw,
        )

    def attachments_as_dict(self) -> list[dict[str, Any]]:
        return [item.model_dump(exclude_none=True) for item in self.media]

    def metadata(self) -> dict[str, Any]:
        return {
            "from_number": self.from_number,
            "to_number": self.to_number,
            "wa_id": self.wa_id,
            "profile_name": self.profile_name,
            "num_media": self.num_media,
            "raw": self.raw_payload,
        }


class WhatsAppStatusCallback(BaseModel):
    """Payload normalizado para callbacks de estado de Twilio."""

    message_sid: str
    status: str
    error_code: str | None = None
    timestamp: str | None = None
    raw_payload: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_form_data(cls, form: Mapping[str, Any] | Any) -> WhatsAppStatusCallback:
        raw: dict[str, Any] = {}
        for key, value in _iter_items(form):
            raw[key] = _coerce_to_str(value)

        return cls(
            message_sid=_coerce_to_str(_lookup(raw, "MessageSid") or raw.get("messagesid")),
            status=_coerce_to_str(_lookup(raw, "MessageStatus") or raw.get("status")),
            error_code=_lookup(raw, "ErrorCode"),
            timestamp=_lookup(raw, "Timestamp"),
            raw_payload=raw,
        )
