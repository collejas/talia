"""Utilidades para procesar eventos de Brevo."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Sequence
from uuid import UUID

from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services.metrics import metrics
from app.services.prospeccion_progress import progress_hub

logger = get_logger("brevo.webhook")

BREVO_EVENT_STATE = {
    "request": "enviado",
    "processed": "enviado",
    "deferred": "pendiente",
    "delivered": "entregado",
    "opened": "entregado",
    "unique_opened": "entregado",
    "click": "entregado",
    "unique_click": "entregado",
    "soft_bounce": "fallido",
    "hard_bounce": "fallido",
    "blocked": "fallido",
    "spam": "fallido",
    "invalid": "fallido",
    "error": "fallido",
    "unsubscribe": "fallido",
}


def _clean_text(value: Any) -> str | None:
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    if value is None:
        return None
    trimmed = str(value).strip()
    return trimmed or None


def _extract_message_ids(event: dict[str, Any]) -> list[str]:
    ids: list[str] = []
    for key in ("message-id", "messageId", "message_ids", "messageIds", "messageUUID"):
        value = event.get(key)
        if isinstance(value, str):
            cleaned = value.strip("<> ").strip()
            if cleaned:
                ids.append(cleaned)
        elif isinstance(value, (list, tuple, set)):
            for item in value:
                if isinstance(item, str):
                    cleaned = item.strip("<> ").strip()
                    if cleaned:
                        ids.append(cleaned)
    if not ids and isinstance(event.get("headers"), dict):
        header_value = event["headers"].get("message-id")
        if isinstance(header_value, str):
            cleaned = header_value.strip("<> ").strip()
            if cleaned:
                ids.append(cleaned)
    return ids


def _map_brevo_event(event_name: str | None) -> str | None:
    if not event_name:
        return None
    return BREVO_EVENT_STATE.get(event_name.strip().lower())


async def process_brevo_events(
    *,
    repo: CRMRepository,
    events: Sequence[dict[str, Any]],
) -> int:
    """Actualiza envíos de correo con base en los webhooks de Brevo."""

    processed = 0
    for event in events:
        if not isinstance(event, dict):
            continue
        estado = _map_brevo_event(_clean_text(event.get("event")))
        if not estado:
            continue
        message_ids = _extract_message_ids(event)
        if not message_ids:
            continue
        for message_id in message_ids:
            try:
                envio = await repo.worker_get_envio_by_mensaje(mensaje_id=message_id)
            except CRMRepositoryError as exc:
                log_event(logger, "brevo.webhook_envio_lookup_failed", error=str(exc))
                continue
            if not envio:
                continue
            envio_id = envio.get("id")
            if not envio_id:
                continue
            try:
                envio_uuid = UUID(str(envio_id))
            except (TypeError, ValueError):
                log_event(logger, "brevo.webhook_invalid_envio_id", envio_id=envio_id)
                continue
            detalle_actual = envio.get("detalle") if isinstance(envio.get("detalle"), dict) else {}
            brevo_info = {
                "event": event.get("event"),
                "email": event.get("email"),
                "date": event.get("date"),
                "reason": event.get("reason") or event.get("description"),
                "tag": event.get("tag"),
                "message_id": message_id,
            }
            brevo_info = {k: v for k, v in brevo_info.items() if v}
            merged_detalle = {**detalle_actual, "brevo": brevo_info}
            payload = {
                "estado": estado,
                "detalle": merged_detalle,
                "error": brevo_info.get("reason") if estado == "fallido" else None,
                "procesado_en": datetime.now(timezone.utc).isoformat(),
            }
            try:
                await repo.worker_complete_envio(envio_id=envio_uuid, payload=payload)
            except CRMRepositoryError as exc:
                log_event(
                    logger,
                    "brevo.webhook_envio_update_failed",
                    error=str(exc),
                    envio_id=str(envio_uuid),
                )
                continue
            metrics.increment("correo", estado)
            batch_id_value = envio.get("batch_id")
            if batch_id_value:
                await progress_hub.publish(
                    str(batch_id_value),
                    {
                        "type": "envio",
                        "batch_id": str(batch_id_value),
                        "envio_id": str(envio_uuid),
                        "estado": estado,
                    },
                )
            log_entry = {
                "prospecto_id": str(envio.get("prospecto_id")) if envio.get("prospecto_id") else None,
                "canal": "correo",
                "estado": estado,
                "detalle": brevo_info,
                "error": brevo_info.get("reason") if estado == "fallido" else None,
                "batch_id": str(batch_id_value) if batch_id_value else None,
                "envio_id": str(envio_uuid),
            }
            try:
                await repo.worker_insert_contact_logs([log_entry])
            except CRMRepositoryError as exc:
                log_event(logger, "brevo.webhook_log_failed", error=str(exc))
            if batch_id_value:
                try:
                    batch_state = await repo.worker_sync_batch_status(batch_id=UUID(str(batch_id_value)))
                except (ValueError, CRMRepositoryError) as exc:
                    log_event(
                        logger,
                        "brevo.webhook_batch_sync_failed",
                        error=str(exc),
                        batch_id=batch_id_value,
                    )
                else:
                    if batch_state:
                        await progress_hub.publish(
                            str(batch_id_value),
                            {
                                "type": "batch",
                                "batch_id": str(batch_id_value),
                                "estado": batch_state,
                            },
                        )
            processed += 1
    return processed


__all__ = ["process_brevo_events"]
