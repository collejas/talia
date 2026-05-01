"""Rutinas de seguimiento para conversaciones webchat."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from app.assistants.tool_runtime import ToolRuntimeContext
from app.channels.whatsapp import tools as whatsapp_tools
from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services.sales_notification_jobs import enqueue_webchat_sales_notification
from app.services.non_critical_job_gate import should_defer_non_critical_jobs
from app.services import storage
from app.services.storage import StorageError

logger = get_logger("app.services.webchat_followups")
_CLOSURE_RESCUE_LOOKBACK_HOURS = 24

FIELD_LABELS = {
    "email": "tu correo electrónico",
    "phone": "tu teléfono",
    "company": "el nombre de tu empresa",
    "need": "qué estás buscando resolver",
}

REENGAGE_TEMPLATE_DEFAULT = (
    "¿Seguimos? Puedo compartirte ejemplos y agendar una demo en cuanto me confirmes los datos "
    "pendientes."
)

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    return {}


def _strip_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    return ""


def _has_value(value: Any) -> bool:
    return bool(_strip_text(value))


def _load_contact_data(contact: dict[str, Any]) -> dict[str, Any]:
    raw = contact.get("persona_datos") or contact.get("contacto_datos") or contact.get("metadata")
    if isinstance(raw, dict):
        return dict(raw)
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return dict(parsed)
    return {}


def _prepare_followup_scope(
    contact_data: dict[str, Any], conversation_id: str
) -> tuple[dict[str, Any], dict[str, Any], bool]:
    followup = _ensure_dict(contact_data.get("webchat_followup"))
    state = _ensure_dict(followup.get("state"))
    conversation_key = _strip_text(conversation_id)
    current_conv = _strip_text(followup.get("current_conversation_id"))
    changed = False
    if conversation_key and current_conv != conversation_key:
        state = {}
        followup["state"] = state
        followup["current_conversation_id"] = conversation_key
        changed = True
    elif "state" not in followup:
        followup["state"] = state
        changed = True
    else:
        # state es una copia aislada; re-enlazar evita perder cambios posteriores.
        previous_state = followup.get("state")
        followup["state"] = state
        if previous_state != state:
            changed = True
    return followup, state, changed


def _mark_timestamp(target: dict[str, Any], key: str) -> bool:
    timestamp_key = f"{key}_captured_at"
    if timestamp_key in target:
        return False
    target[timestamp_key] = _now_iso()
    return True


async def refresh_contact_followup_state(
    *,
    conversation_id: str,
    contact_id: str,
    session_id: str | None = None,
    contact: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Actualiza persona_datos.webchat_followup con el progreso actual."""
    contact_row = contact or await storage.fetch_persona(contact_id)
    contact_data = _load_contact_data(contact_row)
    followup, state, changed = _prepare_followup_scope(contact_data, conversation_id)

    original_fields = state.get("fields")
    fields = dict(original_fields) if isinstance(original_fields, dict) else {}

    has_email = _has_value(contact_row.get("correo"))
    has_phone = _has_value(contact_row.get("telefono_e164"))
    has_company = _has_value(contact_row.get("company_name"))
    has_need = _has_value(contact_row.get("necesidad_proposito"))

    if has_email:
        changed |= _mark_timestamp(fields, "email")
    if has_phone:
        changed |= _mark_timestamp(fields, "phone")
    if has_company:
        changed |= _mark_timestamp(fields, "company")
    if has_need:
        changed |= _mark_timestamp(fields, "need")

    if fields and fields != original_fields:
        state["fields"] = fields
        changed = True
    elif not fields and isinstance(original_fields, dict) and original_fields:
        # Preserve previous non-empty dict even if it matches
        state["fields"] = original_fields

    if session_id and session_id != state.get("last_session_id"):
        state["last_session_id"] = session_id
        changed = True

    if (has_email or has_phone) and not state.get("contact_ready_at"):
        state["contact_ready_at"] = _now_iso()
        changed = True

    if has_email and has_phone and has_company and has_need and not state.get("datos_completos_at"):
        state["datos_completos_at"] = _now_iso()
        changed = True

    if changed:
        contact_data["webchat_followup"] = followup
        await storage.update_persona(contact_id, {"persona_datos": contact_data})
        log_event(
            logger,
            "webchat_followup.state_updated",
            conversation_id=conversation_id,
            contact_id=contact_id,
        )
    return state


