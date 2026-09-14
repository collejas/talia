"""Conciliación del historial de Postmark con los mensajes de Talia."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.services.tenant_runtime import get_secret_plaintext

from app.integrations.postmark.client import PostmarkClient
from .repository import PostmarkRepository
from .webhooks import process_postmark_event


_EVENT_TYPES = {
    "Delivered": "Delivery",
    "Bounced": "Bounce",
    "Opened": "Open",
    "LinkClicked": "Click",
    "SubscriptionChanged": "SubscriptionChange",
}


def _recipient(message: dict[str, Any]) -> str | None:
    value = message.get("Recipients") or message.get("To")
    if isinstance(value, list) and value:
        first = value[0]
        value = first.get("Email") if isinstance(first, dict) else first
    if isinstance(value, str) and "@" in value:
        return value.strip().lower()
    return None


async def synchronize_outbound_messages(
    *,
    repository: PostmarkRepository,
    organizacion_id: UUID,
    from_date: str,
    to_date: str,
    message_stream: str = "outbound",
    count: int = 500,
    offset: int = 0,
) -> dict[str, int | str]:
    server = await repository.get_server(organizacion_id=organizacion_id)
    if not server or server.get("server_status") != "active":
        raise RuntimeError("postmark_server_not_active")
    token = await get_secret_plaintext(
        organizacion_id=organizacion_id,
        clave=str(server.get("server_token_secret_key") or "postmark.server_token"),
        force_refresh=True,
    )
    if not token:
        raise RuntimeError("postmark_server_token_missing")
    client = PostmarkClient(server_token=token)
    response = await client.list_outbound_messages(
        from_date=from_date,
        to_date=to_date,
        message_stream=message_stream,
        count=max(1, min(count, 500)),
        offset=max(offset, 0),
    )
    messages = [item for item in response.get("Messages", []) if isinstance(item, dict)]
    external_ids = [str(item.get("MessageID")) for item in messages if item.get("MessageID")]
    local_rows = await repository.list_messages_by_external_ids(
        organizacion_id=organizacion_id,
        server_id=UUID(str(server["id"])),
        external_ids=external_ids,
    )
    local_by_external = {str(row.get("external_message_id")): row for row in local_rows}
    matched = 0
    events = 0
    for item in messages:
        message_id = str(item.get("MessageID") or "").strip()
        if not message_id or message_id not in local_by_external:
            continue
        matched += 1
        details = await client.get_outbound_message_details(message_id)
        recipient = _recipient(details) or _recipient(item)
        for event in details.get("MessageEvents") or []:
            if not isinstance(event, dict):
                continue
            record_type = _EVENT_TYPES.get(str(event.get("Type") or ""))
            if not record_type:
                continue
            received_at = event.get("ReceivedAt")
            payload = {
                "RecordType": record_type,
                "MessageID": message_id,
                "Recipient": recipient,
                "Email": recipient,
                "ID": event.get("ID"),
                "ReceivedAt": received_at,
                "DeliveredAt": received_at if record_type == "Delivery" else None,
                "BouncedAt": received_at if record_type == "Bounce" else None,
                "ReadAt": received_at if record_type == "Open" else None,
                "ClickedAt": received_at if record_type == "Click" else None,
                "ChangedAt": received_at if record_type == "SubscriptionChange" else None,
                "Description": event.get("Description"),
                "Type": event.get("Type"),
                "TypeCode": event.get("TypeCode"),
            }
            await process_postmark_event(
                repository=repository,
                organizacion_id=organizacion_id,
                server_id=UUID(str(server["id"])),
                message_stream=message_stream,
                payload=payload,
                trace_id=f"polling:{message_id}:{record_type}:{received_at}",
                source="polling",
            )
            events += 1
    return {
        "provider_messages": len(messages),
        "provider_total": int(response.get("TotalCount") or len(messages)),
        "matched_messages": matched,
        "processed_events": events,
        "from_date": from_date,
        "to_date": to_date,
    }


async def synchronize_hard_bounces(
    *,
    repository: PostmarkRepository,
    organizacion_id: UUID,
    from_date: str | None = None,
    to_date: str | None = None,
    message_stream: str = "broadcast",
    count: int = 500,
) -> dict[str, int | str | None]:
    """Importa HardBounce históricos y crea supresiones por tenant."""
    server = await repository.get_server(organizacion_id=organizacion_id)
    if not server or server.get("server_status") != "active":
        raise RuntimeError("postmark_server_not_active")
    token = await get_secret_plaintext(
        organizacion_id=organizacion_id,
        clave=str(server.get("server_token_secret_key") or "postmark.server_token"),
        force_refresh=True,
    )
    if not token:
        raise RuntimeError("postmark_server_token_missing")
    client = PostmarkClient(server_token=token)
    page_size = max(1, min(count, 500))
    offset = 0
    provider_total = 0
    imported = 0
    suppressed = 0
    while True:
        response = await client.list_bounces(
            message_stream=message_stream,
            bounce_type="HardBounce",
            from_date=from_date,
            to_date=to_date,
            count=page_size,
            offset=offset,
        )
        bounces = [item for item in response.get("Bounces", []) if isinstance(item, dict)]
        provider_total = int(response.get("TotalCount") or provider_total or len(bounces))
        for bounce in bounces:
            recipient = str(bounce.get("Email") or "").strip().lower()
            if not recipient or "@" not in recipient:
                continue
            message_id = str(bounce.get("MessageID") or "").strip() or None
            payload = {
                "RecordType": "Bounce",
                "MessageID": message_id,
                "Recipient": recipient,
                "Email": recipient,
                "ID": bounce.get("ID"),
                "BouncedAt": bounce.get("BouncedAt"),
                "Type": "HardBounce",
                "TypeCode": bounce.get("TypeCode"),
                "Description": bounce.get("Description"),
                "Details": bounce.get("Details"),
                "Tag": bounce.get("Tag"),
                "ServerID": bounce.get("ServerID"),
                "MessageStream": bounce.get("MessageStream") or message_stream,
            }
            before = await repository.is_suppressed(
                organizacion_id=organizacion_id,
                email_address=recipient,
            )
            await process_postmark_event(
                repository=repository,
                organizacion_id=organizacion_id,
                server_id=UUID(str(server["id"])),
                message_stream=message_stream,
                payload=payload,
                trace_id=f"polling-bounce:{bounce.get('ID')}:{message_id}",
                source="polling",
            )
            imported += 1
            if not before:
                suppressed += 1
        if len(bounces) < page_size or offset + len(bounces) >= provider_total:
            break
        offset += len(bounces)
    return {
        "provider_total": provider_total,
        "imported": imported,
        "new_suppressions": suppressed,
        "from_date": from_date,
        "to_date": to_date,
        "message_stream": message_stream,
    }
