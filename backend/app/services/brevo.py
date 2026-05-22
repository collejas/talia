"""Utilidades para procesar eventos de Brevo."""

from __future__ import annotations

from datetime import datetime, timezone
from email.utils import parseaddr
import re
from typing import Any, Sequence
from uuid import UUID

from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services.metrics import metrics
from app.services.prospeccion_auto_promoter import auto_promote_prospecto
from app.services.prospeccion_progress import progress_hub

logger = get_logger("brevo.webhook")

BREVO_EVENT_STATE = {
    "request": "enviado",
    "processed": "enviado",
    # Brevo puede reportar "deferred" de forma tardía/repetida; no debe reencolar.
    "deferred": "enviado",
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
MESSAGE_ID_PART_PATTERN = re.compile(r"<([^>]+)>")


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
    for key in (
        "message-id",
        "messageId",
        "message_ids",
        "messageIds",
        "messageUUID",
        "Message-Id",
        "Message-ID",
        "MessageId",
    ):
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
    for header_key in ("headers", "Headers"):
        headers = event.get(header_key)
        if not isinstance(headers, dict):
            continue
        for candidate in ("message-id", "Message-Id", "Message-ID"):
            header_value = headers.get(candidate)
            if isinstance(header_value, str):
                cleaned = header_value.strip("<> ").strip()
                if cleaned:
                    ids.append(cleaned)
    return ids


def _extract_message_id_tokens(raw: Any) -> list[str]:
    values: list[str] = []
    if isinstance(raw, str):
        values.append(raw)
    elif isinstance(raw, (list, tuple, set)):
        for item in raw:
            if isinstance(item, str):
                values.append(item)
    tokens: list[str] = []
    for value in values:
        for match in MESSAGE_ID_PART_PATTERN.findall(value):
            cleaned = _clean_text(match)
            if cleaned:
                tokens.append(cleaned)
        if "<" not in value and ">" not in value:
            for chunk in value.replace(",", " ").split():
                cleaned = _clean_text(chunk.strip("<>"))
                if cleaned:
                    tokens.append(cleaned)
    return list(dict.fromkeys(tokens))


def _extract_email(raw: Any) -> str | None:
    if isinstance(raw, dict):
        for key in ("email", "address", "from", "sender"):
            candidate = _extract_email(raw.get(key))
            if candidate:
                return candidate
        return None
    if isinstance(raw, list):
        for entry in raw:
            candidate = _extract_email(entry)
            if candidate:
                return candidate
        return None
    if not isinstance(raw, str):
        return None
    _, email = parseaddr(raw)
    normalized = _clean_text(email) or _clean_text(raw)
    if not normalized:
        return None
    lowered = normalized.lower()
    return lowered if "@" in lowered else None


def _extract_sender_name(raw: Any) -> str | None:
    if isinstance(raw, dict):
        for key in ("name", "sender_name", "display_name"):
            candidate = _clean_text(raw.get(key))
            if candidate:
                return candidate
        for key in ("from", "sender"):
            candidate = _extract_sender_name(raw.get(key))
            if candidate:
                return candidate
        return None
    if isinstance(raw, str):
        name, _ = parseaddr(raw)
        return _clean_text(name)
    return None


def _extract_inbound_email_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    # Los eventos transaccionales usan "event"; si viene ese campo se procesa por otro flujo.
    if _clean_text(payload.get("event")):
        return None
    sender_email = (
        _extract_email(payload.get("from"))
        or _extract_email(payload.get("sender"))
        or _extract_email(payload.get("fromEmail"))
        or _extract_email(payload.get("replyTo"))
        or _extract_email(payload.get("From"))
        or _extract_email(payload.get("Sender"))
        or _extract_email(payload.get("ReplyTo"))
    )
    if not sender_email:
        return None
    body_text = (
        _clean_text(payload.get("text"))
        or _clean_text(payload.get("textContent"))
        or _clean_text(payload.get("stripped-text"))
        or _clean_text(payload.get("plain"))
        or _clean_text(payload.get("Text"))
        or _clean_text(payload.get("TextBody"))
    )
    body_html = (
        _clean_text(payload.get("html"))
        or _clean_text(payload.get("htmlContent"))
        or _clean_text(payload.get("stripped-html"))
        or _clean_text(payload.get("Html"))
        or _clean_text(payload.get("HtmlBody"))
    )
    subject = _clean_text(payload.get("subject")) or _clean_text(payload.get("Subject"))
    in_reply_to = _extract_message_id_tokens(
        payload.get("inReplyTo")
        or payload.get("in-reply-to")
        or payload.get("In-Reply-To")
        or payload.get("InReplyTo")
        or (payload.get("Headers") or {}).get("In-Reply-To")
        or (payload.get("headers") or {}).get("in-reply-to")
    )
    references = _extract_message_id_tokens(
        payload.get("references")
        or payload.get("References")
        or (payload.get("Headers") or {}).get("References")
        or (payload.get("headers") or {}).get("references")
    )
    message_ids = _extract_message_ids(payload)
    if not message_ids:
        message_ids = _extract_message_id_tokens(
            payload.get("messageId")
            or payload.get("message-id")
            or payload.get("Message-Id")
            or payload.get("MessageId")
        )
    received_at = (
        _clean_text(payload.get("date"))
        or _clean_text(payload.get("Date"))
        or _clean_text(payload.get("CreatedAt"))
        or datetime.now(timezone.utc).isoformat()
    )
    return {
        "sender_email": sender_email,
        "sender_name": (
            _extract_sender_name(payload.get("from"))
            or _extract_sender_name(payload.get("sender"))
            or _extract_sender_name(payload.get("From"))
            or _extract_sender_name(payload.get("Sender"))
        ),
        "subject": subject,
        "body_text": body_text,
        "body_html": body_html,
        "in_reply_to": in_reply_to,
        "references": references,
        "message_ids": message_ids,
        "received_at": received_at,
    }


def _iter_brevo_inbound_payloads(event: dict[str, Any]) -> list[dict[str, Any]]:
    """Devuelve candidatos de payload inbound (soporta formato directo y wrapper items[])."""

    candidates: list[dict[str, Any]] = []
    if isinstance(event, dict):
        candidates.append(event)
        items = event.get("items")
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict):
                    candidates.append(item)
    return candidates