async def ensure_contact_ready_for_assignment(
    *,
    conversation_id: str,
    contact_id: str,
    contact: dict[str, Any] | None = None,
) -> bool:
    """Verifica y marca que el contacto tiene al menos teléfono o correo."""
    contact_row = contact or await storage.fetch_persona(contact_id)
    has_phone = _has_value(contact_row.get("telefono_e164"))
    has_email = _has_value(contact_row.get("correo"))
    if not (has_phone or has_email):
        return False
    await refresh_contact_followup_state(
        conversation_id=conversation_id,
        contact_id=contact_id,
        contact=contact_row,
    )
    return True


async def mark_information_delivered(
    *,
    conversation_id: str,
    contact_id: str,
    reason: str,
) -> None:
    """Marca el punto en el que ya se envió información o se agendó demo."""
    contact = await storage.fetch_persona(contact_id)
    contact_data = _load_contact_data(contact)
    followup, state, changed = _prepare_followup_scope(contact_data, conversation_id)
    delivery_ts = state.get("entrega_realizada_at")
    if not delivery_ts:
        state["entrega_realizada_at"] = _now_iso()
        state["entrega_reason"] = reason
        if not state.get("stop_reason"):
            state["stop_reason"] = "entrega"
        changed = True
    elif reason and state.get("entrega_reason") != reason:
        state["entrega_reason"] = reason
        changed = True

    if changed:
        contact_data["webchat_followup"] = followup
        await storage.update_persona(contact_id, {"persona_datos": contact_data})
        log_event(
            logger,
            "webchat_followup.delivery_marked",
            conversation_id=conversation_id,
            contact_id=contact_id,
            reason=reason,
        )


def _missing_required_fields(contact: dict[str, Any]) -> list[str]:
    missing: list[str] = []
    if not _has_value(contact.get("telefono_e164")):
        missing.append("phone")
    if not _has_value(contact.get("correo")):
        missing.append("email")
    if not _has_value(contact.get("company_name")):
        missing.append("company")
    if not _has_value(contact.get("necesidad_proposito")):
        missing.append("need")
    return missing


def _join_with_commas(items: list[str]) -> str:
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " y " + items[-1]


def _build_reengage_message(missing_fields: list[str]) -> str:
    if not missing_fields:
        return REENGAGE_TEMPLATE_DEFAULT
    remaining = list(missing_fields)
    parts: list[str] = []

    if "phone" in remaining and "email" in remaining:
        parts.append("tu teléfono o correo")
        remaining = [field for field in remaining if field not in {"phone", "email"}]
    else:
        if "phone" in remaining:
            parts.append(FIELD_LABELS["phone"])
            remaining.remove("phone")
        if "email" in remaining:
            parts.append(FIELD_LABELS["email"])
            remaining.remove("email")

    for field in remaining:
        label = FIELD_LABELS.get(field)
        if label:
            parts.append(label)

    fields_text = _join_with_commas(parts)
    if not fields_text:
        return REENGAGE_TEMPLATE_DEFAULT
    return (
        f"¿Me ayudas con {fields_text}? Con eso preparo los ejemplos y la demo que platicamos."
    )


def _manual_override(conversation: dict[str, Any]) -> bool:
    controls = conversation.get("conversaciones_controles")
    if isinstance(controls, dict):
        return bool(controls.get("manual_override"))
    return False


