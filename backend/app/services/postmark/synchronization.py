"""Conciliación del historial de Postmark con los mensajes de Talia."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
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


async def _synchronize_message_events(
    *,
    client: PostmarkClient,
    repository: PostmarkRepository,
    organizacion_id: UUID,
    server_id: UUID,
    message_stream: str,
    item: dict[str, Any],
    semaphore: asyncio.Semaphore,
) -> int:
    """Importa los eventos de un mensaje con concurrencia limitada."""
    message_id = str(item.get("MessageID") or "").strip()
    if not message_id:
        return 0
    async with semaphore:
        details = await asyncio.wait_for(
            client.get_outbound_message_details(message_id),
            timeout=15,
        )
        recipient = _recipient(details) or _recipient(item)
        processed = 0
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
                server_id=server_id,
                message_stream=message_stream,
                payload=payload,
                trace_id=f"polling:{message_id}:{record_type}:{received_at}",
                source="polling",
            )
            processed += 1
        return processed


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
    server_id = UUID(str(server["id"]))
    run_from = from_date or "1970-01-01T00:00:00+00:00"
    run_to = to_date or datetime.now(timezone.utc).isoformat()
    run = await repository.create_sync_run(
        payload={
            "organizacion_id": str(organizacion_id),
            "server_id": str(server_id),
            "sync_type": "messages",
            "message_stream": message_stream,
            "from_date": run_from,
            "to_date": run_to,
            "status": "running",
        }
    )
    run_id = UUID(str(run["id"]))
    client = PostmarkClient(server_token=token)
    try:
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
            server_id=server_id,
            external_ids=external_ids,
        )
        local_by_external = {str(row.get("external_message_id")): row for row in local_rows}
        semaphore = asyncio.Semaphore(20)
        matched_items = [
            item for item in messages
            if str(item.get("MessageID") or "").strip() in local_by_external
        ]
        event_results = await asyncio.gather(*(
            _synchronize_message_events(
                client=client,
                repository=repository,
                organizacion_id=organizacion_id,
                server_id=server_id,
                message_stream=message_stream,
                item=item,
                semaphore=semaphore,
            )
            for item in matched_items
        ), return_exceptions=True)
        matched = len(matched_items)
        detail_errors = [item for item in event_results if isinstance(item, Exception)]
        events = sum(item for item in event_results if isinstance(item, int))
        provider_total = int(response.get("TotalCount") or len(messages))
        next_offset = max(offset, 0) + len(messages)
        await repository.update_sync_run(
            run_id=run_id,
            payload={
                "status": "completed",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "pages_processed": 1,
                "provider_records": len(messages),
                "events_processed": events,
                "matched_records": matched,
                "unmatched_records": max(0, len(messages) - matched),
                "error_code": "message_details_partial_failure" if detail_errors else None,
                "error_message": (
                    f"{len(detail_errors)} detalles no pudieron importarse"
                    if detail_errors else None
                ),
            },
        )
        await repository.upsert_sync_checkpoint(
            payload={
                "organizacion_id": str(organizacion_id),
                "server_id": str(server_id),
                "sync_type": "messages",
                "message_stream": message_stream,
                "window_from": from_date,
                "window_to": to_date,
                "next_offset": next_offset,
                "last_provider_total": provider_total,
                "last_run_id": str(run_id),
                "last_success_at": datetime.now(timezone.utc).isoformat(),
                "locked_at": None,
            }
        )
        return {
            "provider_messages": len(messages),
            "provider_total": provider_total,
            "matched_messages": matched,
            "processed_events": events,
            "from_date": from_date,
            "to_date": to_date,
        }
    except Exception as exc:
        await repository.update_sync_run(
            run_id=run_id,
            payload={
                "status": "failed",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "error_code": type(exc).__name__,
                "error_message": str(exc)[:2000],
            },
        )
        raise


async def synchronize_hard_bounces(
    *,
    repository: PostmarkRepository,
    organizacion_id: UUID,
    from_date: str | None = None,
    to_date: str | None = None,
    message_stream: str = "broadcast",
    count: int = 500,
    offset: int = 0,
    single_page: bool = False,
) -> dict[str, int | str | None]:
    """Importa HardBounce históricos y crea supresiones por tenant.

    ``single_page`` permite que el worker avance por checkpoint sin mantener
    una ejecución larga ni repetir páginas ya confirmadas.
    """
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
    server_id = UUID(str(server["id"]))
    run_from = from_date or "1970-01-01T00:00:00+00:00"
    run_to = to_date or datetime.now(timezone.utc).isoformat()
    run = await repository.create_sync_run(
        payload={
            "organizacion_id": str(organizacion_id),
            "server_id": str(server_id),
            "sync_type": "bounces",
            "message_stream": message_stream,
            "from_date": run_from,
            "to_date": run_to,
            "status": "running",
        }
    )
    run_id = UUID(str(run["id"]))
    client = PostmarkClient(server_token=token)
    page_size = max(1, min(count, 500))
    offset = max(offset, 0)
    provider_total = 0
    imported = 0
    suppressed = 0
    pages_processed = 0
    try:
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
            pages_processed += 1
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
                    server_id=server_id,
                    message_stream=message_stream,
                    payload=payload,
                    trace_id=f"polling-bounce:{bounce.get('ID')}:{message_id}",
                    source="polling",
                )
                imported += 1
                if not before:
                    suppressed += 1

            next_offset = offset + len(bounces)
            finished = len(bounces) < page_size or next_offset >= provider_total
            await repository.upsert_sync_checkpoint(
                payload={
                    "organizacion_id": str(organizacion_id),
                    "server_id": str(server_id),
                    "sync_type": "bounces",
                    "message_stream": message_stream,
                    "window_from": run_from,
                    "window_to": run_to,
                    "next_offset": next_offset,
                    "last_provider_total": provider_total,
                    "last_run_id": str(run_id),
                    "last_success_at": datetime.now(timezone.utc).isoformat() if finished else None,
                    "locked_at": None if (finished or single_page) else datetime.now(timezone.utc).isoformat(),
                }
            )
            if single_page or finished:
                await repository.update_sync_run(
                    run_id=run_id,
                    payload={
                        "status": "completed",
                        "finished_at": datetime.now(timezone.utc).isoformat(),
                        "pages_processed": pages_processed,
                        "provider_records": imported,
                        "matched_records": imported,
                    },
                )
                return {
                    "provider_total": provider_total,
                    "imported": imported,
                    "new_suppressions": suppressed,
                    "next_offset": next_offset,
                    "complete": finished,
                    "from_date": from_date,
                    "to_date": to_date,
                    "message_stream": message_stream,
                }
            offset = next_offset
    except Exception as exc:
        await repository.update_sync_run(
            run_id=run_id,
            payload={
                "status": "failed",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "error_code": type(exc).__name__,
                "error_message": str(exc)[:2000],
            },
        )
        await repository.upsert_sync_checkpoint(
            payload={
                "organizacion_id": str(organizacion_id),
                "server_id": str(server_id),
                "sync_type": "bounces",
                "message_stream": message_stream,
                "window_from": run_from,
                "window_to": run_to,
                "next_offset": offset,
                "last_provider_total": provider_total or None,
                "last_run_id": str(run_id),
                "locked_at": None,
            }
        )
        raise