def _map_brevo_event(event_name: str | None) -> str | None:
    if not event_name:
        return None
    return BREVO_EVENT_STATE.get(event_name.strip().lower())


def _should_apply_brevo_state(*, current_state: str | None, incoming_state: str) -> bool:
    current = (current_state or "").strip().lower()
    incoming = (incoming_state or "").strip().lower()
    if not incoming:
        return False
    if not current:
        return True
    if current == incoming:
        return True

    # Estados terminales no deben degradarse por eventos tardíos.
    if current in {"entregado", "leido", "fallido", "omitido", "cancelado"}:
        return False

    if incoming == "pendiente":
        return current in {"pendiente", "procesando", "error"}

    rank = {
        "pendiente": 0,
        "procesando": 1,
        "enviado": 2,
        "entregado": 3,
        "leido": 4,
    }
    current_rank = rank.get(current)
    incoming_rank = rank.get(incoming)
    if current_rank is not None and incoming_rank is not None:
        return incoming_rank >= current_rank

    if incoming == "fallido":
        return current not in {"entregado", "leido", "omitido", "cancelado"}
    return True


async def _ensure_email_inbox_context(
    *,
    repo: CRMRepository,
    envio: dict[str, Any],
    inbound: dict[str, Any],
) -> tuple[UUID, UUID] | None:
    raw_org = envio.get("organizacion_id")
    try:
        org_uuid = UUID(str(raw_org)) if raw_org else None
    except (TypeError, ValueError):
        org_uuid = None
    if org_uuid is None:
        return None

    sender_email = _clean_text(inbound.get("sender_email"))
    if not sender_email:
        return None
    sender_name = _clean_text(inbound.get("sender_name"))
    prospecto_id_raw = envio.get("prospecto_id")
    prospecto: dict[str, Any] | None = None
    prospecto_uuid: UUID | None = None
    if prospecto_id_raw:
        try:
            prospecto_uuid = UUID(str(prospecto_id_raw))
            prospecto = await repo.worker_get_prospecto(prospecto_id=prospecto_uuid)
        except (TypeError, ValueError, CRMRepositoryError):
            prospecto = None

    persona = await repo.get_persona_by_email(email=sender_email, organizacion_id=org_uuid)
    if not persona:
        persona_payload: dict[str, Any] = {
            "nombre_completo": sender_name
            or _clean_text((prospecto or {}).get("display_name"))
            or sender_email.split("@")[0],
            "correo_principal": sender_email,
            "company_name": _clean_text((prospecto or {}).get("segmento")),
            "persona_datos": {
                "source": "prospeccion_email_inbound",
                "prospeccion_canal": "correo",
                **({"prospecto_id": str(prospecto_uuid)} if prospecto_uuid else {}),
            },
        }
        persona_payload = {key: value for key, value in persona_payload.items() if value not in (None, "")}
        persona = await repo.create_persona(organizacion_id=org_uuid, payload=persona_payload)
    persona_id = persona.get("id")
    try:
        contact_uuid = UUID(str(persona_id))
    except (TypeError, ValueError):
        return None

    conversation = await repo.get_latest_conversation_for_contact(contacto_id=contact_uuid, canal="manual")
    if not conversation:
        conversation = await repo.create_conversation(
            contacto_id=contact_uuid,
            canal="manual",
            estado="abierta",
        )
    conversation_id = conversation.get("id")
    try:
        conversation_uuid = UUID(str(conversation_id))
    except (TypeError, ValueError):
        return None
    return org_uuid, conversation_uuid