def _parse_ts(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(text).astimezone(timezone.utc)
        except ValueError:
            return None
    return None


def _should_stop(state: dict[str, Any]) -> bool:
    if not state:
        return False
    stop_reason = _strip_text(state.get("stop_reason"))
    if stop_reason:
        return True
    if state.get("entrega_realizada_at"):
        return True
    return False


async def mark_stop_reason(
    *,
    conversation_id: str,
    contact_id: str,
    reason: str,
) -> None:
    contact = await storage.fetch_persona(contact_id)
    contact_data = _load_contact_data(contact)
    followup, state, changed = _prepare_followup_scope(contact_data, conversation_id)
    current_reason = _strip_text(state.get("stop_reason"))
    if current_reason == reason:
        return
    state["stop_reason"] = reason
    state["stop_reason_set_at"] = _now_iso()
    if reason == "session_closed":
        state["session_closed_at"] = _now_iso()
    contact_data["webchat_followup"] = followup
    await storage.update_persona(contact_id, {"persona_datos": contact_data})
    log_event(
        logger,
        "webchat_followup.stop_reason_marked",
        conversation_id=conversation_id,
        contact_id=contact_id,
        reason=reason,
    )


async def record_reengage_attempt(
    *,
    conversation_id: str,
    contact_id: str,
    sent_at: datetime,
    message: str | None = None,
) -> None:
    contact = await storage.fetch_persona(contact_id)
    contact_data = _load_contact_data(contact)
    followup, state, _ = _prepare_followup_scope(contact_data, conversation_id)
    reengage = _ensure_dict(state.get("reengage"))
    attempts = int(reengage.get("attempts") or 0) + 1
    reengage.update(
        {
            "attempts": attempts,
            "sent_at": sent_at.astimezone(timezone.utc).isoformat(),
        }
    )
    if message:
        reengage["last_message"] = message
    state["reengage"] = reengage
    contact_data["webchat_followup"] = followup
    await storage.update_persona(contact_id, {"persona_datos": contact_data})
    log_event(
        logger,
        "webchat_followup.reengage_recorded",
        conversation_id=conversation_id,
        contact_id=contact_id,
        attempts=attempts,
    )


async def _escalate_due_to_attempt_limit(
    *,
    repo: CRMRepository,
    conversation: dict[str, Any],
    contact: dict[str, Any],
    conversation_id: str,
    contact_id: str,
    missing_fields: list[str],
    attempts: int,
) -> None:
    try:
        oportunidad_id = await storage.ensure_conversation_opportunity(
            conversation_id=conversation_id,
            contact_id=contact_id,
            channel="webchat",
        )
    except StorageError as exc:
        logger.warning(
            "webchat.followup.escalate.ensure_failed",
            extra={
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "error": str(exc),
            },
        )
        return

    if not oportunidad_id:
        return

    org_id = contact.get("organizacion_id") or conversation.get("organizacion_id")
    if not org_id:
        logger.warning(
            "webchat.followup.escalate.org_missing",
            extra={"conversation_id": conversation_id, "contact_id": contact_id},
        )
        return

    try:
        org_uuid = UUID(str(org_id))
        opp_uuid = UUID(str(oportunidad_id))
    except (TypeError, ValueError):
        logger.warning(
            "webchat.followup.escalate.invalid_ids",
            extra={"conversation_id": conversation_id, "contact_id": contact_id},
        )
        return

    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "webchat.followup.escalate.fetch_failed",
            extra={
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "error": str(exc),
            },
        )
        return

    if not opportunity:
        logger.warning(
            "webchat.followup.escalate.opportunity_missing",
            extra={"conversation_id": conversation_id, "contact_id": contact_id},
        )
        return

    metadata = _ensure_dict(opportunity.get("metadata"))
    notifications = _ensure_dict(metadata.get("sales_notifications"))
    if notifications.get("webchat_escalate"):
        log_event(
            logger,
            "webchat.followup.escalate_skipped_duplicate",
            conversation_id=conversation_id,
            contact_id=contact_id,
        )
        return

    assigned = opportunity.get("asignado") or {}
    seller_id = assigned.get("id")
    seller_phone = assigned.get("telefono_e164") or assigned.get("telefono")
    if not seller_id or not seller_phone:
        logger.warning(
            "webchat.followup.escalate.no_seller",
            extra={
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "attempts": attempts,
            },
        )
        return

    context = ToolRuntimeContext(
        conversation_id=conversation_id,
        contact_id=contact_id,
        channel="webchat",
    )
    resumen = str(contact.get("necesidad_proposito") or contact.get("notes") or "").strip() or None
    notes = str(contact.get("notes") or "").strip() or None
    email = str(contact.get("correo") or "").strip() or None

    try:
        await whatsapp_tools._notify_sales_rep(
            context=context,
            trigger="webchat_escalate",
            contact=contact,
            opportunity_id=str(opportunity.get("id")),
            resumen=resumen,
            notes=notes,
            email=email,
            extra={
                "reason": "max_reengage_attempts",
                "attempts": attempts,
                "missing_fields": missing_fields,
            },
        )
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "webchat.followup.escalate_failed",
            extra={
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "error": str(exc),
            },
        )
        return

    await mark_stop_reason(
        conversation_id=conversation_id,
        contact_id=contact_id,
        reason="reengage_limit",
    )
    log_event(
        logger,
        "webchat.followup.escalated",
        conversation_id=conversation_id,
        contact_id=contact_id,
        attempts=attempts,
        missing_fields=",".join(missing_fields),
    )


