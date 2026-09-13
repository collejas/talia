"""Procesamiento idempotente de eventos enviados por Postmark."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.services.tenant_runtime import invalidate_runtime_cache

from .repository import PostmarkRepository


EVENTS = {"Delivery", "Bounce", "Open", "Click", "SpamComplaint", "SubscriptionChange"}


def _event_id(payload: dict[str, Any], trace_id: str | None) -> str:
    provider_id = payload.get("ID") or payload.get("MessageID")
    if provider_id:
        return str(provider_id)
    if trace_id:
        return trace_id[:200]
    stable = repr(sorted((str(k), str(v)) for k, v in payload.items()))
    return hashlib.sha256(stable.encode("utf-8")).hexdigest()


def _event_at(payload: dict[str, Any]) -> str:
    for key in ("DeliveredAt", "BouncedAt", "ComplainedAt", "ReadAt", "ClickedAt", "ChangedAt"):
        value = payload.get(key)
        if value:
            try:
                return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
            except ValueError:
                break
    return datetime.now(timezone.utc).isoformat()


async def process_postmark_event(
    *,
    repository: PostmarkRepository,
    organizacion_id: UUID,
    server_id: UUID,
    message_stream: str,
    payload: dict[str, Any],
    trace_id: str | None,
) -> dict[str, object]:
    record_type = str(payload.get("RecordType") or "").strip()
    if record_type not in EVENTS:
        raise ValueError("postmark_event_type_invalid")
    external_message_id = str(payload.get("MessageID") or "").strip() or None
    message = (
        await repository.get_message_by_external_id(
            organizacion_id=organizacion_id,
            server_id=server_id,
            external_message_id=external_message_id,
        )
        if external_message_id
        else None
    )
    event_id = _event_id(payload, trace_id)
    receipt = await repository.record_webhook_receipt(
        payload={
            "organizacion_id": str(organizacion_id),
            "server_id": str(server_id),
            "message_id": message.get("id") if message else None,
            "external_message_id": external_message_id,
            "event_type": record_type,
            "external_event_id": event_id,
            "processing_status": "received",
        }
    )
    if not receipt:
        return {"accepted": True, "duplicate": True}
    try:
        recipient = str(payload.get("Recipient") or payload.get("Email") or "").strip().lower()
        if message and recipient:
            event_status = {
                "Delivery": "delivered", "Bounce": "bounced", "Open": "opened",
                "Click": "clicked", "SpamComplaint": "complained", "SubscriptionChange": "subscription_changed",
            }[record_type]
            await repository.create_event(payload={
                "organizacion_id": str(organizacion_id), "message_id": message["id"],
                "external_message_id": external_message_id, "event_type": record_type,
                "event_status": event_status, "recipient_email": recipient, "event_at": _event_at(payload),
                "error_code": str(payload.get("TypeCode")) if payload.get("TypeCode") is not None else None,
                "error_description": str(payload.get("Description") or payload.get("Details") or "")[:2000] or None,
                "bounce_type": str(payload.get("Type") or "")[:100] or None, "source": "webhook",
            })

        timestamp = _event_at(payload)
        state = {
            "Delivery": ("delivered", "delivered_at", None), "Bounce": ("bounced", "bounced_at", None),
            "Open": ("opened", "opened_at", "in.(queued,processing,submitted,delivered)"),
            "Click": ("clicked", "clicked_at", "in.(queued,processing,submitted,delivered,opened)"),
            "SpamComplaint": ("complained", "complained_at", None),
        }.get(record_type)
        if message and state:
            status, timestamp_field, status_filter = state
            await repository.update_message_from_webhook(
                organizacion_id=organizacion_id, server_id=server_id,
                external_message_id=external_message_id or "",
                payload={"status": status, timestamp_field: timestamp}, status_filter=status_filter,
            )
        if record_type in {"Bounce", "SpamComplaint"} and recipient:
            await repository.upsert_suppression(payload={
                "organizacion_id": str(organizacion_id), "email_address": recipient,
                "suppression_type": "spam_complaint" if record_type == "SpamComplaint" else "bounce",
                "reason": str(payload.get("Description") or payload.get("Details") or record_type)[:500],
                "source": "webhook", "active": True, "suppressed_at": timestamp,
            })
        await repository.finish_webhook_receipt(receipt_id=UUID(str(receipt["id"])), status="processed")
    except Exception as exc:
        await repository.finish_webhook_receipt(
            receipt_id=UUID(str(receipt["id"])), status="failed", error_code=type(exc).__name__
        )
        raise
    invalidate_runtime_cache(organizacion_id=organizacion_id)
    return {"accepted": True, "duplicate": False, "event_type": record_type}