async def _record_inbound_email_message(
    *,
    repo: CRMRepository,
    envio: dict[str, Any],
    inbound: dict[str, Any],
) -> None:
    context = await _ensure_email_inbox_context(repo=repo, envio=envio, inbound=inbound)
    if not context:
        return
    org_uuid, conversation_uuid = context
    payload = envio.get("payload") if isinstance(envio.get("payload"), dict) else {}
    payload_metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    body_text = _clean_text(inbound.get("body_text")) or "(correo entrante sin texto)"
    message_ids = inbound.get("message_ids") if isinstance(inbound.get("message_ids"), list) else []
    provider_message_id = _clean_text(message_ids[0]) if message_ids else None
    in_reply_to = inbound.get("in_reply_to") if isinstance(inbound.get("in_reply_to"), list) else []
    references = inbound.get("references") if isinstance(inbound.get("references"), list) else []

    message_data: dict[str, Any] = {
        "channel": "correo",
        "source": "prospeccion",
        "action": "reply_inbound",
        "subject": _clean_text(inbound.get("subject")),
        "sender_email": _clean_text(inbound.get("sender_email")),
        "sender_name": _clean_text(inbound.get("sender_name")),
        "received_at": _clean_text(inbound.get("received_at")),
        "batch_id": str(envio.get("batch_id")) if envio.get("batch_id") else None,
        "envio_id": str(envio.get("id")) if envio.get("id") else None,
        "prospecto_id": str(envio.get("prospecto_id")) if envio.get("prospecto_id") else None,
        "campana_id": _clean_text(payload_metadata.get("campana_id")),
        "template_id": _clean_text(payload_metadata.get("template_id")),
        "message_id": provider_message_id,
        "in_reply_to": in_reply_to[0] if in_reply_to else None,
        "references": references,
    }
    message_data = {key: value for key, value in message_data.items() if value not in (None, "", [])}
    await repo.insert_inbox_message(
        conversation_id=conversation_uuid,
        direction="entrante",
        text=body_text,
        datos=message_data,
        estado="entregada",
        provider_message_id=provider_message_id,
        organizacion_id=org_uuid,
    )