def _escalate_delay_reached(
    reference_time: datetime,
    reengage_sent_at: datetime | None,
    last_out: datetime | None,
) -> bool:
    delay_minutes = max(0, settings.webchat_escalate_minutes)
    if delay_minutes <= 0:
        return True
    baseline = reengage_sent_at or last_out
    if not baseline:
        return True
    return (reference_time - baseline) >= timedelta(minutes=delay_minutes)


async def run_followups(*, now: datetime | None = None, limit: int | None = None) -> None:
    """Ejecuta el flujo automático de reenganche para canales webchat."""
    await run_followups_with_cursor(now=now, limit=limit)


def _extract_cursor(conversation: dict[str, Any]) -> tuple[datetime, str] | None:
    convo_id = _strip_text(conversation.get("id"))
    last_out = _parse_ts(conversation.get("ultimo_saliente_en"))
    if not convo_id or not last_out:
        return None
    return last_out, convo_id


async def run_followups_with_cursor(
    *,
    now: datetime | None = None,
    limit: int | None = None,
    cursor_last_out: datetime | None = None,
    cursor_last_id: str | None = None,
) -> tuple[datetime | None, str | None]:
    """Ejecuta el flujo automático de reenganche para canales webchat."""
    reference = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    reengage_delta = timedelta(minutes=max(1, settings.webchat_reengage_minutes))
    cutoff = reference - reengage_delta
    batch_limit = limit or 50
    repo = CRMRepository()
    active_cursor_out = cursor_last_out
    active_cursor_id = _strip_text(cursor_last_id)
    try:
        conversations = await repo.list_webchat_conversations_for_followup(
            inactive_since=cutoff,
            limit=batch_limit,
            cursor_last_out=active_cursor_out,
            cursor_last_id=active_cursor_id,
        )
    except CRMRepositoryError as exc:
        logger.warning("webchat.followup.list_failed", extra={"error": str(exc)})
        return active_cursor_out, (active_cursor_id or None)

    if not conversations and active_cursor_out and active_cursor_id:
        try:
            conversations = await repo.list_webchat_conversations_for_followup(
                inactive_since=cutoff,
                limit=batch_limit,
            )
            if conversations:
                logger.info("webchat.followup.cursor_wrapped")
                active_cursor_out = None
                active_cursor_id = None
        except CRMRepositoryError as exc:
            logger.warning("webchat.followup.list_failed", extra={"error": str(exc)})
            return active_cursor_out, (active_cursor_id or None)

    for conversation in conversations:
        try:
            await _process_conversation(
                repo=repo,
                conversation=conversation,
                reference_time=reference,
            )
        except Exception as exc:  # pragma: no cover
            logger.exception(
                "webchat.followup.unexpected_error",
                extra={"conversation_id": conversation.get("id"), "error": str(exc)},
            )
    last_cursor = _extract_cursor(conversations[-1]) if conversations else None
    if last_cursor is None:
        return active_cursor_out, (active_cursor_id or None)
    return last_cursor


