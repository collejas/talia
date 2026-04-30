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


def _extract_meta_event_value(change: Mapping[str, Any] | Any) -> dict[str, Any]:
    if isinstance(change, Mapping):
        value = change.get("value")
        if isinstance(value, dict):
            return value
    return {}


def _extract_meta_text(message: dict[str, Any]) -> str | None:
    text_payload = message.get("text")
    if isinstance(text_payload, dict):
        body = text_payload.get("body")
        if isinstance(body, str) and body.strip():
            return body.strip()

    for key in ("button", "image", "document", "video", "audio"):
        payload = message.get(key)
        if not isinstance(payload, dict):
            continue
        candidate = payload.get("caption") or payload.get("title") or payload.get("text")
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()

    interactive_payload = message.get("interactive")
    if isinstance(interactive_payload, dict):
        nested = interactive_payload.get("button_reply") or interactive_payload.get("list_reply")
        if isinstance(nested, dict):
            candidate = nested.get("title") or nested.get("name")
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()

    return None


class MetaWhatsAppIncomingMessage(BaseModel):
    """Representa un mensaje entrante del webhook de WhatsApp Cloud API."""

    message_sid: str
    from_number: str
    to_number: str | None = None
    phone_number_id: str | None = None
    body: str | None = None
    wa_id: str | None = None
    profile_name: str | None = None
    num_media: int = 0
    media: list[WhatsAppMediaAttachment] = Field(default_factory=list)
    raw_payload: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_webhook_payload(cls, payload: Mapping[str, Any] | Any) -> list["MetaWhatsAppIncomingMessage"]:
        root = dict(payload) if isinstance(payload, Mapping) else {}
        messages: list[MetaWhatsAppIncomingMessage] = []
        entries = root.get("entry") or []
        if not isinstance(entries, list):
            return messages

        for entry in entries:
            if not isinstance(entry, dict):
                continue
            changes = entry.get("changes") or []
            if not isinstance(changes, list):
                continue
            for change in changes:
                if not isinstance(change, dict):
                    continue
                value = _extract_meta_event_value(change)
                if not value:
                    continue
                metadata = value.get("metadata") if isinstance(value.get("metadata"), dict) else {}
                contacts = value.get("contacts") or []
                contact = contacts[0] if isinstance(contacts, list) and contacts and isinstance(contacts[0], dict) else {}
                profile = contact.get("profile") if isinstance(contact.get("profile"), dict) else {}
                for message in value.get("messages") or []:
                    if not isinstance(message, dict):
                        continue
                    message_sid = _coerce_to_str(message.get("id"))
                    from_number = _coerce_to_str(message.get("from"))
                    if not message_sid or not from_number:
                        continue
                    messages.append(
                        cls(
                            message_sid=message_sid,
                            from_number=from_number,
                            to_number=_coerce_to_str(metadata.get("display_phone_number")) or None,
                            phone_number_id=_coerce_to_str(metadata.get("phone_number_id")) or None,
                            body=_extract_meta_text(message),
                            wa_id=_coerce_to_str(contact.get("wa_id") or message.get("from")) or None,
                            profile_name=_coerce_to_str(profile.get("name")) or None,
                            num_media=0,
                            media=[],
                            raw_payload={
                                "entry": entry,
                                "change": change,
                                "value": value,
                                "message": message,
                            },
                        )
                    )
        return messages

    def attachments_as_dict(self) -> list[dict[str, Any]]:
        return [item.model_dump(exclude_none=True) for item in self.media]

    def metadata(self) -> dict[str, Any]:
        return {
            "from_number": self.from_number,
            "to_number": self.to_number,
            "phone_number_id": self.phone_number_id,
            "wa_id": self.wa_id,
            "profile_name": self.profile_name,
            "num_media": self.num_media,
            "raw": self.raw_payload,
        }


class MetaWhatsAppStatusCallback(BaseModel):
    """Payload normalizado para callbacks de estado de WhatsApp Cloud API."""

    message_sid: str
    status: str
    error_code: str | None = None
    timestamp: str | None = None
    raw_payload: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_webhook_payload(cls, payload: Mapping[str, Any] | Any) -> list["MetaWhatsAppStatusCallback"]:
        root = dict(payload) if isinstance(payload, Mapping) else {}
        callbacks: list[MetaWhatsAppStatusCallback] = []
        entries = root.get("entry") or []
        if not isinstance(entries, list):
            return callbacks

        for entry in entries:
            if not isinstance(entry, dict):
                continue
            changes = entry.get("changes") or []
            if not isinstance(changes, list):
                continue
            for change in changes:
                if not isinstance(change, dict):
                    continue
                value = _extract_meta_event_value(change)
                if not value:
                    continue
                statuses = value.get("statuses") or []
                if not isinstance(statuses, list):
                    continue
                for status in statuses:
                    if not isinstance(status, dict):
                        continue
                    message_sid = _coerce_to_str(status.get("id"))
                    status_value = _coerce_to_str(status.get("status"))
                    if not message_sid or not status_value:
                        continue
                    error_code: str | None = None
                    errors = status.get("errors")
                    if isinstance(errors, list) and errors and isinstance(errors[0], dict):
                        error_code = _coerce_to_str(
                            errors[0].get("code")
                            or errors[0].get("title")
                            or errors[0].get("message")
                        ).strip() or None
                    callbacks.append(
                        cls(
                            message_sid=message_sid,
                            status=status_value,
                            error_code=error_code,
                            timestamp=_coerce_to_str(status.get("timestamp")) or None,
                            raw_payload={
                                "entry": entry,
                                "change": change,
                                "value": value,
                                "status": status,
                            },
                        )
                    )
        return callbacks