async def process_brevo_inbound_emails(
    *,
    repo: CRMRepository,
    events: Sequence[dict[str, Any]],
) -> int:
    """Procesa payloads inbound de correo y marca envíos como respondidos."""

    processed = 0
    for event in events:
        if not isinstance(event, dict):
            continue
        for candidate_payload in _iter_brevo_inbound_payloads(event):
            inbound = _extract_inbound_email_payload(candidate_payload)
            if not inbound:
                continue

            candidate_ids: list[str] = []
            candidate_ids.extend(inbound.get("in_reply_to") or [])
            candidate_ids.extend(inbound.get("references") or [])
            envio: dict[str, Any] | None = None
            for message_id in candidate_ids:
                envio = await repo.worker_get_envio_by_mensaje(mensaje_id=message_id)
                if envio:
                    break
            if not envio:
                sender_email = _clean_text(inbound.get("sender_email"))
                if sender_email:
                    envio = await repo.worker_get_latest_envio_by_email(email=sender_email, canal="correo")
            if not envio:
                continue

            envio_id = envio.get("id")
            if not envio_id:
                continue
            try:
                envio_uuid = UUID(str(envio_id))
            except (TypeError, ValueError):
                continue

            detalle_actual = envio.get("detalle") if isinstance(envio.get("detalle"), dict) else {}
            brevo_reply = {
                "sender_email": _clean_text(inbound.get("sender_email")),
                "sender_name": _clean_text(inbound.get("sender_name")),
                "subject": _clean_text(inbound.get("subject")),
                "received_at": _clean_text(inbound.get("received_at")),
                "message_id": (inbound.get("message_ids") or [None])[0],
                "in_reply_to": (inbound.get("in_reply_to") or [None])[0],
                "preview": (_clean_text(inbound.get("body_text")) or "")[:500],
            }
            brevo_reply = {key: value for key, value in brevo_reply.items() if value not in (None, "")}
            merged_detalle = {
                **detalle_actual,
                "brevo_reply": brevo_reply,
                "reply_inbound_at": datetime.now(timezone.utc).isoformat(),
            }
            await repo.worker_complete_envio(
                envio_id=envio_uuid,
                payload={
                    "estado": "respondido",
                    "detalle": merged_detalle,
                    "error": None,
                    "procesado_en": datetime.now(timezone.utc).isoformat(),
                },
            )

            metrics.increment("correo", "respondido")
            batch_id_value = envio.get("batch_id")
            if batch_id_value:
                await progress_hub.publish(
                    str(batch_id_value),
                    {
                        "type": "reply",
                        "batch_id": str(batch_id_value),
                        "envio_id": str(envio_uuid),
                        "estado": "respondido",
                    },
                )
            try:
                await repo.worker_insert_contact_logs(
                    [
                        {
                            "organizacion_id": str(envio.get("organizacion_id")) if envio.get("organizacion_id") else None,
                            "prospecto_id": str(envio.get("prospecto_id")) if envio.get("prospecto_id") else None,
                            "canal": "correo",
                            "estado": "respondido",
                            "detalle": {
                                "action": "reply_inbound",
                                "subject": _clean_text(inbound.get("subject")),
                                "sender_email": _clean_text(inbound.get("sender_email")),
                                "message_id": (inbound.get("message_ids") or [None])[0],
                            },
                            "error": None,
                            "batch_id": str(batch_id_value) if batch_id_value else None,
                            "envio_id": str(envio_uuid),
                        }
                    ]
                )
            except CRMRepositoryError as exc:
                log_event(logger, "brevo.inbound_log_failed", error=str(exc))
            await auto_promote_prospecto(
                prospecto_id=envio.get("prospecto_id"),
                canal="correo",
                estado="respondido",
                repo=repo,
            )
            try:
                await _record_inbound_email_message(repo=repo, envio=envio, inbound=inbound)
            except CRMRepositoryError as exc:
                log_event(logger, "brevo.inbound_inbox_record_failed", error=str(exc))
            if batch_id_value:
                try:
                    batch_state = await repo.worker_sync_batch_status(batch_id=UUID(str(batch_id_value)))
                except (ValueError, CRMRepositoryError) as exc:
                    log_event(
                        logger,
                        "brevo.inbound_batch_sync_failed",
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
        event_name = _clean_text(event.get("event")) or ""
        estado = _map_brevo_event(event_name)
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
                "event": event_name,
                "email": event.get("email"),
                "date": event.get("date"),
                "reason": event.get("reason") or event.get("description"),
                "tag": event.get("tag"),
                "message_id": message_id,
            }
            brevo_info = {k: v for k, v in brevo_info.items() if v}

            duplicate_event = False
            try:
                duplicate_event = await repo.worker_has_brevo_log_event(
                    envio_id=envio_uuid,
                    estado=estado,
                    message_id=message_id,
                    event_name=event_name,
                    event_date=_clean_text(event.get("date")),
                )
            except CRMRepositoryError as exc:
                log_event(logger, "brevo.webhook_duplicate_lookup_failed", error=str(exc))
            if duplicate_event:
                log_event(
                    logger,
                    "brevo.webhook_duplicate_ignored",
                    envio_id=str(envio_uuid),
                    message_id=message_id,
                    event=event_name,
                )
                continue

            current_state = _clean_text(envio.get("estado"))
            if not _should_apply_brevo_state(current_state=current_state, incoming_state=estado):
                log_event(
                    logger,
                    "brevo.webhook_state_regression_ignored",
                    envio_id=str(envio_uuid),
                    estado_actual=current_state,
                    estado_evento=estado,
                    event=event_name,
                )
                continue

            merged_detalle = {**detalle_actual, "brevo": brevo_info}
            if estado != "fallido":
                reason_value = _clean_text(merged_detalle.get("reason"))
                if reason_value in {"per_minute_limit", "cooldown"}:
                    merged_detalle.pop("reason", None)
                    merged_detalle.pop("throttle_scope", None)
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
            if event_name.lower() == "unsubscribe":
                raw_org = envio.get("organizacion_id")
                try:
                    org_uuid = UUID(str(raw_org)) if raw_org else None
                except (TypeError, ValueError):
                    org_uuid = None
                suppression_email = _clean_text(event.get("email")) or _clean_text(
                    (envio.get("detalle") if isinstance(envio.get("detalle"), dict) else {}).get("email")
                )
                if org_uuid and suppression_email:
                    try:
                        await repo.worker_create_contact_suppression(
                            payload={
                                "organizacion_id": str(org_uuid),
                                "canal": "correo",
                                "prospecto_id": (
                                    str(envio.get("prospecto_id")) if envio.get("prospecto_id") else None
                                ),
                                "email": suppression_email.lower(),
                                "motivo": "brevo_unsubscribe",
                                "origen": "brevo_webhook",
                                "activo": True,
                                "metadata": {
                                    "event": event.get("event"),
                                    "message_id": message_id,
                                    "date": event.get("date"),
                                },
                            }
                        )
                    except CRMRepositoryError as exc:
                        log_event(
                            logger,
                            "brevo.webhook_suppression_create_failed",
                            error=str(exc),
                            email=suppression_email,
                        )
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
                "organizacion_id": str(envio.get("organizacion_id")) if envio.get("organizacion_id") else None,
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
            else:
                await auto_promote_prospecto(
                    prospecto_id=envio.get("prospecto_id"),
                    canal="correo",
                    estado=estado,
                    repo=repo,
                )
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