async def _process_conversation(
    *,
    repo: CRMRepository,
    conversation: dict[str, Any],
    reference_time: datetime,
) -> None:
    if _manual_override(conversation):
        return
    state_value = _strip_text(conversation.get("estado")).lower()
    if state_value == "cerrada":
        return
    convo_id = conversation.get("id")
    contact_id = conversation.get("contacto_id")
    if not convo_id or not contact_id:
        return
    conversation_id = str(convo_id)
    contact_id_str = str(contact_id)
    last_out = _parse_ts(conversation.get("ultimo_saliente_en"))
    if not last_out or last_out > reference_time:
        return
    last_in = _parse_ts(conversation.get("ultimo_entrante_en"))
    if last_in and last_in > last_out:
        return

    try:
        contact = await storage.fetch_persona(contact_id_str)
    except StorageError as exc:
        logger.warning(
            "webchat.followup.contact_failed",
            extra={"conversation_id": conversation_id, "contact_id": contact_id_str, "error": str(exc)},
        )
        return

    state = await refresh_contact_followup_state(
        conversation_id=conversation_id,
        contact_id=contact_id_str,
        contact=contact,
    )
    state = state or {}
    if _should_stop(state):
        return

    missing_fields = _missing_required_fields(contact)
    reengage_meta = _ensure_dict(state.get("reengage"))
    attempts = int(reengage_meta.get("attempts") or 0)
    reengage_sent_at = _parse_ts(reengage_meta.get("sent_at"))
    if attempts >= settings.webchat_reengage_max_attempts:
        if _escalate_delay_reached(reference_time, reengage_sent_at, last_out):
            await _escalate_due_to_attempt_limit(
                repo=repo,
                conversation=conversation,
                contact=contact,
                conversation_id=conversation_id,
                contact_id=contact_id_str,
                missing_fields=missing_fields,
                attempts=attempts,
            )
        else:
            log_event(
                logger,
                "webchat.followup.escalate_pending",
                conversation_id=conversation_id,
                contact_id=contact_id_str,
                wait_minutes=max(0, settings.webchat_escalate_minutes),
            )
        return

    session_id = _strip_text(state.get("last_session_id"))
    if not session_id:
        try:
            session_id = await storage.fetch_webchat_session_id_by_persona(contact_id_str)
        except StorageError as exc:
            logger.warning(
                "webchat.followup.session_lookup_failed",
                extra={"conversation_id": conversation_id, "contact_id": contact_id_str, "error": str(exc)},
            )
            session_id = None
    if not session_id:
        log_event(
            logger,
            "webchat.followup.skipped_no_session",
            conversation_id=conversation_id,
            contact_id=contact_id_str,
        )
        return

    if state.get("last_session_id") != session_id:
        state = (
            await refresh_contact_followup_state(
                conversation_id=conversation_id,
                contact_id=contact_id_str,
                contact=contact,
                session_id=session_id,
            )
            or state
        )

    if await _session_closed_after(repo=repo, session_id=session_id, reference_ts=last_out):
        await mark_stop_reason(
            conversation_id=conversation_id,
            contact_id=contact_id_str,
            reason="session_closed",
        )
        log_event(
            logger,
            "webchat.followup.skipped_session_closed",
            conversation_id=conversation_id,
            contact_id=contact_id_str,
        )
        return

    message = _build_reengage_message(missing_fields)
    if not await _send_reengage_message(
        session_id=session_id,
        conversation_id=conversation_id,
        message=message,
    ):
        return

    await record_reengage_attempt(
        conversation_id=conversation_id,
        contact_id=contact_id_str,
        sent_at=reference_time,
        message=message,
    )
    log_event(
        logger,
        "webchat.followup.reengage_sent",
        conversation_id=conversation_id,
        contact_id=contact_id_str,
        missing_fields=",".join(missing_fields),
    )


async def _session_closed_after(
    *,
    repo: CRMRepository,
    session_id: str,
    reference_ts: datetime | None,
) -> bool:
    try:
        closure = await repo.get_latest_webchat_session_closure(session_id=session_id)
    except CRMRepositoryError as exc:
        logger.warning(
            "webchat.followup.closure_lookup_failed",
            extra={"session_id": session_id, "error": str(exc)},
        )
        return False
    if not closure:
        return False
    closed_at = _parse_ts(closure.get("closed_at"))
    if not closed_at:
        return False
    if reference_ts is None:
        return True
    return closed_at >= reference_ts


async def _send_reengage_message(
    *,
    session_id: str,
    conversation_id: str,
    message: str,
) -> bool:
    try:
        await storage.register_webchat_message(
            session_id=session_id,
            author="assistant",
            content=message,
            inactivity_minutes=(
                settings.webchat_inactivity_minutes
                if settings.webchat_inactivity_minutes is not None
                else (
                    settings.webchat_inactivity_hours * 60
                    if settings.webchat_inactivity_hours is not None
                    else None
                )
            ),
            metadata={
                "source": "webchat_followup",
                "followup_reason": "reengage",
            },
        )
    except StorageError as exc:
        logger.warning(
            "webchat.followup.reengage_send_failed",
            extra={"conversation_id": conversation_id, "session_id": session_id, "error": str(exc)},
        )
        return False
    return True


async def notify_session_closed_lead(
    *,
    session_id: str,
    reason: str = "session_closed",
) -> bool:
    """Evalúa una sesión cerrada y notifica al vendedor si hay lead accionable."""
    session_key = _strip_text(session_id)
    if not session_key:
        return False

    try:
        contact_id = await storage.get_webchat_persona_id(session_key)
    except StorageError as exc:
        logger.warning(
            "webchat.session_closed.contact_lookup_failed",
            extra={"session_id": session_key, "error": str(exc)},
        )
        return False
    if not contact_id:
        return False

    try:
        conversation = await storage.resolve_webchat_conversation_from_session(session_key)
    except StorageError as exc:
        logger.warning(
            "webchat.session_closed.conversation_lookup_failed",
            extra={"session_id": session_key, "contact_id": contact_id, "error": str(exc)},
        )
        return False
    if not conversation:
        return False

    conversation_id = _strip_text(conversation.get("id"))
    if not conversation_id:
        return False

    try:
        contact = await storage.fetch_persona(contact_id)
    except StorageError as exc:
        logger.warning(
            "webchat.session_closed.contact_fetch_failed",
            extra={
                "session_id": session_key,
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "error": str(exc),
            },
        )
        return False

    has_base_contact = _has_value(contact.get("correo")) or _has_value(
        contact.get("telefono_e164") or contact.get("telefono")
    )
    if not has_base_contact:
        return False

    org_id = contact.get("organizacion_id")
    if not org_id:
        return False
    try:
        org_uuid = UUID(str(org_id))
    except (TypeError, ValueError):
        return False

    repo = CRMRepository()
    try:
        opportunity = await repo.find_open_opportunity_by_conversation(
            organizacion_id=org_uuid,
            conversation_id=conversation_id,
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "webchat.session_closed.opportunity_lookup_failed",
            extra={
                "session_id": session_key,
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "error": str(exc),
            },
        )
        return False

    if not opportunity:
        return False

    context = ToolRuntimeContext(
        conversation_id=conversation_id,
        contact_id=str(contact_id),
        channel="webchat",
    )
    resumen = str(contact.get("necesidad_proposito") or "").strip() or None
    notes = str(contact.get("notes") or "").strip() or None
    email = str(contact.get("correo") or "").strip() or None
    opportunity_id = str(opportunity.get("id") or "").strip() or None
    if not opportunity_id:
        return False

    try:
        await enqueue_webchat_sales_notification(
            conversation_id=context.conversation_id,
            contact_id=context.contact_id,
            trigger="webchat_session_closed",
            channel="webchat",
            organizacion_id=org_uuid,
            contact=contact,
            opportunity_id=opportunity_id,
            resumen=resumen,
            notes=notes,
            email=email,
            extra={"reason": reason, "session_id": session_key},
        )
    except Exception as exc:  # pragma: no cover - best effort
        logger.warning(
            "webchat.session_closed.notify_enqueue_failed",
            extra={
                "session_id": session_key,
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "error": str(exc),
            },
        )
        return False

    logger.info(
        "webchat.session_closed.notified",
        extra={
            "session_id": session_key,
            "conversation_id": conversation_id,
            "contact_id": str(contact_id),
            "opportunity_id": opportunity_id,
            "reason": reason,
        },
    )
    return True


async def run_session_closure_rescue(*, now: datetime | None = None, limit: int = 500) -> None:
    """Revisión periódica de cierres webchat para rescatar notificaciones no enviadas."""
    reference = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    since = reference - timedelta(hours=_CLOSURE_RESCUE_LOOKBACK_HOURS)
    repo = CRMRepository()
    try:
        closures = await repo.list_webchat_session_closures_since(closed_since=since, limit=limit)
    except CRMRepositoryError as exc:
        logger.warning("webchat.session_closed.rescue_list_failed", extra={"error": str(exc)})
        return

    for row in closures:
        if not isinstance(row, dict):
            continue
        session_id = _strip_text(row.get("session_id"))
        if not session_id:
            continue
        await notify_session_closed_lead(session_id=session_id, reason="closure_rescue")


class WebchatFollowupRunner:
    """Ejecuta run_followups en intervalos definidos."""

    def __init__(self, *, interval_minutes: int = 5) -> None:
        self._interval = max(1, interval_minutes)
        self._task: asyncio.Task[None] | None = None
        self._stop_event = asyncio.Event()
        self._enabled = True
        self._cursor_last_out: datetime | None = None
        self._cursor_last_id: str | None = None

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        if not settings.supabase_url or not settings.supabase_service_role:
            self._enabled = False
            logger.warning("webchat.followup.disabled", extra={"reason": "supabase_config_missing"})
            return
        self._enabled = True
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run_loop(), name="webchat-followups")
        logger.info("webchat.followup.started")

    async def shutdown(self) -> None:
        if not self._task:
            return
        self._stop_event.set()
        try:
            await self._task
        finally:
            self._task = None
        logger.info("webchat.followup.stopped")

    async def _run_loop(self) -> None:
        interval_seconds = self._interval * 60
        while not self._stop_event.is_set():
            try:
                defer, details = await should_defer_non_critical_jobs(job_name="webchat_followups")
                if defer:
                    logger.info("webchat.followup.deferred_due_to_blast", extra=details)
                else:
                    self._cursor_last_out, self._cursor_last_id = await run_followups_with_cursor(
                        cursor_last_out=self._cursor_last_out,
                        cursor_last_id=self._cursor_last_id,
                    )
            except Exception as exc:  # pragma: no cover
                logger.exception("webchat.followup.loop_error", extra={"error": str(exc)})
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=interval_seconds)
            except asyncio.TimeoutError:
                continue


followup_runner = WebchatFollowupRunner()


class WebchatClosureRescueRunner:
    """Ejecuta run_session_closure_rescue en intervalos definidos."""

    def __init__(self, *, interval_minutes: int = 120) -> None:
        self._interval = max(5, interval_minutes)
        self._task: asyncio.Task[None] | None = None
        self._stop_event = asyncio.Event()
        self._enabled = True

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        if not settings.supabase_url or not settings.supabase_service_role:
            self._enabled = False
            logger.warning("webchat.session_closed.rescue_disabled", extra={"reason": "supabase_config_missing"})
            return
        self._enabled = True
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run_loop(), name="webchat-closure-rescue")
        logger.info("webchat.session_closed.rescue_started", extra={"interval_minutes": self._interval})

    async def shutdown(self) -> None:
        if not self._task:
            return
        self._stop_event.set()
        try:
            await self._task
        finally:
            self._task = None
        logger.info("webchat.session_closed.rescue_stopped")

    async def _run_loop(self) -> None:
        interval_seconds = self._interval * 60
        while not self._stop_event.is_set():
            try:
                defer, details = await should_defer_non_critical_jobs(job_name="webchat_closure_rescue")
                if defer:
                    logger.info("webchat.session_closed.rescue_deferred_due_to_blast", extra=details)
                else:
                    await run_session_closure_rescue()
            except Exception as exc:  # pragma: no cover
                logger.exception("webchat.session_closed.rescue_loop_error", extra={"error": str(exc)})
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=interval_seconds)
            except asyncio.TimeoutError:
                continue


closure_rescue_runner = WebchatClosureRescueRunner(interval_minutes=120)
