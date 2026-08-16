"""Integraciones con Supabase/Postgres vía REST."""

from __future__ import annotations

import asyncio
import json
import re
import unicodedata
from collections.abc import Iterable, Mapping, Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import UploadFile

from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services.scoring_contract import (
    normalize_required_fields_for_answers as shared_normalize_required_fields_for_answers,
)
from app.services.phone_utils import normalize_phone
from app.services import tenant_runtime
from app.services import message_billing
from app.services.ui_realtime_hub import inbox_topic_for_org, ui_realtime_hub
from app.services.user_notifications import (
    UserNotificationAction,
    UserNotificationCreate,
    create_and_publish_user_notification,
)

logger = get_logger(__name__)

DEFAULT_CALENDAR_SETTINGS_SLUG = "default"
INBOX_NOTIFICATION_RETRY_DELAYS_SECONDS = (0.0, 0.5, 1.5, 3.0, 5.0)
MESSAGE_BILLING_RETRY_DELAYS_SECONDS = (0.5, 1.5, 3.0)


class StorageError(RuntimeError):
    """Errores de persistencia para servicios externos."""


def _schedule_background_coroutine(coro: Any, *, label: str) -> None:
    task = asyncio.create_task(coro)

    def _log_task_failure(done_task: asyncio.Task) -> None:
        try:
            done_task.result()
        except Exception as exc:  # pragma: no cover - defensivo
            logger.warning(
                "storage.background_task_failed",
                extra={"label": label, "error": str(exc)},
            )

    task.add_done_callback(_log_task_failure)


def _is_transient_message_billing_error(exc: CRMRepositoryError) -> bool:
    message = str(exc).lower()
    return any(
        marker in message
        for marker in (
            "error de red",
            "statement timeout",
            "57014",
            "timed out",
            "timeout",
            "temporarily unavailable",
        )
    )


async def _publish_inbox_realtime_event(
    *,
    organizacion_id: str | None,
    event_type: str,
    payload: dict[str, Any] | None = None,
) -> None:
    org_value = str(organizacion_id or "").strip()
    if not org_value:
        return
    message = {
        "type": event_type,
        "scope": "inbox",
        "organizacion_id": org_value,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    if isinstance(payload, dict) and payload:
        message["payload"] = payload
    await ui_realtime_hub.publish(
        inbox_topic_for_org(organizacion_id=org_value),
        message,
    )


def _ensure_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return dict(parsed)
        except json.JSONDecodeError:
            return {}
    return {}


def _normalize_persona_payload(row: dict[str, Any]) -> dict[str, Any]:
    persona_data = _ensure_dict(
        row.get("persona_datos") or row.get("contacto_datos") or row.get("metadata")
    )
    row["persona_datos"] = dict(persona_data)
    row["contacto_datos"] = dict(persona_data)
    if "metadata" not in row or row.get("metadata") is None:
        row["metadata"] = dict(persona_data)
    return row


def _deep_merge_dict(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in patch.items():
        if value is None:
            continue
        if isinstance(value, dict):
            existing = merged.get(key)
            if isinstance(existing, dict):
                nested = _deep_merge_dict(existing, value)
                if nested:
                    merged[key] = nested
            elif value:
                merged[key] = dict(value)
            continue
        if isinstance(value, str):
            trimmed = value.strip()
            if not trimmed:
                continue
            merged[key] = trimmed
            continue
        merged[key] = value
    return merged


def _normalize_manual_override(raw: Any) -> bool:
    """Normaliza diferentes formas de representar manual_override."""
    if isinstance(raw, bool):
        return raw
    if raw is None:
        return False
    if isinstance(raw, (int, float)):
        return bool(raw)
    if isinstance(raw, str):
        lowered = raw.strip().lower()
        if lowered in {"true", "t", "1", "yes", "y"}:
            return True
        if lowered in {"false", "f", "0", "no", "n", ""}:
            return False
        return False
    if isinstance(raw, dict):
        if "manual_override" in raw:
            return _normalize_manual_override(raw.get("manual_override"))
        # Si viene anidado con otra clave, intenta con el primer valor.
        for value in raw.values():
            normalized = _normalize_manual_override(value)
            if normalized:
                return True
        return False
    if isinstance(raw, Iterable):
        for item in raw:
            if _normalize_manual_override(item):
                return True
        return False
    return False


def _contact_has_minimum_info(contact: dict[str, Any]) -> bool:
    """Determina si el contacto ya tiene al menos teléfono o correo."""
    if not contact:
        return False
    phone = _contact_phone_value(contact)
    email = _contact_email_value(contact)
    return bool(phone or email)


def _contact_email_value(contact: dict[str, Any] | None) -> str | None:
    if not contact:
        return None
    for key in ("correo_principal", "correo_secundario", "correo", "email"):
        value = contact.get(key)
        if not isinstance(value, str):
            continue
        trimmed = value.strip()
        if trimmed:
            return trimmed
    return None


def _contact_phone_value(contact: dict[str, Any] | None) -> str | None:
    if not contact:
        return None
    for key in (
        "telefono_principal_e164",
        "telefono_movil_1_e164",
        "telefono_e164",
        "telefono",
        "telefono_secundario_e164",
        "telefono_movil_2_e164",
    ):
        value = contact.get(key)
        if not isinstance(value, str):
            continue
        trimmed = value.strip()
        if trimmed:
            return trimmed
    return None


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    return " ".join(text.split())


def _split_person_name(value: Any) -> tuple[str | None, str | None, str | None]:
    text = _clean_text(value)
    if not text:
        return None, None, None
    normalized = text.split(",", 1)[0].strip()
    normalized = " ".join(normalized.split())
    if not normalized:
        return None, None, None
    parts = normalized.split()
    if len(parts) == 1:
        return parts[0], None, None
    if len(parts) == 2:
        return parts[0], parts[1], None
    if len(parts) == 3:
        return parts[0], parts[1], parts[2]
    return " ".join(parts[:-2]).strip() or parts[0], parts[-2], parts[-1]


def _safe_uuid(value: Any) -> UUID | None:
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _normalize_channel_label(value: Any) -> str:
    raw = _clean_text(value).lower()
    if raw == "whatsapp":
        return "WhatsApp"
    if raw == "webchat":
        return "Webchat"
    if raw == "messenger":
        return "Messenger"
    return "Inbox"


def _truncate_message(value: Any, *, max_len: int = 160) -> str:
    text = _clean_text(value)
    if not text:
        return ""
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


def _normalize_title_fragment(value: Any, *, max_len: int = 96) -> str | None:
    text = _clean_text(value)
    if not text:
        return None
    # Prioriza la primera idea concreta para mantener títulos cortos y legibles.
    parts = re.split(r"[.?!;\n]+", text)
    fragment = next((part.strip(" -:\t") for part in parts if part and part.strip()), "")
    if not fragment:
        return None
    lowered = fragment.lower()
    prefixes = (
        "quiero ",
        "quisiera ",
        "necesito ",
        "necesitamos ",
        "me interesa ",
        "nos interesa ",
        "busco ",
        "buscamos ",
        "informacion sobre ",
        "información sobre ",
    )
    for prefix in prefixes:
        if lowered.startswith(prefix):
            fragment = fragment[len(prefix) :].strip()
            break
    if len(fragment) < 4:
        return None
    if len(fragment) > max_len:
        fragment = fragment[: max_len - 1].rstrip() + "…"
    return fragment


async def _resolve_inbox_notification_users(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    conversation_id: UUID,
) -> list[UUID]:
    try:
        convo = await repo.get_conversation_summary(conversation_id=conversation_id)
    except CRMRepositoryError:
        convo = None
    if isinstance(convo, dict):
        assigned = _safe_uuid(convo.get("asignado_a_usuario_id"))
        if assigned:
            return await _resolve_opportunity_notification_users(
                repo=repo,
                organizacion_id=organizacion_id,
                assigned_user_id=assigned,
            )

        try:
            opportunities = await repo.list_opportunities_by_conversation_ids(
                organizacion_id=organizacion_id,
                conversation_ids=[str(conversation_id)],
                limit=1,
            )
        except CRMRepositoryError:
            opportunities = []
        if opportunities:
            opportunity = opportunities[0]
            assigned = _safe_uuid(opportunity.get("asignado_a_usuario_id"))
            if assigned:
                return await _resolve_opportunity_notification_users(
                    repo=repo,
                    organizacion_id=organizacion_id,
                    assigned_user_id=assigned,
                )

    # No hay destinatario seguro: no se debe convertir la notificación en un
    # broadcast a todos los usuarios con permiso de Inbox.
    return []


async def _resolve_opportunity_notification_users(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    assigned_user_id: UUID | None,
) -> list[UUID]:
    if not assigned_user_id:
        return []
    candidates: list[UUID] = [assigned_user_id]
    try:
        supervisors = await repo.list_supervisor_user_ids_for_sales_rep(
            organizacion_id=organizacion_id,
            empleado_usuario_id=assigned_user_id,
        )
    except CRMRepositoryError:
        supervisors = []
    for supervisor_id in supervisors:
        if supervisor_id not in candidates:
            candidates.append(supervisor_id)

    recipients: list[UUID] = []
    for user_id in candidates:
        try:
            has_permission = await repo.user_has_permission(
                organizacion_id=organizacion_id,
                usuario_id=user_id,
                codigo="ver_inbox",
            )
        except CRMRepositoryError:
            has_permission = False
        if has_permission:
            recipients.append(user_id)
    return recipients


async def _notify_inbox_message(
    *,
    repo: CRMRepository,
    organizacion_id: UUID | None,
    conversation_id: str | None,
    persona_id: str | None,
    channel: str | None,
    direction: str | None,
    author: str | None = None,
    message_text: str | None = None,
    message_id: str | None = None,
) -> None:
    if not organizacion_id or not conversation_id:
        return
    if direction and direction != "entrante":
        return
    if author and author != "user":
        return

    convo_uuid = _safe_uuid(conversation_id)
    if not convo_uuid:
        return

    recipients: list[UUID] = []
    for attempt, delay_seconds in enumerate(INBOX_NOTIFICATION_RETRY_DELAYS_SECONDS, start=1):
        if delay_seconds:
            await asyncio.sleep(delay_seconds)
        recipients = await _resolve_inbox_notification_users(
            repo=repo,
            organizacion_id=organizacion_id,
            conversation_id=convo_uuid,
        )
        if recipients:
            break
        logger.info(
            "storage.inbox_notification_waiting_for_assignment",
            extra={
                "organizacion_id": str(organizacion_id),
                "conversation_id": conversation_id,
                "message_id": message_id,
                "attempt": attempt,
                "max_attempts": len(INBOX_NOTIFICATION_RETRY_DELAYS_SECONDS),
            },
        )
    if not recipients:
        logger.error(
            "storage.inbox_notification_dropped_no_recipient",
            extra={
                "organizacion_id": str(organizacion_id),
                "conversation_id": conversation_id,
                "message_id": message_id,
            },
        )
        return

    channel_label = _normalize_channel_label(channel)
    snippet = _normalize_title_fragment(_truncate_message(message_text))
    message = f"{channel_label}: {snippet}" if snippet else f"{channel_label}: Nuevo mensaje entrante."
    dedupe = f"inbox.message:{message_id}" if message_id else None
    group_key = f"inbox.message:{conversation_id}"
    action = UserNotificationAction(label="Abrir Inbox", href="/inbox")

    meta: dict[str, Any] = {
        "channel": channel,
        "conversation_id": conversation_id,
        "persona_id": persona_id,
        "message_id": message_id,
    }

    for usuario_id in recipients:
        try:
            await create_and_publish_user_notification(
                repo=repo,
                notification=UserNotificationCreate(
                    organizacion_id=organizacion_id,
                    usuario_id=usuario_id,
                    type="inbox.message",
                    level="info",
                    title="Nuevo mensaje en Inbox",
                    message=message,
                    category="inbox",
                    entity_kind="conversation",
                    entity_id=conversation_id,
                    action=action,
                    meta=meta,
                    dedupe_key=dedupe,
                    group_key=group_key,
                ),
            )
        except CRMRepositoryError as exc:
            logger.warning(
                "storage.inbox_notification_create_failed",
                extra={
                    "organizacion_id": str(organizacion_id),
                    "usuario_id": str(usuario_id),
                    "conversation_id": conversation_id,
                    "message_id": message_id,
                    "error": str(exc),
                },
            )
            continue


async def _notify_opportunity_created_after_assignment(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    opportunity_id: UUID,
    conversation_id: str,
    persona_id: str,
    channel: str | None,
) -> None:
    """Publica la alerta solo después de confirmar el asignado persistido."""
    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=organizacion_id,
            oportunidad_id=opportunity_id,
        )
    except CRMRepositoryError as exc:
        logger.error(
            "storage.opportunity_notification_lookup_failed",
            extra={
                "organizacion_id": str(organizacion_id),
                "opportunity_id": str(opportunity_id),
                "conversation_id": conversation_id,
                "error": str(exc),
            },
        )
        return
    if not isinstance(opportunity, dict):
        logger.error(
            "storage.opportunity_notification_missing_opportunity",
            extra={"opportunity_id": str(opportunity_id), "conversation_id": conversation_id},
        )
        return

    assigned_id = _safe_uuid(opportunity.get("asignado_a_usuario_id"))
    if not assigned_id:
        logger.error(
            "storage.opportunity_notification_dropped_no_assignment",
            extra={
                "organizacion_id": str(organizacion_id),
                "opportunity_id": str(opportunity_id),
                "conversation_id": conversation_id,
            },
        )
        return

    recipients = await _resolve_opportunity_notification_users(
        repo=repo,
        organizacion_id=organizacion_id,
        assigned_user_id=assigned_id,
    )
    if not recipients:
        logger.error(
            "storage.opportunity_notification_dropped_no_permitted_recipient",
            extra={
                "organizacion_id": str(organizacion_id),
                "opportunity_id": str(opportunity_id),
                "conversation_id": conversation_id,
                "assigned_user_id": str(assigned_id),
            },
        )
        return
    channel_label = _normalize_channel_label(channel)
    title_value = _clean_text(opportunity.get("titulo")) or "Oportunidad nueva"
    dedupe_key = f"opportunity.created:{opportunity_id}"
    for usuario_id in recipients:
        try:
            existing = await repo.get_ui_notification_by_dedupe_key(
                usuario_id=usuario_id,
                organizacion_id=organizacion_id,
                dedupe_key=dedupe_key,
            )
            if existing:
                continue
            await create_and_publish_user_notification(
                repo=repo,
                notification=UserNotificationCreate(
                    organizacion_id=organizacion_id,
                    usuario_id=usuario_id,
                    type="opportunity.created",
                    level="success",
                    title="Nueva oportunidad creada",
                    message=f"{channel_label}: {title_value}",
                    category="pipeline",
                    entity_kind="opportunity",
                    entity_id=str(opportunity_id),
                    oportunidad_id=opportunity_id,
                    persona_id=_safe_uuid(persona_id),
                    action=UserNotificationAction(
                        label="Ver oportunidad",
                        href=f"/embudo?oportunidadId={opportunity_id}",
                    ),
                    meta={
                        "channel": (channel or "").strip().lower(),
                        "conversation_id": conversation_id,
                        "persona_id": persona_id,
                        "opportunity_id": str(opportunity_id),
                    },
                    dedupe_key=dedupe_key,
                    group_key=f"opportunity.created:{assigned_id}",
                ),
            )
        except CRMRepositoryError as exc:
            logger.error(
                "storage.opportunity_notification_create_failed",
                extra={
                    "organizacion_id": str(organizacion_id),
                    "usuario_id": str(usuario_id),
                    "opportunity_id": str(opportunity_id),
                    "conversation_id": conversation_id,
                    "error": str(exc),
                },
            )


async def notify_opportunity_assignment(
    *,
    organizacion_id: UUID,
    opportunity_id: UUID,
    conversation_id: str,
    persona_id: str | None,
    channel: str | None,
) -> None:
    """Garantiza la alerta del vendedor después de cualquier asignación."""
    await _notify_opportunity_created_after_assignment(
        repo=CRMRepository(),
        organizacion_id=organizacion_id,
        opportunity_id=opportunity_id,
        conversation_id=conversation_id,
        persona_id=persona_id or "",
        channel=channel,
    )


async def _ensure_inbound_assignment_before_notification(
    *,
    repo: CRMRepository,
    organizacion_id: UUID | None,
    conversation_id: str | None,
    persona_id: str | None,
    channel: str,
) -> None:
    """Completa la asignación antes de publicar cualquier evento de Inbox."""
    if not organizacion_id or not conversation_id or not persona_id:
        return
    conversation_uuid = _safe_uuid(conversation_id)
    if not conversation_uuid:
        return

    try:
        conversation = await repo.get_conversation_summary(conversation_id=conversation_uuid)
    except CRMRepositoryError as exc:
        logger.error(
            "storage.inbound_assignment_lookup_failed",
            extra={"conversation_id": conversation_id, "message_channel": channel, "error": str(exc)},
        )
        return

    if isinstance(conversation, dict) and _safe_uuid(conversation.get("asignado_a_usuario_id")):
        return

    try:
        linked_opportunities = await repo.list_opportunities_by_conversation_ids(
            organizacion_id=organizacion_id,
            conversation_ids=[conversation_id],
            limit=1,
        )
        linked_opportunity = linked_opportunities[0] if linked_opportunities else None
        opportunity_assignee = (
            _safe_uuid(linked_opportunity.get("asignado_a_usuario_id"))
            if isinstance(linked_opportunity, dict)
            else None
        )
        if opportunity_assignee:
            await repo.assign_conversation_if_unassigned(
                organizacion_id=organizacion_id,
                conversation_id=conversation_id,
                usuario_id=opportunity_assignee,
            )
        else:
            await ensure_conversation_opportunity(
                conversation_id=conversation_id,
                persona_id=persona_id,
                channel=channel,
            )
    except (CRMRepositoryError, StorageError) as exc:
        logger.error(
            "storage.inbound_assignment_failed",
            extra={
                "organizacion_id": str(organizacion_id),
                "conversation_id": conversation_id,
                "persona_id": persona_id,
                "message_channel": channel,
                "error": str(exc),
            },
        )
        return

    try:
        confirmed = await repo.get_conversation_summary(conversation_id=conversation_uuid)
    except CRMRepositoryError as exc:
        logger.error(
            "storage.inbound_assignment_confirmation_failed",
            extra={"conversation_id": conversation_id, "message_channel": channel, "error": str(exc)},
        )
        return
    if not isinstance(confirmed, dict) or not _safe_uuid(confirmed.get("asignado_a_usuario_id")):
        logger.error(
            "storage.inbound_assignment_not_confirmed",
            extra={
                "organizacion_id": str(organizacion_id),
                "conversation_id": conversation_id,
                "persona_id": persona_id,
                "message_channel": channel,
            },
        )


def _looks_like_placeholder_name(value: str) -> bool:
    lowered = value.strip().lower()
    if not lowered:
        return True
    return lowered in {
        "visitante webchat",
        "visitante whatsapp",
        "visitante",
        "lead webchat",
        "lead whatsapp",
    }


def _looks_like_placeholder_insight(value: str) -> bool:
    lowered = " ".join(value.strip().lower().split())
    if not lowered:
        return True
    if lowered in {
        "interés en tal-ia",
        "interes en tal-ia",
        "información comercial compartida durante la conversación.",
        "informacion comercial compartida durante la conversacion.",
        "prospecto en conversación activa solicitando información.",
        "prospecto en conversacion activa solicitando informacion.",
        "resumen generado por tal-ia",
        "necesidad capturada por tal-ia",
        "luis pérez se ha presentado como un nuevo contacto.",
        "luis perez se ha presentado como un nuevo contacto.",
        "la necesidad principal no está claramente definida en este mensaje inicial.",
        "la necesidad principal no esta claramente definida en este mensaje inicial.",
        "hay una oportunidad abierta en el embudo de ventas.",
        "el siguiente paso sugerido es realizar un seguimiento para explorar sus necesidades y ofrecer soluciones adecuadas.",
        "el siguiente paso sugerido es programar un seguimiento para explorar sus necesidades y ofrecer soluciones adecuadas.",
    }:
        return True
    return any(
        fragment in lowered
        for fragment in (
            "se ha presentado como un nuevo contacto",
            "la necesidad principal no está claramente definida",
            "la necesidad principal no esta claramente definida",
            "hay una oportunidad abierta en el embudo de ventas",
            "seguir para explorar sus necesidades",
            "ofrecer soluciones adecuadas",
            "solicitó información",
            "solicito informacion",
        )
    )


def _looks_like_placeholder_opportunity_description(value: str) -> bool:
    lowered = " ".join(value.strip().lower().split())
    if not lowered:
        return True
    if _looks_like_placeholder_insight(value):
        return True
    return any(
        fragment in lowered
        for fragment in (
            "nuevo contacto",
            "se ha presentado como un nuevo contacto",
            "oportunidad abierta en el embudo de ventas",
            "seguimiento para explorar sus necesidades",
            "soluciones adecuadas",
        )
    )


def _build_need_title(text: str, *, fallback_company: str | None = None) -> str:
    candidate = " ".join(str(text or "").strip().split())
    if candidate:
        for separator in (".", "!", "?", ";", "\n"):
            if separator in candidate:
                candidate = candidate.split(separator, 1)[0].strip()
                break
    if candidate and len(candidate) > 96:
        candidate = candidate[:95].rstrip() + "…"
    if candidate:
        return candidate
    company = str(fallback_company or "").strip()
    if company:
        return f"Información de Tal-IA para {company}"
    return "Interés en Tal-IA"


def _build_opportunity_title(
    *,
    contact: dict[str, Any],
    intent: str | None = None,
    summary: str | None = None,
) -> str | None:
    fragment = (
        _normalize_title_fragment(intent)
        or _normalize_title_fragment(summary)
        or _normalize_title_fragment(contact.get("necesidad_proposito"))
        or _normalize_title_fragment(contact.get("notes"))
    )
    if not fragment:
        return None

    title = fragment
    if len(title) > 140:
        title = title[:139].rstrip() + "…"
    return title


def _build_opportunity_description(
    *,
    contact: dict[str, Any],
    intent: str | None = None,
    summary: str | None = None,
) -> str | None:
    description = (
        _normalize_title_fragment(summary, max_len=280)
        or _normalize_title_fragment(intent, max_len=280)
        or _normalize_title_fragment(contact.get("notes"), max_len=280)
        or _normalize_title_fragment(contact.get("necesidad_proposito"), max_len=280)
    )
    return description


def _build_persona_insights(
    *,
    persona: dict[str, Any],
    summary_text: str | None = None,
) -> tuple[str, str]:
    persona_name = _clean_text(persona.get("nombre_completo")) or "El prospecto"
    company_name = _clean_text(persona.get("company_name"))
    notes_source = _clean_text(persona.get("notes"))
    need_source = _clean_text(persona.get("necesidad_proposito"))
    summary_fragment = _normalize_title_fragment(summary_text or notes_source, max_len=280)

    notes = notes_source
    if not notes or _looks_like_placeholder_insight(notes):
        notes = (
            summary_text
            or f"{persona_name} de {company_name or 'su empresa'} compartió sus datos y solicitó información."
        )
    if not notes:
        notes = "Prospecto en conversación activa solicitando información."

    necesidad = need_source
    if not necesidad or _looks_like_placeholder_insight(necesidad):
        necesidad = _build_need_title(summary_fragment or notes, fallback_company=company_name)
    if not necesidad:
        necesidad = "Interés en Tal-IA"

    return notes, necesidad


def _is_generic_opportunity_title(
    *,
    current_title: str,
    contact: dict[str, Any],
    auto_generated: bool,
) -> bool:
    if auto_generated:
        return True
    normalized = current_title.strip().lower()
    if not normalized:
        return True
    if normalized.startswith("conversación ") or normalized.startswith("conversation "):
        return True
    if _looks_like_placeholder_name(normalized):
        return True
    persona_contacto_datos = _ensure_dict(
        contact.get("persona_datos") or contact.get("contacto_datos") or contact.get("metadata")
    )
    profile_name = _clean_text(persona_contacto_datos.get("profile_name")).lower()
    if profile_name and normalized == profile_name:
        return True
    contact_name = _clean_text(contact.get("nombre_completo")).lower()
    company_name = _clean_text(contact.get("company_name")).lower()
    if contact_name and normalized == contact_name:
        return True
    if company_name and normalized == company_name:
        return True
    return False


def _is_unconfirmed_whatsapp_name(
    *,
    contact_name: str | None,
    profile_name: str | None,
) -> bool:
    name_value = _clean_text(contact_name).lower()
    profile_value = _clean_text(profile_name).lower()
    return bool(name_value and profile_value and name_value == profile_value)


_SCORE_VALUE_MAP: dict[str, dict[str, int]] = {
    "financing_type": {
        "contado": 100,
        "mixto": 90,
        "credito": 80,
        "unknown": 40,
        "refused": 20,
    },
    "credit_preapproved": {
        "yes": 100,
        "in_process": 70,
        "no": 30,
        "unknown": 40,
        "refused": 20,
    },
    "down_payment_ready": {
        "yes": 100,
        "partial": 70,
        "no": 30,
        "unknown": 40,
        "refused": 20,
    },
    "purchase_timeline": {
        "<3m": 100,
        "3-6m": 80,
        "6-12m": 60,
        ">12m": 30,
        "unknown": 40,
        "refused": 20,
    },
    "hard_deadline": {
        "yes": 100,
        "no": 50,
        "unknown": 40,
        "refused": 20,
    },
    "requirements_defined": {
        "high": 100,
        "medium": 70,
        "low": 40,
        "unknown": 40,
        "refused": 20,
    },
    "comparison_mode": {
        "shortlist": 100,
        "comparing": 75,
        "exploring": 45,
        "unknown": 40,
        "refused": 20,
    },
    "visited_properties": {
        "yes": 100,
        "no": 50,
        "unknown": 40,
        "refused": 20,
    },
    "decision_authority": {
        "full": 100,
        "shared": 75,
        "advisor": 40,
        "unknown": 40,
        "refused": 20,
    },
    "buyer_type": {
        "individual": 80,
        "couple": 80,
        "family": 80,
        "company": 90,
        "investor": 90,
        "unknown": 40,
        "refused": 20,
    },
    "response_time_bucket": {
        "fast": 100,
        "medium": 70,
        "slow": 40,
    },
}

_CRITICAL_SCORING_FIELDS: tuple[str, ...] = (
    "financing_type",
    "budget_range",
    "purchase_timeline",
    "decision_authority",
)

_PROFILING_STATUS_VALUES: set[str] = {
    "answered",
    "unknown",
    "refused",
    "skipped_max_retries",
}

_FIELD_FACTOR_MAP: dict[str, str] = {
    "financing_type": "capacidad_financiera",
    "credit_preapproved": "capacidad_financiera",
    "budget_range": "capacidad_financiera",
    "down_payment_ready": "capacidad_financiera",
    "purchase_timeline": "urgencia",
    "hard_deadline": "urgencia",
    "requirements_defined": "nivel_decision",
    "comparison_mode": "nivel_decision",
    "visited_properties": "nivel_decision",
    "decision_authority": "autoridad",
    "buyer_type": "autoridad",
}

_SCORING_FIELD_ALIASES: dict[str, dict[str, str]] = {
    "financing_type": {
        "credito": "credito",
        "con credito": "credito",
        "con credito hipotecario": "credito",
        "contado": "contado",
        "cash": "contado",
        "mixto": "mixto",
        "ambas": "mixto",
        "both": "mixto",
    },
    "credit_preapproved": {
        "preapproved": "yes",
        "preaprobado": "yes",
        "preaprobada": "yes",
        "yes": "yes",
        "si": "yes",
        "in_process": "in_process",
        "en proceso": "in_process",
        "proceso": "in_process",
        "none": "no",
        "no": "no",
    },
    "purchase_timeline": {
        "immediate": "<3m",
        "short_term": "3-6m",
        "medium_term": "6-12m",
        "long_term": ">12m",
    },
    "requirements_defined": {
        "clear": "high",
        "high": "high",
        "partial": "medium",
        "medium": "medium",
        "exploring": "low",
        "low": "low",
    },
    "comparison_mode": {
        "active": "shortlist",
        "shortlist": "shortlist",
        "light": "comparing",
        "comparing": "comparing",
        "none": "exploring",
        "exploring": "exploring",
    },
    "decision_authority": {
        "self": "full",
        "full": "full",
        "shared": "shared",
        "advisor": "advisor",
    },
    "buyer_type": {
        "end_user": "individual",
        "individual": "individual",
        "couple": "couple",
        "family": "family",
        "company": "company",
        "investor": "investor",
    },
}


def _as_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "si", "sí"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
    return None


def _as_ratio(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return max(0.0, min(number, 1.0))


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_answer_value(field: str, value: Any) -> Any:
    if isinstance(value, str):
        normalized = (
            unicodedata.normalize("NFKD", value.strip())
            .encode("ascii", "ignore")
            .decode("ascii")
            .lower()
        )
    else:
        normalized = value
    if field in _SCORE_VALUE_MAP and isinstance(normalized, str):
        alias_map = _SCORING_FIELD_ALIASES.get(field, {})
        normalized = alias_map.get(normalized, normalized)
    if field in _SCORE_VALUE_MAP and isinstance(normalized, str):
        if normalized in _SCORE_VALUE_MAP[field]:
            return normalized
    if field == "budget_range":
        if isinstance(value, str) and value.strip():
            return value.strip()
        return "unknown"
    return normalized


def _is_financing_cash(answers: Mapping[str, Any] | None) -> bool:
    if not isinstance(answers, Mapping):
        return False
    normalized = _normalize_answer_value("financing_type", answers.get("financing_type"))
    if not isinstance(normalized, str):
        return False
    return normalized.strip().lower() == "contado"


def _normalize_required_fields_for_answers(
    required_fields: Sequence[str],
    answers: Mapping[str, Any] | None,
) -> list[str]:
    return shared_normalize_required_fields_for_answers(required_fields, answers)


def _contact_has_name(contact: Mapping[str, Any] | None) -> bool:
    if not isinstance(contact, Mapping):
        return False
    for field in ("nombre_completo", "nombre"):
        if _clean_text(contact.get(field)):
            return True
    return False


def _contact_has_phone(contact: Mapping[str, Any] | None) -> bool:
    if not isinstance(contact, Mapping):
        return False
    for field in (
        "telefono_e164",
        "phone_e164",
        "telefono",
        "telefono_movil_1_e164",
        "telefono_principal_e164",
        "telefono_secundario_e164",
    ):
        normalized = normalize_phone(contact.get(field))
        if _clean_text(normalized):
            return True
    return False


def _contact_has_email(contact: Mapping[str, Any] | None) -> bool:
    if not isinstance(contact, Mapping):
        return False
    for field in ("email", "correo", "correo_principal", "correo_secundario", "correo_institucional"):
        value = _clean_text(contact.get(field))
        if value and "@" in value:
            return True
    return False


async def _load_prequalification_required_fields(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    channel: str,
    profiling_enabled: bool,
    fallback_answers: Mapping[str, Any] | None,
    fallback_fields: Sequence[str] = (),
) -> list[str]:
    if not profiling_enabled:
        return []

    required_fields: list[str] = []
    for field in fallback_fields:
        normalized = str(field or "").strip()
        if normalized and normalized not in required_fields:
            required_fields.append(normalized)

    try:
        question_rows = await repo.list_scoring_questions(
            organizacion_id=organizacion_id,
            canal=channel if channel in {"whatsapp", "webchat"} else "webchat",
            include_inactive=False,
        )
    except CRMRepositoryError:
        question_rows = []
    for row in question_rows:
        field_key = str(row.get("field_key") or "").strip()
        if not field_key:
            continue
        if bool(row.get("required_for_case_a")) and field_key not in required_fields:
            required_fields.append(field_key)

    if not required_fields:
        required_fields = list(_CRITICAL_SCORING_FIELDS)
    return _normalize_required_fields_for_answers(required_fields, fallback_answers)


def _field_score(field: str, value: Any) -> int:
    score_map = _SCORE_VALUE_MAP.get(field)
    if score_map is None:
        return 50
    if isinstance(value, str):
        return score_map.get(value.strip().lower(), 50)
    return 50


def _normalize_profiling_status(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip().lower()
    if not normalized:
        return None
    aliases = {
        "answer": "answered",
        "answered": "answered",
        "ok": "answered",
        "unknown": "unknown",
        "desconocido": "unknown",
        "refused": "refused",
        "rechazado": "refused",
        "skipped_max_retries": "skipped_max_retries",
        "skipped": "skipped_max_retries",
        "max_retries": "skipped_max_retries",
        "max_reprompts": "skipped_max_retries",
    }
    mapped = aliases.get(normalized, normalized)
    return mapped if mapped in _PROFILING_STATUS_VALUES else None


def _coerce_non_negative_int(value: Any, *, default: int = 0) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return default


def _derive_profiling_status_from_answer(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        normalized = value.strip().lower()
        if not normalized:
            return None
        if normalized in {"unknown", "refused"}:
            return normalized
        return "answered"
    return "answered"


def _extract_profiling_statuses(raw: Any) -> dict[str, str]:
    if not isinstance(raw, dict):
        return {}
    result: dict[str, str] = {}
    for field, payload in raw.items():
        key = str(field or "").strip()
        if not key:
            continue
        status_value = payload
        if isinstance(payload, dict):
            status_value = (
                payload.get("estado_respuesta")
                or payload.get("status")
                or payload.get("state")
            )
        status = _normalize_profiling_status(status_value)
        if status:
            result[key] = status
    return result


def _extract_reprompt_counts(raw: Any) -> dict[str, int]:
    if not isinstance(raw, dict):
        return {}
    result: dict[str, int] = {}
    for field, payload in raw.items():
        key = str(field or "").strip()
        if not key:
            continue
        value = payload
        if isinstance(payload, dict):
            value = (
                payload.get("repregunta_count")
                or payload.get("retry_count")
                or payload.get("attempts")
            )
        if value is None:
            continue
        result[key] = _coerce_non_negative_int(value)
    return result


def _mean_score(values: list[int], default: int = 40) -> int:
    if not values:
        return default
    return int(round(sum(values) / len(values)))


def _compute_lead_scoring(
    answers: dict[str, Any],
    events: dict[str, Any],
    scoring_settings: tenant_runtime.LeadScoringRuntimeSettings | None = None,
) -> dict[str, Any]:
    runtime_settings = scoring_settings or tenant_runtime.LeadScoringRuntimeSettings.from_defaults()
    finanzas_values = [
        _field_score("financing_type", answers.get("financing_type")),
        _field_score("down_payment_ready", answers.get("down_payment_ready")),
    ]
    if not _is_financing_cash(answers):
        finanzas_values.append(_field_score("credit_preapproved", answers.get("credit_preapproved")))
    budget_value = answers.get("budget_range")
    if isinstance(budget_value, str) and budget_value.strip() and budget_value not in {"unknown", "refused"}:
        finanzas_values.append(100)
    else:
        finanzas_values.append(40)
    financiera = _mean_score(finanzas_values)

    urgencia = _mean_score(
        [
            _field_score("purchase_timeline", answers.get("purchase_timeline")),
            _field_score("hard_deadline", answers.get("hard_deadline")),
        ]
    )

    decision = _mean_score(
        [
            _field_score("requirements_defined", answers.get("requirements_defined")),
            _field_score("comparison_mode", answers.get("comparison_mode")),
            _field_score("visited_properties", answers.get("visited_properties")),
        ]
    )

    autoridad = _mean_score(
        [
            _field_score("decision_authority", answers.get("decision_authority")),
            _field_score("buyer_type", answers.get("buyer_type")),
        ]
    )

    interaction_values: list[int] = []
    accepted_questions = _as_bool(events.get("accepted_answering_questions"))
    if accepted_questions is not None:
        interaction_values.append(100 if accepted_questions else 30)
    ratio = _as_ratio(events.get("answered_fields_ratio"))
    if ratio is not None:
        interaction_values.append(int(round(ratio * 100)))
    for event_key, positive_score, negative_score in (
        ("appointment_requested", 80, 30),
        ("appointment_scheduled", 100, 30),
    ):
        event_value = _as_bool(events.get(event_key))
        if event_value is not None:
            interaction_values.append(positive_score if event_value else negative_score)
    evasive_count_raw = events.get("evasive_answers_count")
    try:
        evasive_count = max(0, int(evasive_count_raw))
    except (TypeError, ValueError):
        evasive_count = 0
    interaction_values.append(max(20, 100 - min(evasive_count, 8) * 10))
    interaction_values.append(_field_score("response_time_bucket", events.get("response_time_bucket")))
    interaccion = _mean_score(interaction_values)

    score_total = round(
        financiera * (runtime_settings.capacidad_financiera_weight / 100.0)
        + urgencia * (runtime_settings.urgencia_weight / 100.0)
        + decision * (runtime_settings.nivel_decision_weight / 100.0)
        + autoridad * (runtime_settings.autoridad_weight / 100.0)
        + interaccion * (runtime_settings.interaccion_compromiso_weight / 100.0),
        2,
    )
    if score_total <= runtime_settings.explorando_max:
        grade = "explorando"
    elif score_total <= runtime_settings.interesado_max:
        grade = "interesado"
    else:
        grade = "listo"

    critical_fields = _normalize_required_fields_for_answers(_CRITICAL_SCORING_FIELDS, answers)
    missing_fields: list[str] = []
    refused_fields: list[str] = []
    for field in critical_fields:
        value = answers.get(field)
        if value in (None, "", "unknown"):
            missing_fields.append(field)
        if value == "refused":
            refused_fields.append(field)

    completed_critical = len([field for field in critical_fields if field not in missing_fields])
    completion_ratio = completed_critical / max(1, len(critical_fields))
    if completion_ratio >= runtime_settings.confidence_high_min:
        confidence = "high"
    elif completion_ratio >= runtime_settings.confidence_medium_min:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "score_total": score_total,
        "grade": grade,
        "confidence": confidence,
        "factors": {
            "capacidad_financiera": financiera,
            "urgencia": urgencia,
            "nivel_decision": decision,
            "autoridad": autoridad,
            "interaccion_compromiso": interaccion,
        },
        "critical_fields": critical_fields,
        "missing_fields": missing_fields,
        "refused_fields": refused_fields,
    }


def _evaluate_interaction_score_from_events(events: dict[str, Any]) -> int:
    interaction_values: list[int] = []
    accepted_questions = _as_bool(events.get("accepted_answering_questions"))
    if accepted_questions is not None:
        interaction_values.append(100 if accepted_questions else 30)
    ratio = _as_ratio(events.get("answered_fields_ratio"))
    if ratio is not None:
        interaction_values.append(int(round(ratio * 100)))
    for event_key, positive_score, negative_score in (
        ("appointment_requested", 80, 30),
        ("appointment_scheduled", 100, 30),
    ):
        event_value = _as_bool(events.get(event_key))
        if event_value is not None:
            interaction_values.append(positive_score if event_value else negative_score)
    evasive_count_raw = events.get("evasive_answers_count")
    try:
        evasive_count = max(0, int(evasive_count_raw))
    except (TypeError, ValueError):
        evasive_count = 0
    interaction_values.append(max(20, 100 - min(evasive_count, 8) * 10))
    interaction_values.append(_field_score("response_time_bucket", events.get("response_time_bucket")))
    return _mean_score(interaction_values)


def _coerce_profile_weights(
    profile: dict[str, Any],
    runtime_settings: tenant_runtime.LeadScoringRuntimeSettings,
) -> dict[str, float]:
    weights_raw = _ensure_dict(profile.get("weights"))
    candidates = {
        "capacidad_financiera": _as_float(
            weights_raw.get("capacidad_financiera_weight")
            if "capacidad_financiera_weight" in weights_raw
            else weights_raw.get("capacidad_financiera")
        ),
        "urgencia": _as_float(
            weights_raw.get("urgencia_weight")
            if "urgencia_weight" in weights_raw
            else weights_raw.get("urgencia")
        ),
        "nivel_decision": _as_float(
            weights_raw.get("nivel_decision_weight")
            if "nivel_decision_weight" in weights_raw
            else weights_raw.get("nivel_decision")
        ),
        "autoridad": _as_float(
            weights_raw.get("autoridad_weight")
            if "autoridad_weight" in weights_raw
            else weights_raw.get("autoridad")
        ),
        "interaccion_compromiso": _as_float(
            weights_raw.get("interaccion_compromiso_weight")
            if "interaccion_compromiso_weight" in weights_raw
            else weights_raw.get("interaccion_compromiso")
        ),
    }
    if all(value is not None for value in candidates.values()):
        total = round(sum(float(value) for value in candidates.values()), 4)
        if abs(total - 100.0) < 0.0001:
            return {key: float(value) for key, value in candidates.items() if value is not None}
    return {
        "capacidad_financiera": runtime_settings.capacidad_financiera_weight,
        "urgencia": runtime_settings.urgencia_weight,
        "nivel_decision": runtime_settings.nivel_decision_weight,
        "autoridad": runtime_settings.autoridad_weight,
        "interaccion_compromiso": runtime_settings.interaccion_compromiso_weight,
    }


def _coerce_profile_thresholds(
    profile: dict[str, Any],
    runtime_settings: tenant_runtime.LeadScoringRuntimeSettings,
) -> tuple[float, float, float]:
    thresholds = _ensure_dict(profile.get("thresholds"))
    explorando = _as_float(thresholds.get("explorando_max"))
    interesado = _as_float(thresholds.get("interesado_max"))
    listo = _as_float(thresholds.get("listo_min"))
    if (
        explorando is not None
        and interesado is not None
        and listo is not None
        and 0.0 <= explorando <= interesado <= 100.0
        and 0.0 <= listo <= 100.0
        and listo >= interesado
    ):
        return explorando, interesado, listo
    return (
        runtime_settings.explorando_max,
        runtime_settings.interesado_max,
        runtime_settings.listo_min,
    )


def _coerce_profile_confidence_thresholds(
    profile: dict[str, Any],
    runtime_settings: tenant_runtime.LeadScoringRuntimeSettings,
) -> tuple[float, float]:
    confidence = _ensure_dict(profile.get("confidence_thresholds"))
    high = _as_ratio(confidence.get("high_min"))
    medium = _as_ratio(confidence.get("medium_min"))
    if high is not None and medium is not None and 0.0 <= medium <= high <= 1.0:
        return high, medium
    return runtime_settings.confidence_high_min, runtime_settings.confidence_medium_min


def _rule_matches_answer(rule: dict[str, Any], value: Any) -> bool:
    rule_type = str(rule.get("rule_type") or "equals").strip().lower()
    match_value = rule.get("match_value")

    if rule_type == "any":
        return True
    if value is None:
        return False

    if rule_type == "range":
        numeric = _as_float(value)
        if numeric is None:
            return False
        min_value = _as_float(rule.get("min_value"))
        max_value = _as_float(rule.get("max_value"))
        if min_value is not None and numeric < min_value:
            return False
        if max_value is not None and numeric > max_value:
            return False
        return True

    value_text = str(value).strip().lower()
    if not value_text:
        return False
    match_text = str(match_value or "").strip().lower()
    if rule_type == "contains":
        return bool(match_text) and match_text in value_text
    if rule_type == "in_set":
        options = {item.strip().lower() for item in match_text.split(",") if item.strip()}
        return value_text in options
    return bool(match_text) and value_text == match_text


def _score_answer_from_rules(
    *,
    field_key: str,
    answer_value: Any,
    question: dict[str, Any],
    rules: list[dict[str, Any]],
) -> int:
    for rule in rules:
        if _rule_matches_answer(rule, answer_value):
            score = rule.get("score")
            try:
                return max(0, min(int(score), 100))
            except (TypeError, ValueError):
                continue
    metadata = _ensure_dict(question.get("metadata"))
    if isinstance(answer_value, str):
        normalized = answer_value.strip().lower()
        if normalized in {"unknown", "refused"}:
            key = "unknown_score" if normalized == "unknown" else "refused_score"
            fallback = _as_float(metadata.get(key))
            if fallback is not None:
                return max(0, min(int(round(fallback)), 100))
    if answer_value in (None, ""):
        missing_score = _as_float(metadata.get("missing_score"))
        if missing_score is not None:
            return max(0, min(int(round(missing_score)), 100))
    return _field_score(field_key, answer_value)


async def _compute_lead_scoring_from_catalog(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    channel: Literal["whatsapp", "webchat"],
    answers: dict[str, Any],
    events: dict[str, Any],
    runtime_settings: tenant_runtime.LeadScoringRuntimeSettings,
) -> dict[str, Any] | None:
    profiling_enabled = await tenant_runtime.is_profiling_enabled(
        organizacion_id=organizacion_id,
        channel=channel,
    )
    profiles = await repo.list_scoring_profiles(
        organizacion_id=organizacion_id,
        canal=channel,
        only_active=True,
    )
    questions = await repo.list_scoring_questions(
        organizacion_id=organizacion_id,
        canal=channel,
        include_inactive=False,
    )
    rules = await repo.list_scoring_rules(
        organizacion_id=organizacion_id,
        canal=channel,
        include_inactive=False,
    )
    if not questions or not rules:
        logger.warning(
            "storage.lead_scoring.catalog_fallback_missing_config",
            extra={
                "organizacion_id": str(organizacion_id),
                "channel": channel,
                "questions_count": len(questions or []),
                "rules_count": len(rules or []),
            },
        )
        return None

    profile = profiles[0] if profiles else {}
    question_rules: dict[str, list[dict[str, Any]]] = {}
    for row in rules:
        question_id = str(row.get("question_id") or "").strip()
        if not question_id:
            continue
        question_rules.setdefault(question_id, []).append(row)
    for bucket in question_rules.values():
        bucket.sort(
            key=lambda item: (
                int(item.get("priority") or 100),
                str(item.get("id") or ""),
            )
        )

    factor_scores: dict[str, list[int]] = {
        "capacidad_financiera": [],
        "urgencia": [],
        "nivel_decision": [],
        "autoridad": [],
        "interaccion_compromiso": [],
    }
    for question in questions:
        field_key = str(question.get("field_key") or "").strip()
        question_id = str(question.get("id") or "").strip()
        if not field_key or not question_id:
            continue
        if field_key == "credit_preapproved" and _is_financing_cash(answers):
            continue
        metadata = _ensure_dict(question.get("metadata"))
        factor_name = str(metadata.get("factor") or _FIELD_FACTOR_MAP.get(field_key) or "").strip()
        if factor_name not in factor_scores:
            continue
        answer_value = answers.get(field_key)
        score_value = _score_answer_from_rules(
            field_key=field_key,
            answer_value=answer_value,
            question=question,
            rules=question_rules.get(question_id, []),
        )
        factor_scores[factor_name].append(score_value)

    factor_values = {
        "capacidad_financiera": _mean_score(factor_scores["capacidad_financiera"]),
        "urgencia": _mean_score(factor_scores["urgencia"]),
        "nivel_decision": _mean_score(factor_scores["nivel_decision"]),
        "autoridad": _mean_score(factor_scores["autoridad"]),
        "interaccion_compromiso": _mean_score(factor_scores["interaccion_compromiso"]),
    }
    event_interaction = _evaluate_interaction_score_from_events(events)
    factor_values["interaccion_compromiso"] = int(
        round((factor_values["interaccion_compromiso"] + event_interaction) / 2)
    )

    weights = _coerce_profile_weights(profile, runtime_settings)
    score_total = round(
        factor_values["capacidad_financiera"] * (weights["capacidad_financiera"] / 100.0)
        + factor_values["urgencia"] * (weights["urgencia"] / 100.0)
        + factor_values["nivel_decision"] * (weights["nivel_decision"] / 100.0)
        + factor_values["autoridad"] * (weights["autoridad"] / 100.0)
        + factor_values["interaccion_compromiso"] * (weights["interaccion_compromiso"] / 100.0),
        2,
    )

    explorando_max, interesado_max, _ = _coerce_profile_thresholds(profile, runtime_settings)
    if score_total <= explorando_max:
        grade = "explorando"
    elif score_total <= interesado_max:
        grade = "interesado"
    else:
        grade = "listo"

    required_fields: list[str] = []
    if profiling_enabled:
        for question in questions:
            field_key = str(question.get("field_key") or "").strip()
            if not field_key:
                continue
            if bool(question.get("required_for_case_a")) and field_key not in required_fields:
                required_fields.append(field_key)
        if not required_fields:
            logger.warning(
                "storage.lead_scoring.catalog_fallback_required_fields_default",
                extra={
                    "organizacion_id": str(organizacion_id),
                    "channel": channel,
                    "default_required_fields": list(_CRITICAL_SCORING_FIELDS),
                },
            )
            required_fields = list(_CRITICAL_SCORING_FIELDS)
    else:
        logger.warning(
            "profiling.mode.off",
            extra={
                "organizacion_id": str(organizacion_id),
                "channel": channel,
                "component": "storage.lead_scoring",
            },
        )
    required_fields = _normalize_required_fields_for_answers(required_fields, answers)

    missing_fields: list[str] = []
    refused_fields: list[str] = []
    for field in required_fields:
        value = answers.get(field)
        if value in (None, "", "unknown"):
            missing_fields.append(field)
        if value == "refused":
            refused_fields.append(field)
    completed_critical = len([field for field in required_fields if field not in missing_fields])
    completion_ratio = 1.0 if not required_fields else completed_critical / len(required_fields)
    high_min, medium_min = _coerce_profile_confidence_thresholds(profile, runtime_settings)
    if completion_ratio >= high_min:
        confidence = "high"
    elif completion_ratio >= medium_min:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "score_total": score_total,
        "grade": grade,
        "confidence": confidence,
        "factors": factor_values,
        "critical_fields": required_fields,
        "missing_fields": missing_fields,
        "refused_fields": refused_fields,
        "scoring_config_source": "catalog_db",
    }


async def register_webchat_message(
    *,
    session_id: str,
    author: str,
    content: str,
    response_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    inactivity_minutes: int | None = None,
    inactivity_hours: int | None = None,
    attachments: list[dict[str, Any]] | None = None,
    organizacion_id: str | None = None,
) -> dict[str, str | None]:
    """Invoca la RPC `registrar_mensaje_webchat` a través del repositorio CRM."""
    repo = CRMRepository()
    try:
        result = await repo.register_webchat_message(
            session_id=session_id,
            author=author,
            content=content,
            response_id=response_id,
            metadata=metadata or {},
            inactivity_minutes=inactivity_minutes,
            inactivity_hours=inactivity_hours,
            attachments=attachments or [],
            organizacion_id=organizacion_id,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    conversation_id = result.get("conversation_id")
    if conversation_id:
        try:
            await repo.update_conversation(
                conversation_id=conversation_id, patch={"canal": "webchat"}
            )
        except CRMRepositoryError as exc:
            logger.warning(
                "storage.webchat_channel_patch_failed",
                extra={"conversation_id": conversation_id, "error": str(exc)},
            )
    if author == "user":
        org_value = _safe_uuid(
            result.get("organizacion_id")
            or organizacion_id
            or (metadata or {}).get("resolved_organizacion_id")
        )
        await _ensure_inbound_assignment_before_notification(
            repo=repo,
            organizacion_id=org_value,
            conversation_id=str(result.get("conversation_id") or ""),
            persona_id=str(result.get("persona_id") or ""),
            channel="webchat",
        )
    try:
        persona_id_value = str(result.get("persona_id") or "")
        await _publish_inbox_realtime_event(
            organizacion_id=str(
                result.get("organizacion_id")
                or organizacion_id
                or (metadata or {}).get("resolved_organizacion_id")
                or ""
            ),
            event_type="inbox_message_created",
            payload={
                "channel": "webchat",
                "conversation_id": str(result.get("conversation_id") or ""),
                "persona_id": persona_id_value,
                "author": str(author or ""),
            },
        )
    except Exception:
        pass
    try:
        org_value = _safe_uuid(
            result.get("organizacion_id")
            or organizacion_id
            or (metadata or {}).get("resolved_organizacion_id")
        )
        await _notify_inbox_message(
            repo=repo,
            organizacion_id=org_value,
            conversation_id=str(result.get("conversation_id") or ""),
            persona_id=persona_id_value,
            channel="webchat",
            direction="entrante",
            author=author,
            message_text=content,
            message_id=str(result.get("message_id") or ""),
        )
    except Exception:
        pass
    return result


async def register_whatsapp_message(
    *,
    direction: Literal["entrante", "saliente"],
    wa_id: str | None,
    phone_e164: str | None,
    body: str | None,
    message_sid: str | None,
    profile_name: str | None = None,
    conversation_id: str | None = None,
    persona_id: str | None = None,
    contact_id: str | None = None,
    response_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    inactivity_minutes: int | None = None,
    inactivity_hours: int | None = None,
    attachments: list[dict[str, Any]] | None = None,
    webhook_payload: dict[str, Any] | None = None,
    organizacion_id: str | None = None,
) -> dict[str, Any]:
    """Invoca registrar_mensaje_whatsapp para almacenar interacciones del canal y ligar el webhook."""
    repo = CRMRepository()
    metadata_payload = dict(metadata or {})
    normalized_phone = normalize_phone(phone_e164) or phone_e164
    if organizacion_id and "resolved_organizacion_id" not in metadata_payload:
        metadata_payload["resolved_organizacion_id"] = organizacion_id
    resolved_persona_id = persona_id or contact_id
    resolved_conversation_id = conversation_id
    effective_inactivity_minutes = (
        inactivity_minutes
        if inactivity_minutes is not None
        else (inactivity_hours * 60 if inactivity_hours is not None else None)
    )

    try:
        result = await repo.register_whatsapp_message(
            direction=direction,
            wa_id=wa_id,
            phone_e164=normalized_phone,
            body=body,
            message_sid=message_sid,
            profile_name=profile_name,
            conversation_id=resolved_conversation_id,
            persona_id=resolved_persona_id,
            response_id=response_id,
            metadata=metadata_payload,
            inactivity_minutes=effective_inactivity_minutes,
            attachments=attachments,
            webhook_payload=webhook_payload,
            organizacion_id=organizacion_id,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    conversation_id = result.get("conversation_id")

    # El ledger es idempotente y se mantiene aislado del flujo principal: una
    # falla de configuración de tarifas nunca debe borrar ni impedir el
    # registro del mensaje ya aceptado por WhatsApp.
    billing_org = (
        result.get("organizacion_id")
        or organizacion_id
        or metadata_payload.get("resolved_organizacion_id")
    )
    try:
        billing_result = None
        for attempt in range(len(MESSAGE_BILLING_RETRY_DELAYS_SECONDS) + 1):
            try:
                billing_result = await message_billing.register_message_consumption(
                    repo=repo,
                    organizacion_id=str(billing_org or "") or None,
                    mensaje_id=str(result.get("message_id") or "") or None,
                    proveedor_mensaje_id=message_sid,
                    direccion=direction,
                    metadata=metadata_payload,
                    webhook_payload=webhook_payload,
                )
                break
            except CRMRepositoryError as exc:
                if attempt >= len(MESSAGE_BILLING_RETRY_DELAYS_SECONDS) or not _is_transient_message_billing_error(exc):
                    raise
                delay = MESSAGE_BILLING_RETRY_DELAYS_SECONDS[attempt]
                logger.warning(
                    "storage.message_billing_retry",
                    extra={
                        "message_id": str(result.get("message_id") or ""),
                        "organizacion_id": str(billing_org or ""),
                        "attempt": attempt + 1,
                        "next_attempt": attempt + 2,
                        "delay_seconds": delay,
                        "error": str(exc),
                    },
                )
                await asyncio.sleep(delay)
        if billing_result and billing_result.get("duplicado"):
            logger.info(
                "storage.message_billing_duplicate_ignored",
                extra={"message_id": str(result.get("message_id") or "")},
            )
    except (CRMRepositoryError, AttributeError) as exc:
        logger.warning(
            "storage.message_billing_failed",
            extra={
                "message_id": str(result.get("message_id") or ""),
                "organizacion_id": str(billing_org or ""),
                "error": str(exc),
            },
        )

    if (
        message_sid
        and str(metadata_payload.get("provider") or "").lower() == "meta"
        and billing_org
    ):
        try:
            await reconcile_delivery_events_for_message(
                provider="meta",
                message_sid=message_sid,
                organizacion_id=str(billing_org),
            )
        except StorageError as exc:
            logger.warning(
                "storage.delivery_event_reconciliation_failed",
                extra={
                    "message_sid": message_sid,
                    "organizacion_id": str(billing_org),
                    "error": str(exc),
                },
            )

    if direction == "entrante" and conversation_id:
        from app.services import whatsapp_followups as whatsapp_followup_jobs

        _schedule_background_coroutine(
            whatsapp_followup_jobs.cancel_followup_jobs_for_inbound(
                conversation_id=str(conversation_id),
                reason="customer_replied",
            ),
            label="cancel_whatsapp_followups_for_inbound",
        )
        org_value = _safe_uuid(
            result.get("organizacion_id")
            or organizacion_id
            or metadata_payload.get("resolved_organizacion_id")
        )
        await _ensure_inbound_assignment_before_notification(
            repo=repo,
            organizacion_id=org_value,
            conversation_id=str(conversation_id),
            persona_id=str(result.get("persona_id") or resolved_persona_id or ""),
            channel="whatsapp",
        )

    try:
        persona_id_value = str(result.get("persona_id") or "")
        _schedule_background_coroutine(
            _publish_inbox_realtime_event(
                organizacion_id=str(
                    result.get("organizacion_id")
                    or organizacion_id
                    or metadata_payload.get("resolved_organizacion_id")
                    or ""
                ),
                event_type="inbox_message_created",
                payload={
                    "channel": "whatsapp",
                    "conversation_id": str(result.get("conversation_id") or ""),
                    "persona_id": str(result.get("persona_id") or persona_id_value),
                    "direction": str(direction),
                },
            ),
            label="publish_whatsapp_inbox_realtime_event",
        )
    except Exception:
        pass
    try:
        org_value = _safe_uuid(
            result.get("organizacion_id") or organizacion_id or metadata_payload.get("resolved_organizacion_id")
        )
        _schedule_background_coroutine(
            _notify_inbox_message(
                repo=repo,
                organizacion_id=org_value,
                conversation_id=str(result.get("conversation_id") or ""),
                persona_id=persona_id_value,
                channel="whatsapp",
                direction=str(direction),
                message_text=body,
                message_id=str(result.get("message_id") or ""),
            ),
            label="notify_whatsapp_inbox_message",
        )
    except Exception:
        pass
    return result


async def register_sent_whatsapp_message(
    *,
    send_result: Any,
    to_number: str,
    organizacion_id: str,
    body: str | None = None,
    metadata: dict[str, Any] | None = None,
    attachments: list[dict[str, Any]] | None = None,
    conversation_id: str | None = None,
    persona_id: str | None = None,
) -> dict[str, Any] | None:
    """Persiste y contabiliza un WhatsApp aceptado por el proveedor.

    ``send_manual_message`` solo transporta el mensaje. Los emisores internos
    (recordatorios y avisos a vendedores) también deben pasar por el mismo
    registro canónico que usan las respuestas del agente y los follow-ups.
    """
    message_sid = str(getattr(send_result, "sid", None) or "").strip()
    if not message_sid:
        return None

    provider = str(getattr(send_result, "provider", None) or "meta").strip().lower()
    status = str(getattr(send_result, "status", None) or "sent").strip().lower()
    metadata_payload = dict(metadata or {})
    metadata_payload.setdefault("provider", provider)
    metadata_payload.setdefault("delivery_status", status)

    phone = str(to_number or "").strip()
    return await register_whatsapp_message(
        direction="saliente",
        wa_id=phone.lstrip("+"),
        phone_e164=phone,
        body=body,
        message_sid=message_sid,
        conversation_id=conversation_id,
        persona_id=persona_id,
        metadata=metadata_payload,
        attachments=attachments,
        organizacion_id=str(organizacion_id),
    )


async def register_messenger_message(
    *,
    sender_id: str,
    recipient_id: str | None = None,
    message_id: str | None = None,
    text: str | None = None,
    direction: Literal["entrante", "saliente"] = "entrante",
    metadata: dict[str, Any] | None = None,
    inactivity_hours: int | None = None,
    attachments: list[dict[str, Any]] | None = None,
    response_id: str | None = None,
    organizacion_id: str | None = None,
) -> dict[str, Any]:
    """Registra un mensaje inbound del canal Messenger y marca la conversación."""

    repo = CRMRepository()
    metadata_payload = dict(metadata or {})
    if organizacion_id and "resolved_organizacion_id" not in metadata_payload:
        metadata_payload["resolved_organizacion_id"] = organizacion_id
    try:
        result = await repo.register_messenger_message(
            sender_id=sender_id,
            recipient_id=recipient_id,
            message_id=message_id,
            content=text,
            direction=direction,
            metadata=metadata_payload,
            inactivity_hours=inactivity_hours,
            attachments=attachments or [],
            response_id=response_id,
            organizacion_id=organizacion_id,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    conversation_id = result.get("conversation_id")
    if conversation_id:
        try:
            await repo.update_conversation(
                conversation_id=conversation_id, patch={"canal": "messenger"}
            )
        except CRMRepositoryError as exc:
            logger.warning(
                "storage.messenger_channel_patch_failed",
                extra={"conversation_id": conversation_id, "error": str(exc)},
            )
    if direction == "entrante":
        org_value = _safe_uuid(
            result.get("organizacion_id")
            or organizacion_id
            or metadata_payload.get("resolved_organizacion_id")
        )
        await _ensure_inbound_assignment_before_notification(
            repo=repo,
            organizacion_id=org_value,
            conversation_id=str(conversation_id or ""),
            persona_id=str(result.get("persona_id") or ""),
            channel="messenger",
        )
    try:
        persona_id_value = str(result.get("persona_id") or "")
        await _publish_inbox_realtime_event(
            organizacion_id=str(
                result.get("organizacion_id")
                or organizacion_id
                or metadata_payload.get("resolved_organizacion_id")
                or ""
            ),
            event_type="inbox_message_created",
            payload={
                "channel": "messenger",
                "conversation_id": str(result.get("conversation_id") or ""),
                "persona_id": persona_id_value,
                "direction": str(direction),
            },
        )
    except Exception:
        pass
    try:
        org_value = _safe_uuid(
            result.get("organizacion_id") or organizacion_id or metadata_payload.get("resolved_organizacion_id")
        )
        await _notify_inbox_message(
            repo=repo,
            organizacion_id=org_value,
            conversation_id=str(result.get("conversation_id") or ""),
            persona_id=persona_id_value,
            channel="messenger",
            direction=str(direction),
            message_text=text,
            message_id=str(result.get("message_id") or ""),
        )
    except Exception:
        pass
    return result


async def fetch_message_by_twilio_sid(message_sid: str | None) -> dict[str, Any] | None:
    """Recupera un mensaje existente usando el SID de Twilio."""
    if not message_sid:
        return None
    repo = CRMRepository()
    try:
        return await repo.get_message_by_twilio_sid(message_sid=message_sid)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_conversation(conversation_id: str) -> dict[str, Any]:
    """Recupera metadatos de una conversación incluyendo control manual."""
    repo = CRMRepository()
    try:
        row = await repo.get_conversation_with_controls(conversation_id=conversation_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    inbox_context: dict[str, Any] = {}
    try:
        inbox_row = await repo.get_conversation_inbox_context(conversation_id=conversation_id)
        inbox_context = _ensure_dict(inbox_row.get("inbox_context"))
    except CRMRepositoryError:
        inbox_context = {}
    ctrl = row.get("conversaciones_controles")
    channel_value = row.get("canal")
    try:
        latest_messages = await repo.fetch_recent_messages(conversation_id=conversation_id, limit=1)
    except CRMRepositoryError:
        latest_messages = []
    if latest_messages:
        latest = latest_messages[-1]
        datos = latest.get("datos")
        if isinstance(datos, str):
            try:
                datos = json.loads(datos)
            except json.JSONDecodeError:
                datos = {}
        if isinstance(datos, dict):
            override_channel = datos.get("channel") or datos.get("canal")
            if isinstance(override_channel, str) and override_channel.strip():
                channel_value = override_channel.strip().lower()
    manual_override = _normalize_manual_override(ctrl)
    return {
        "id": row.get("id"),
        "channel": channel_value,
        "openai_conversation_id": row.get("conversacion_openai_id"),
        "last_response_id": row.get("last_response_id"),
        "organizacion_id": row.get("organizacion_id"),
        "persona_id": row.get("persona_id") or row.get("contacto_id"),
        "contact_id": row.get("contacto_id"),
        "manual_override": manual_override,
        "inbox_context": inbox_context,
    }


async def fetch_webchat_conversation(conversation_id: str) -> dict[str, Any]:
    """Alias mantenido por compatibilidad para el canal webchat."""
    return await fetch_conversation(conversation_id)


async def get_webchat_persona_id(session_id: str) -> str | None:
    """Devuelve la persona asociada a un session_id para el canal webchat."""
    repo = CRMRepository()
    try:
        return await repo.get_webchat_persona_id_by_session(session_id=session_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_webchat_session_id_by_persona(persona_id: str) -> str | None:
    """Obtiene el session_id asociado a una persona para el canal webchat."""
    repo = CRMRepository()
    try:
        return await repo.get_webchat_session_by_persona(persona_id=persona_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def resolve_webchat_conversation_from_session(
    session_id: str,
) -> dict[str, Any] | None:
    """Obtiene la última conversación webchat asociada a un session_id."""
    persona_id = await get_webchat_persona_id(session_id)
    if not persona_id:
        return None

    repo = CRMRepository()
    try:
        row = await repo.get_latest_webchat_conversation(persona_id=persona_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    if not row:
        return None
    ctrl = row.get("conversaciones_controles")
    manual_override = _normalize_manual_override(ctrl)
    resolved_persona_id = row.get("persona_id") or row.get("contacto_id") or persona_id
    return {
        "id": row.get("id"),
        "persona_id": resolved_persona_id,
        "contact_id": row.get("contacto_id") or resolved_persona_id,
        "channel": row.get("canal"),
        "openai_conversation_id": row.get("conversacion_openai_id"),
        "last_response_id": row.get("last_response_id"),
        "manual_override": manual_override,
    }


async def record_webchat_session_closure(session_id: str) -> None:
    """Persiste el cierre explícito de una sesión webchat."""
    repo = CRMRepository()
    try:
        await repo.record_webchat_session_closure(session_id=session_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def record_webchat_visit(
    session_id: str,
    *,
    ip: str | None = None,
    device_type: str | None = None,
    geo: dict[str, Any] | None = None,
    cve_ent: str | None = None,
    nom_ent: str | None = None,
    cve_mun: str | None = None,
    nom_mun: str | None = None,
    cvegeo: str | None = None,
    referrer: str | None = None,
    landing_url: str | None = None,
    organizacion_id: str | None = None,
) -> None:
    """Actualiza/crea el registro del visitante con metadata adicional."""
    repo = CRMRepository()

    payload: dict[str, Any] = {}
    if ip:
        payload["p_ip"] = ip
    if device_type:
        payload["p_device_type"] = device_type
    if geo:
        payload["p_geo"] = geo
    if cve_ent:
        payload["p_cve_ent"] = cve_ent
    if nom_ent:
        payload["p_nom_ent"] = nom_ent
    if cve_mun:
        payload["p_cve_mun"] = cve_mun
    if nom_mun:
        payload["p_nom_mun"] = nom_mun
    if cvegeo:
        payload["p_cvegeo"] = cvegeo
    if referrer:
        payload["p_referrer"] = referrer
    if landing_url:
        payload["p_landing_url"] = landing_url
    if organizacion_id:
        payload["p_organizacion_id"] = organizacion_id

    try:
        await repo.record_webchat_visit(session_id=session_id, payload=payload)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def update_conversation(conversation_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    """Actualiza campos de una conversación."""
    repo = CRMRepository()
    try:
        return await repo.update_conversation(conversation_id=conversation_id, patch=patch)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def merge_conversation_inbox_context(
    conversation_id: str,
    patch: dict[str, Any],
) -> dict[str, Any]:
    """Mezcla contexto persistente de inbox sin reemplazar campos no relacionados."""
    repo = CRMRepository()
    try:
        row = await repo.get_conversation_inbox_context(conversation_id=conversation_id)
        current_context = _ensure_dict(row.get("inbox_context"))
        incoming_context = _ensure_dict(patch)
        if not incoming_context:
            return row
        if (
            str(current_context.get("source") or "").strip().lower() == "publicidad_whatsapp"
            and str(incoming_context.get("source") or "").strip().lower() == "prospeccion"
        ):
            incoming_context = dict(incoming_context)
            incoming_context.pop("source", None)
            incoming_context.pop("source_detail", None)
        merged_context = _deep_merge_dict(current_context, incoming_context)
        if merged_context == current_context:
            return row
        return await repo.update_conversation(
            conversation_id=conversation_id,
            patch={"inbox_context": merged_context},
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def upsert_conversation_insights(
    *,
    conversation_id: str,
    resumen: str | None = None,
    intencion: str | None = None,
    siguiente_accion: str | None = None,
    lead_score: int | None = None,
) -> None:
    """Actualiza o inserta insights de conversación."""
    repo = CRMRepository()
    try:
        await repo.upsert_conversation_insights(
            conversation_id=conversation_id,
            resumen=resumen,
            intencion=intencion,
            siguiente_accion=siguiente_accion,
            lead_score=lead_score,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def refresh_persona_insights_from_conversation(
    *,
    conversation_id: str,
    persona_id: str | None,
    summary_text: str | None = None,
    source: str = "conversation_summary",
) -> dict[str, Any] | None:
    """Rellena/normaliza notes y necesidad_proposito sin pisar valores manuales buenos."""
    if not persona_id:
        return None
    try:
        persona = await fetch_persona(persona_id)
    except StorageError as exc:
        logger.warning(
            "storage.refresh_persona_insights.persona_lookup_failed",
            extra={"persona_id": persona_id, "conversation_id": conversation_id, "error": str(exc)},
        )
        return None
    if not persona:
        return None

    resolved_summary = _clean_text(summary_text)
    if not resolved_summary:
        try:
            summary_row = await fetch_latest_conversation_summary(conversation_id=conversation_id)
        except StorageError:
            summary_row = None
        if isinstance(summary_row, dict):
            resolved_summary = _clean_text(summary_row.get("resumen"))

    notes, necesidad = _build_persona_insights(persona=persona, summary_text=resolved_summary)
    current_notes = _clean_text(persona.get("notes"))
    current_need = _clean_text(persona.get("necesidad_proposito"))
    patch: dict[str, Any] = {}
    if not current_notes or _looks_like_placeholder_insight(current_notes):
        patch["notes"] = notes
    if not current_need or _looks_like_placeholder_insight(current_need):
        patch["necesidad_proposito"] = necesidad
    if not patch:
        return {
            "persona_id": persona_id,
            "notes": current_notes,
            "necesidad_proposito": current_need,
            "updated": False,
        }

    try:
        await update_persona(persona_id, patch)
    except StorageError as exc:
        logger.warning(
            "storage.refresh_persona_insights.update_failed",
            extra={"persona_id": persona_id, "conversation_id": conversation_id, "error": str(exc), "source": source},
        )
        return None

    try:
        await upsert_conversation_insights(
            conversation_id=conversation_id,
            resumen=patch.get("notes", notes),
            intencion=patch.get("necesidad_proposito", necesidad),
        )
    except StorageError as exc:
        logger.warning(
            "storage.refresh_persona_insights.insights_update_failed",
            extra={"persona_id": persona_id, "conversation_id": conversation_id, "error": str(exc), "source": source},
        )

    return {
        "persona_id": persona_id,
        "notes": patch.get("notes", current_notes),
        "necesidad_proposito": patch.get("necesidad_proposito", current_need),
        "updated": True,
    }


async def get_manual_override(conversation_id: str) -> bool:
    """Indica si la conversación está en modo manual (sin asistente)."""
    repo = CRMRepository()
    try:
        return await repo.get_manual_override(conversation_id=conversation_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_manual_overrides(conversation_ids: list[str]) -> dict[str, bool]:
    """Obtiene flags manual_override para un conjunto de conversaciones."""
    repo = CRMRepository()
    try:
        return await repo.fetch_manual_overrides(conversation_ids=conversation_ids)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def set_manual_override(conversation_id: str, manual: bool) -> None:
    """Activa o desactiva el modo manual para una conversación."""
    repo = CRMRepository()
    try:
        await repo.set_manual_override(conversation_id=conversation_id, manual=manual)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_recent_messages(*, conversation_id: str, limit: int = 8) -> list[dict[str, Any]]:
    """Obtiene los últimos mensajes de una conversación para construir historial.

    Retorna elementos con claves: direccion (entrante/saliente), texto, creado_en, datos.
    """
    try:
        repo = CRMRepository()
        return await repo.fetch_recent_messages(conversation_id=conversation_id, limit=limit)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def create_conversation_summary(
    *,
    conversation_id: str,
    resumen: str,
    persona_id: str | None = None,
    organizacion_id: str | None = None,
    tipo: str | None = None,
    metadatos: dict[str, Any] | None = None,
    creado_por_usuario_id: str | None = None,
) -> dict[str, Any]:
    """Inserta un resumen de conversación generado por el asistente."""
    repo = CRMRepository()
    try:
        return await repo.create_conversation_summary(
            conversacion_id=conversation_id,
            resumen=resumen,
            persona_id=persona_id,
            organizacion_id=organizacion_id,
            tipo=tipo,
            metadatos=metadatos,
            creado_por_usuario_id=creado_por_usuario_id,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def create_persona_conversation_summary(
    *,
    conversation_id: str,
    resumen: str,
    persona_id: str | None = None,
    organizacion_id: str | None = None,
    tipo: str | None = None,
    metadatos: dict[str, Any] | None = None,
    creado_por_usuario_id: str | None = None,
) -> dict[str, Any]:
    """Alias con nombre de persona para el resumen de conversación."""
    return await create_conversation_summary(
        conversation_id=conversation_id,
        resumen=resumen,
        persona_id=persona_id,
        organizacion_id=organizacion_id,
        tipo=tipo,
        metadatos=metadatos,
        creado_por_usuario_id=creado_por_usuario_id,
    )


async def fetch_latest_conversation_summary(
    *, conversation_id: str, tipo: str | None = None
) -> dict[str, Any] | None:
    """Recupera el resumen más reciente para una conversación."""
    repo = CRMRepository()
    try:
        return await repo.fetch_latest_conversation_summary(
            conversation_id=conversation_id,
            tipo=tipo,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def upload_webchat_attachment(
    *,
    file: UploadFile,
    session_id: str | None,
    conversation_id: str | None,
) -> dict[str, Any]:
    """Sube un adjunto al bucket `webchat` y devuelve metadatos normalizados."""

    content = await file.read()
    if not content:
        raise StorageError("El archivo a subir está vacío")

    original_name = file.filename or "adjunto"
    safe_name = Path(original_name).name
    extension = Path(safe_name).suffix
    prefix = conversation_id or session_id or "general"
    key = f"{prefix}/{uuid4().hex}{extension}"

    repo = CRMRepository()
    try:
        public_path = await repo.upload_webchat_object(
            object_key=key,
            content=content,
            content_type=file.content_type,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    base_url = settings.supabase_url.rstrip("/") if settings.supabase_url else ""
    public_url = f"{base_url}/storage/v1/object/public/{public_path}" if base_url else public_path

    return {
        "url": public_url,
        "name": safe_name,
        "mime": file.content_type,
        "size": len(content),
        "provider_id": public_path,
        "path": public_path,
    }


async def upload_whatsapp_attachment(
    *,
    content: bytes,
    filename: str,
    content_type: str | None = None,
    conversation_id: str | None = None,
) -> dict[str, Any]:
    """Sube un adjunto entrante de WhatsApp al bucket privado `whatsapp`."""

    if not content:
        raise StorageError("El archivo a subir está vacío")

    safe_name = Path(filename).name or "whatsapp-attachment"
    extension = Path(safe_name).suffix
    prefix = conversation_id or "whatsapp"
    key = f"{prefix}/{uuid4().hex}{extension}"

    repo = CRMRepository()
    try:
        public_path = await repo.upload_storage_object(
            bucket="whatsapp",
            object_key=key,
            content=content,
            content_type=content_type or "application/octet-stream",
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    try:
        access_url = await repo.create_signed_storage_url(
            bucket="whatsapp",
            object_path=public_path,
            expires_in=3600,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    return {
        "url": access_url,
        "name": safe_name,
        "mime": content_type,
        "size": len(content),
        "provider_id": public_path,
        "path": public_path,
    }


async def upload_quote_document(
    *,
    content: bytes,
    filename: str,
    lead_id: str,
    content_type: str = "application/pdf",
    document_type: str | None = None,
) -> dict[str, str]:
    """Sube el PDF de una cotización al bucket `quotes`."""

    safe_name = Path(filename).name or "cotizacion.pdf"
    extension = Path(safe_name).suffix or ".pdf"
    doc_folder = Path(str(document_type).strip()).name if document_type else ""
    key = f"{lead_id}/{doc_folder}/{uuid4().hex}{extension}" if doc_folder else f"{lead_id}/{uuid4().hex}{extension}"
    repo = CRMRepository()
    try:
        public_path = await repo.upload_storage_object(
            bucket="quotes",
            object_key=key,
            content=content,
            content_type=content_type,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    try:
        signed_url = await repo.create_signed_storage_url(
            bucket="quotes",
            object_path=public_path,
            expires_in=3600,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    return {
        "url": signed_url,
        "path": public_path,
        "bucket": "quotes",
        "name": safe_name,
    }


async def generate_quote_signed_url(*, path: str, expires_in: int = 300) -> str:
    """Genera un enlace firmado temporal para una cotización almacenada."""

    normalized = path.strip().lstrip("/")
    if not normalized:
        raise StorageError("quote_path_required")

    bucket, _, key = normalized.partition("/")
    if not bucket or not key:
        raise StorageError("quote_path_invalid")

    repo = CRMRepository()
    try:
        return await repo.create_signed_storage_url(
            bucket=bucket,
            object_path=f"{bucket}/{key}",
            expires_in=expires_in,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def upload_logo_asset(*, file: UploadFile, folder: str = "general") -> dict[str, str]:
    """Sube un logo general al bucket `logos` y devuelve metadatos básicos."""

    if not settings.supabase_url:
        raise StorageError("Supabase no está configurado (SUPABASE_URL)")

    content = await file.read()
    if not content:
        raise StorageError("El archivo de logo está vacío")

    original_name = file.filename or "logo.png"
    safe_name = Path(original_name).name
    extension = Path(safe_name).suffix or ".png"
    key = f"{folder}/{uuid4().hex}{extension}"

    repo = CRMRepository()
    try:
        public_path = await repo.upload_storage_object(
            bucket="logos",
            object_key=key,
            content=content,
            content_type=file.content_type,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    base_url = settings.supabase_url.rstrip("/")
    public_url = f"{base_url}/storage/v1/object/public/{public_path}"

    return {
        "url": public_url,
        "path": public_path,
        "name": safe_name,
        "mime": file.content_type or "application/octet-stream",
    }


async def upload_media_asset(
    *,
    file: UploadFile,
    folder: str = "general",
) -> dict[str, str]:
    """Sube una imagen de catálogo al bucket `recursos` y devuelve metadatos básicos."""

    if not settings.supabase_url:
        raise StorageError("Supabase no está configurado (SUPABASE_URL)")

    content = await file.read()
    if not content:
        raise StorageError("El archivo de recursos está vacío")

    original_name = file.filename or "recurso"
    safe_name = Path(original_name).name
    extension = Path(safe_name).suffix or ".png"
    key = f"{folder}/{uuid4().hex}{extension}"

    repo = CRMRepository()
    try:
        public_path = await repo.upload_storage_object(
            bucket="recursos",
            object_key=key,
            content=content,
            content_type=file.content_type,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    base_url = settings.supabase_url.rstrip("/")
    public_url = f"{base_url}/storage/v1/object/public/{public_path}"

    return {
        "url": public_url,
        "path": public_path,
        "name": safe_name,
        "mime": file.content_type or "application/octet-stream",
    }


async def upload_cliente_document(
    *, file: UploadFile, cliente_id: str, document_type: str
) -> dict[str, Any]:
    """Sube un documento de cliente al bucket `clientes`."""

    if not settings.supabase_url:
        raise StorageError("Supabase no está configurado (SUPABASE_URL)")

    content = await file.read()
    if not content:
        raise StorageError("El archivo de cliente está vacío")

    original_name = file.filename or "documento"
    safe_name = Path(original_name).name
    extension = Path(safe_name).suffix
    key = f"{cliente_id}/{document_type}/{uuid4().hex}{extension}"

    repo = CRMRepository()
    try:
        public_path = await repo.upload_storage_object(
            bucket="clientes",
            object_key=key,
            content=content,
            content_type=file.content_type,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    base_url = settings.supabase_url.rstrip("/")
    storage_url = f"{base_url}/storage/v1/object/{public_path}"

    return {
        "url": storage_url,
        "path": public_path,
        "name": safe_name,
        "mime": file.content_type,
        "size": len(content),
    }


async def fetch_persona(persona_id: str) -> dict[str, Any]:
    """Obtiene la representación de la persona indicada."""
    repo = CRMRepository()
    try:
        row = await repo.get_persona_by_id(persona_id=persona_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    if not row:
        raise StorageError("Persona no encontrada")
    return _normalize_persona_payload(row)


async def fetch_persona_context(*, conversation_id: str, persona_id: str) -> dict[str, Any]:
    """Obtiene la persona y la oportunidad más relevante asociada."""
    repo = CRMRepository()
    try:
        persona = await repo.get_persona_by_id(persona_id=persona_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    if not persona:
        return {"contact": None, "opportunity": None}

    try:
        persona_uuid = UUID(str(persona.get("id") or persona_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("persona_id_invalido") from exc

    try:
        opportunity = await repo.get_contact_opportunity(
            contact_id=persona_uuid,
            conversation_id=conversation_id,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    try:
        conversation_row = await repo.get_conversation_inbox_context(conversation_id=conversation_id)
    except CRMRepositoryError:
        conversation_row = {}

    return {
        "persona": persona,
        "contact": persona,
        "opportunity": opportunity,
        "conversation": conversation_row,
    }


async def fetch_persona_identities(persona_id: str) -> list[dict[str, Any]]:
    """Alias con nombre de persona para identidades de canal."""
    repo = CRMRepository()
    try:
        return await repo.list_persona_identities(persona_id=persona_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def record_delivery_event(
    *,
    provider: str,
    message_sid: str,
    event: str,
    raw_payload: dict[str, Any] | None = None,
    error_code: str | None = None,
    provider_timestamp: str | None = None,
    organizacion_id: str | None = None,
) -> None:
    """Inserta un callback y conserva su estado explicito de conciliacion."""
    repo = CRMRepository()
    try:
        await repo.record_delivery_event(
            provider=provider,
            message_sid=message_sid,
            event=event,
            raw_payload=raw_payload,
            error_code=error_code,
            provider_timestamp=provider_timestamp,
            organizacion_id=organizacion_id,
        )
        if provider == "meta":
            pricing_fields = message_billing.extract_meta_pricing_fields(raw_payload)
            if pricing_fields:
                await repo.update_billing_meta_message(
                    proveedor=provider,
                    proveedor_mensaje_id=message_sid,
                    estado_proveedor=event,
                    **pricing_fields,
                )
    except (CRMRepositoryError, AttributeError) as exc:
        raise StorageError(str(exc)) from exc


async def reconcile_delivery_events_for_message(
    *,
    provider: str,
    message_sid: str,
    organizacion_id: str,
) -> int:
    """Liga callbacks tempranos, actualiza conciliacion y aplica pricing."""
    repo = CRMRepository()
    try:
        messages = await repo.list_messages_by_provider_id(
            provider_message_id=message_sid,
            organizacion_id=organizacion_id,
        )
        if not messages:
            return 0
        message = messages[0]
        message_id = str(message.get("id") or "")
        if not message_id:
            return 0
        events = await repo.link_pending_delivery_events(
            provider=provider,
            message_sid=message_sid,
            message_id=message_id,
            organizacion_id=organizacion_id,
        )
        for event in events:
            pricing_fields = message_billing.extract_meta_pricing_fields(event.get("payload_crudo"))
            if pricing_fields:
                await repo.update_billing_meta_message(
                    proveedor=provider,
                    proveedor_mensaje_id=message_sid,
                    estado_proveedor=event.get("evento"),
                    **pricing_fields,
                )
        return len(events)
    except (CRMRepositoryError, AttributeError) as exc:
        raise StorageError(str(exc)) from exc


async def fetch_calendar_settings(slug: str = DEFAULT_CALENDAR_SETTINGS_SLUG) -> dict[str, Any]:
    """Obtiene la configuración de recordatorios del calendario (activación y offset)."""
    repo = CRMRepository()
    try:
        record = await repo.get_calendar_settings(slug=slug)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    if record is None:
        record = {}
    return {
        "reminder_enabled": bool(record.get("reminder_enabled", True)),
        "reminder_offset_minutes": int(record.get("reminder_offset_minutes") or 120),
        "updated_at": record.get("updated_at"),
    }


async def update_calendar_booking_metadata(
    *,
    booking_id: str,
    metadata_patch: dict[str, Any],
    current_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Fusiona y persiste metadata asociada a una reserva del calendario."""
    if not metadata_patch:
        return current_metadata or {}
    merged: dict[str, Any] = {}
    if current_metadata:
        merged.update(current_metadata)
    merged.update(metadata_patch)

    repo = CRMRepository()
    try:
        await repo.update_calendar_booking_metadata(booking_id=booking_id, metadata=merged)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    return merged


async def fetch_email_template(
    slug: str = "default",
    organizacion_id: str | None = None,
) -> dict[str, Any] | None:
    """Recupera el template de correo configurado para envíos manuales."""
    repo = CRMRepository()
    try:
        row = await repo.get_email_template(slug=slug, organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    if not row:
        return None

    intro = row.get("intro")
    intro_text = intro.strip() if isinstance(intro, str) else ""

    closing = row.get("closing")
    closing_text = closing.strip() if isinstance(closing, str) else ""

    highlights_raw = row.get("highlights")
    if isinstance(highlights_raw, str):
        try:
            highlights_raw = json.loads(highlights_raw)
        except json.JSONDecodeError:
            highlights_raw = []
    if not isinstance(highlights_raw, list):
        highlights_raw = []
    highlights = [
        str(item).strip()
        for item in highlights_raw
        if isinstance(item, (str, int, float)) and str(item).strip()
    ]

    resources_raw = row.get("resources")
    if isinstance(resources_raw, str):
        try:
            resources_raw = json.loads(resources_raw)
        except json.JSONDecodeError:
            resources_raw = []
    if not isinstance(resources_raw, list):
        resources_raw = []
    resources: list[dict[str, str]] = []
    for entry in resources_raw:
        if not isinstance(entry, dict):
            continue
        label = str(entry.get("label") or "").strip()
        url = str(entry.get("url") or "").strip()
        if not label or not url:
            continue
        resources.append({"label": label, "url": url})

    use_summary = row.get("use_summary")
    use_highlights = row.get("use_highlights")
    use_resources = row.get("use_resources")

    signature_salutation = row.get("signature_salutation")
    signature_text = row.get("signature")

    return {
        "intro": intro_text,
        "highlights": highlights,
        "resources": resources,
        "closing": closing_text,
        "use_summary": (bool(use_summary) if isinstance(use_summary, bool) else use_summary),
        "use_highlights": (
            bool(use_highlights) if isinstance(use_highlights, bool) else use_highlights
        ),
        "use_resources": (
            bool(use_resources) if isinstance(use_resources, bool) else use_resources
        ),
        "signature_salutation": (
            signature_salutation.strip()
            if isinstance(signature_salutation, str)
            else signature_salutation
        ),
        "signature": (
            signature_text.strip() if isinstance(signature_text, str) else signature_text
        ),
        "updated_at": row.get("updated_at"),
    }


async def update_persona(persona_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    """Alias con nombre de persona para actualizar perfil."""
    if not patch:
        raise StorageError("No se proporcionaron datos para actualizar la persona")
    full_name = _clean_text(patch.get("nombre_completo"))
    if full_name:
        first_name, apellido_paterno, apellido_materno = _split_person_name(full_name)
        if first_name and not _clean_text(patch.get("nombre")):
            patch["nombre"] = first_name
        if apellido_paterno and not _clean_text(patch.get("apellido_paterno")):
            patch["apellido_paterno"] = apellido_paterno
        if apellido_materno and not _clean_text(patch.get("apellido_materno")):
            patch["apellido_materno"] = apellido_materno
    for phone_key in (
        "telefono_e164",
        "telefono_principal_e164",
        "telefono_movil_1_e164",
        "telefono_movil_2_e164",
        "telefono_secundario_e164",
    ):
        phone_value = patch.get(phone_key)
        if phone_value is not None:
            patch[phone_key] = normalize_phone(phone_value)
    repo = CRMRepository()
    try:
        row = await repo.update_persona_by_id(persona_id=persona_id, patch=patch)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    return _normalize_persona_payload(row)


async def fetch_visitantes_estados(
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de visitantes sin chat agregados por estado."""
    repo = CRMRepository()
    try:
        return await repo.visitas_estados(date_from=date_from, date_to=date_to)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_visitantes_municipios(
    state_code: str,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de visitantes sin chat agregados por municipio."""
    repo = CRMRepository()
    try:
        return await repo.visitas_municipios(
            state_code=state_code,
            date_from=date_from,
            date_to=date_to,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_visitantes_paises(
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de visitantes agrupados por país."""
    repo = CRMRepository()
    try:
        return await repo.visitas_paises(date_from=date_from, date_to=date_to)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_webchat_visitas_detalle(
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    has_chat: bool | None = None,
    session: str | None = None,
    ip: str | None = None,
    state: str | None = None,
    country: str | None = None,
    city: str | None = None,
    search: str | None = None,
    visit_min: int | None = None,
    visit_max: int | None = None,
    first_from: datetime | None = None,
    first_to: datetime | None = None,
    last_from: datetime | None = None,
    last_to: datetime | None = None,
    stay_min: float | None = None,
    stay_max: float | None = None,
    avg_stay_min: float | None = None,
    avg_stay_max: float | None = None,
    contact_status: str | None = None,
    device_types: list[str] | None = None,
    referrer: str | None = None,
    landing: str | None = None,
    order_by: str | None = None,
    order_dir: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    """Consulta visitas (con y sin chat) del webchat para el panel."""
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    country_value = country.strip() if isinstance(country, str) else country
    if isinstance(country_value, str) and not country_value:
        country_value = None
    city_value = city.strip() if isinstance(city, str) else city
    if isinstance(city_value, str) and not city_value:
        city_value = None

    payload: dict[str, Any] = {
        "p_limit": limit,
        "p_offset": offset,
        "p_country": country_value,
        "p_city": city_value,
    }
    if date_from:
        payload["p_from"] = date_from.isoformat()
    if date_to:
        payload["p_to"] = date_to.isoformat()
    if has_chat is not None:
        payload["p_has_chat"] = has_chat
    if state:
        payload["p_state"] = state
    if search:
        payload["p_search"] = search
    if session:
        payload["p_session"] = session
    if ip:
        payload["p_ip"] = ip
    if visit_min is not None:
        payload["p_visit_min"] = visit_min
    if visit_max is not None:
        payload["p_visit_max"] = visit_max
    if first_from:
        payload["p_first_from"] = first_from.isoformat()
    if first_to:
        payload["p_first_to"] = first_to.isoformat()
    if last_from:
        payload["p_last_from"] = last_from.isoformat()
    if last_to:
        payload["p_last_to"] = last_to.isoformat()
    if stay_min is not None:
        payload["p_stay_min"] = stay_min
    if stay_max is not None:
        payload["p_stay_max"] = stay_max
    if avg_stay_min is not None:
        payload["p_avg_stay_min"] = avg_stay_min
    if avg_stay_max is not None:
        payload["p_avg_stay_max"] = avg_stay_max
    if contact_status:
        payload["p_contact_status"] = contact_status
    if device_types:
        payload["p_device_types"] = device_types
    if referrer:
        payload["p_referrer"] = referrer
    if landing:
        payload["p_landing"] = landing
    if order_by:
        payload["p_order_by"] = order_by
    if order_dir:
        payload["p_order_dir"] = order_dir

    repo = CRMRepository()
    try:
        data = await repo.visitas_detalle_custom(payload=payload)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    total = 0
    total_chat = 0
    total_no_chat = 0
    cleaned: list[dict[str, Any]] = []
    for row in data:
        if not isinstance(row, dict):
            continue
        if total == 0:
            try:
                total = int(row.get("total_rows") or 0)
            except (TypeError, ValueError):
                total = 0
        if total_chat == 0:
            try:
                total_chat = int(row.get("total_chat_rows") or 0)
            except (TypeError, ValueError):
                total_chat = 0
        if total_no_chat == 0:
            try:
                total_no_chat = int(row.get("total_no_chat_rows") or 0)
            except (TypeError, ValueError):
                total_no_chat = 0
        row.pop("total_rows", None)
        row.pop("total_chat_rows", None)
        row.pop("total_no_chat_rows", None)
        cleaned.append(row)

    return {
        "items": cleaned,
        "total": total,
        "total_chat": total_chat,
        "total_no_chat": total_no_chat,
        "limit": limit,
        "offset": offset,
    }


async def fetch_leads_states(
    *,
    channels: list[str] | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de leads agrupados por estado."""
    repo = CRMRepository()
    try:
        return await repo.leads_estados(
            channels=channels,
            date_from=date_from,
            date_to=date_to,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_leads_municipios(
    state_code: str,
    *,
    channels: list[str] | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    """Recupera totales de leads agrupados por municipio."""
    repo = CRMRepository()
    try:
        return await repo.leads_municipios(
            state_code=state_code,
            channels=channels,
            date_from=date_from,
            date_to=date_to,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def ensure_conversation_opportunity(
    *,
    conversation_id: str,
    persona_id: str | None = None,
    contact_id: str | None = None,
    channel: str | None = None,
    force_new_opportunity_on_restart: bool = False,
    include_restart_metadata: bool = False,
    require_contact_ready: bool | None = None,
) -> str | dict[str, Any]:
    """Resuelve o crea una oportunidad CRM asociada a la conversación actual."""

    def _extract_cached_opportunity_id(conversation_row: dict[str, Any] | None) -> str | None:
        if not isinstance(conversation_row, dict):
            return None
        inbox_context = _ensure_dict(conversation_row.get("inbox_context"))
        crm_context = _ensure_dict(inbox_context.get("crm"))
        candidates = (
            inbox_context.get("opportunity_id"),
            inbox_context.get("oportunidad_id"),
            crm_context.get("opportunity_id"),
            crm_context.get("oportunidad_id"),
        )
        for value in candidates:
            text = str(value or "").strip()
            if not text:
                continue
            try:
                return str(UUID(text))
            except (TypeError, ValueError):
                continue
        return None

    resolved_persona_id = persona_id or contact_id
    if not resolved_persona_id:
        raise StorageError("No fue posible resolver contacto para crear la oportunidad")

    repo = CRMRepository()
    conversation_row: dict[str, Any] | None = None
    cached_opportunity_id: str | None = None
    if not force_new_opportunity_on_restart:
        try:
            conversation_row = await repo.get_conversation_inbox_context(
                conversation_id=conversation_id
            )
        except CRMRepositoryError:
            conversation_row = None
        cached_opportunity_id = _extract_cached_opportunity_id(conversation_row)
        if cached_opportunity_id:
            restart_sequence = int((conversation_row or {}).get("restart_sequence") or 1)
            log_event(
                logger,
                "storage.ensure_persona_conversation_opportunity.cache_hit",
                conversation_id=conversation_id,
                persona_id=resolved_persona_id,
                opportunity_id=cached_opportunity_id,
                restart_sequence=restart_sequence,
            )
            if include_restart_metadata:
                return {
                    "oportunidad_id": cached_opportunity_id,
                    "restart_created": False,
                    "restart_sequence": restart_sequence,
                }
            return cached_opportunity_id

    persona = await fetch_persona(resolved_persona_id)
    organizacion_value = persona.get("organizacion_id")
    if not organizacion_value:
        raise StorageError("El contacto no tiene organizacion_id asociado")

    try:
        organizacion_uuid = UUID(str(organizacion_value))
    except (TypeError, ValueError) as exc:
        raise StorageError("organizacion_id_invalido") from exc

    try:
        persona_uuid = UUID(str(resolved_persona_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("contacto_id_invalido") from exc

    log_event(
        logger,
        "storage.ensure_persona_conversation_opportunity.contact_sync_start",
        conversation_id=conversation_id,
        persona_id=str(persona_uuid),
        organizacion_id=str(organizacion_uuid),
    )
    try:
        contact_row = await repo.ensure_contact_record_for_persona(
            organizacion_id=organizacion_uuid,
            persona_id=persona_uuid,
            use_service_role=True,
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "storage.ensure_persona_conversation_opportunity.contact_sync_failed",
            extra={
                "conversation_id": conversation_id,
                "persona_id": str(persona_uuid),
                "organizacion_id": str(organizacion_uuid),
                "error": str(exc),
            },
        )
        raise StorageError(str(exc)) from exc
    log_event(
        logger,
        "storage.ensure_persona_conversation_opportunity.contact_sync_done",
        conversation_id=conversation_id,
        persona_id=str(persona_uuid),
        organizacion_id=str(organizacion_uuid),
        contacto_id=str(contact_row.get("id")) if isinstance(contact_row, dict) and contact_row.get("id") else None,
        codigo_contacto=str(contact_row.get("codigo_contacto")) if isinstance(contact_row, dict) and contact_row.get("codigo_contacto") else None,
    )

    normalized_channel = (channel or "").strip().lower()
    requires_ready = (
        bool(require_contact_ready)
        if require_contact_ready is not None
        else normalized_channel == "webchat"
    )
    contact_ready = _contact_has_minimum_info(persona)

    try:
        opportunity_id, restart_created, restart_sequence = await repo.ensure_conversation_opportunity(
            organizacion_id=organizacion_uuid,
            contacto_id=persona_uuid,
            conversation_id=conversation_id,
            canal=channel,
            contacto_nombre=persona.get("nombre_completo"),
            contacto_empresa=persona.get("company_name"),
            force_new_opportunity_on_restart=force_new_opportunity_on_restart,
            contact_ready=contact_ready,
            require_contact_ready=requires_ready,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    current_context = _ensure_dict((conversation_row or {}).get("inbox_context"))
    opportunity_cache_patch = {
        "opportunity_id": str(opportunity_id),
        "crm": {"opportunity_id": str(opportunity_id)},
    }
    merged_context = _deep_merge_dict(current_context, opportunity_cache_patch)
    restart_sequence_value = max(1, int(restart_sequence or 1))
    if (
        merged_context != current_context
        or int((conversation_row or {}).get("restart_sequence") or 0) != restart_sequence_value
    ):
        try:
            await repo.update_conversation(
                conversation_id=conversation_id,
                patch={
                    "inbox_context": merged_context,
                    "restart_sequence": restart_sequence_value,
                },
            )
        except CRMRepositoryError as exc:
            logger.warning(
                "storage.ensure_persona_conversation_opportunity.cache_patch_failed",
                extra={
                    "conversation_id": conversation_id,
                    "opportunity_id": str(opportunity_id),
                    "error": str(exc),
                },
            )

    if normalized_channel in {"webchat", "whatsapp"}:
        await _notify_opportunity_created_after_assignment(
            repo=repo,
            organizacion_id=organizacion_uuid,
            opportunity_id=opportunity_id,
            conversation_id=conversation_id,
            persona_id=resolved_persona_id,
            channel=channel,
        )
    if include_restart_metadata:
        return {
            "oportunidad_id": str(opportunity_id),
            "restart_created": restart_created,
            "restart_sequence": restart_sequence,
        }
    return str(opportunity_id)


async def ensure_persona_conversation_opportunity(
    *,
    conversation_id: str,
    persona_id: str | None,
    channel: str | None = None,
    force_new_opportunity_on_restart: bool = False,
    include_restart_metadata: bool = False,
    require_contact_ready: bool | None = None,
) -> str | dict[str, Any]:
    """Alias con nombre de persona para la oportunidad de conversación."""
    return await ensure_conversation_opportunity(
        conversation_id=conversation_id,
        persona_id=persona_id,
        channel=channel,
        force_new_opportunity_on_restart=force_new_opportunity_on_restart,
        include_restart_metadata=include_restart_metadata,
        require_contact_ready=require_contact_ready,
    )


async def ensure_persona_tarjeta(
    *,
    tarjeta_id: str | None,
    conversation_id: str,
    persona_id: str | None,
    channel: str | None = None,
) -> str:
    """Alias con nombre de persona para la tarjeta/oportunidad de conversación."""
    return await ensure_conversation_opportunity(
        conversation_id=conversation_id,
        persona_id=persona_id,
        channel=channel,
    )


async def maybe_auto_name_opportunity(
    *,
    conversation_id: str,
    persona_id: str,
    summary: str | None = None,
    intent: str | None = None,
    channel: str | None = None,
    opportunity_id: str | None = None,
) -> str | None:
    """Renombra la oportunidad con base en insights cuando el título actual es genérico."""

    try:
        persona = await fetch_persona(persona_id)
    except StorageError as exc:
        logger.warning(
            "storage.auto_name_opportunity.persona_lookup_failed",
            extra={"persona_id": persona_id, "conversation_id": conversation_id, "error": str(exc)},
        )
        return None

    proposed_title = _build_opportunity_title(contact=persona, intent=intent, summary=summary)
    proposed_description = _build_opportunity_description(
        contact=persona,
        intent=intent,
        summary=summary,
    )
    if not proposed_title and not proposed_description:
        return None

    opportunity_value = (opportunity_id or "").strip()
    if not opportunity_value:
        try:
            resolved = await ensure_conversation_opportunity(
                conversation_id=conversation_id,
                persona_id=persona_id,
                channel=channel,
            )
            opportunity_value = str(resolved)
        except StorageError as exc:
            logger.warning(
                "storage.auto_name_opportunity.ensure_failed",
                extra={
                    "persona_id": persona_id,
                    "conversation_id": conversation_id,
                    "error": str(exc),
                },
            )
            return None

    try:
        opportunity_uuid = UUID(opportunity_value)
    except (TypeError, ValueError):
        return None

    org_value = persona.get("organizacion_id")
    if not org_value:
        return None
    try:
        org_uuid = UUID(str(org_value))
    except (TypeError, ValueError):
        return None

    repo = CRMRepository()
    scoring_runtime = await tenant_runtime.get_lead_scoring_runtime_settings(organizacion_id=org_uuid)
    if not scoring_runtime.enabled:
        return None
    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opportunity_uuid,
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "storage.auto_name_opportunity.lookup_failed",
            extra={
                "opportunity_id": opportunity_value,
                "conversation_id": conversation_id,
                "error": str(exc),
            },
        )
        return None
    if not opportunity:
        return None

    current_title = _clean_text(opportunity.get("titulo"))
    current_description = _clean_text(opportunity.get("descripcion"))
    metadata = _ensure_dict(opportunity.get("metadata"))
    title_auto_generated = _normalize_manual_override(metadata.get("title_auto_generated"))
    description_auto_generated = _normalize_manual_override(
        metadata.get("description_auto_generated")
    )

    should_update_title = bool(proposed_title) and _is_generic_opportunity_title(
        current_title=current_title,
        contact=persona,
        auto_generated=title_auto_generated,
    )
    if should_update_title and proposed_title == current_title:
        should_update_title = False

    should_update_description = bool(proposed_description) and (
        not current_description or description_auto_generated
    )
    if should_update_description and proposed_description == current_description:
        should_update_description = False

    if not should_update_title and not should_update_description:
        return current_title or None

    payload: dict[str, Any] = {}
    now_iso = datetime.now(timezone.utc).isoformat()
    if should_update_title and proposed_title:
        payload["titulo"] = proposed_title
        metadata["title_auto_generated"] = True
        metadata["title_auto_source"] = "conversation_insights"
        metadata["title_auto_updated_at"] = now_iso
    if should_update_description and proposed_description:
        payload["descripcion"] = proposed_description
        metadata["description_auto_generated"] = True
        metadata["description_auto_source"] = "conversation_insights"
        metadata["description_auto_updated_at"] = now_iso

    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opportunity_uuid,
            payload={**payload, "metadata": metadata},
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "storage.auto_name_opportunity.update_failed",
            extra={
                "opportunity_id": opportunity_value,
                "conversation_id": conversation_id,
                "error": str(exc),
            },
        )
        return None
    return proposed_title or current_title or None


async def maybe_auto_name_persona_opportunity(
    *,
    conversation_id: str,
    persona_id: str,
    summary: str | None = None,
    intent: str | None = None,
    channel: str | None = None,
    opportunity_id: str | None = None,
) -> str | None:
    """Alias con nombre de persona para el auto-naming de oportunidad."""
    return await maybe_auto_name_opportunity(
        conversation_id=conversation_id,
        persona_id=persona_id,
        summary=summary,
        intent=intent,
        channel=channel,
        opportunity_id=opportunity_id,
    )


async def sync_persona_opportunity_context(
    *,
    conversation_id: str,
    persona_id: str,
    opportunity_id: str,
    channel: str | None = None,
) -> bool:
    """Sincroniza en la oportunidad el snapshot operativo de la persona."""

    try:
        persona = await fetch_persona(persona_id)
    except StorageError as exc:
        logger.warning(
            "storage.sync_persona_opportunity_context.persona_lookup_failed",
            extra={"persona_id": persona_id, "conversation_id": conversation_id, "error": str(exc)},
        )
        return False
    if not persona:
        return False

    try:
        org_uuid = UUID(str(persona.get("organizacion_id")))
        opp_uuid = UUID(str(opportunity_id))
    except (TypeError, ValueError):
        return False

    repo = CRMRepository()
    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "storage.sync_persona_opportunity_context.opportunity_lookup_failed",
            extra={"opportunity_id": opportunity_id, "conversation_id": conversation_id, "error": str(exc)},
        )
        return False
    if not opportunity:
        return False

    metadata = _ensure_dict(opportunity.get("metadata"))
    patch: dict[str, Any] = {}

    full_name = _clean_text(persona.get("nombre_completo"))
    email = _clean_text(persona.get("correo_principal"))
    phone = _clean_text(persona.get("telefono_principal_e164"))
    company_name = _clean_text(persona.get("company_name"))
    need = _clean_text(persona.get("necesidad_proposito"))
    notes = _clean_text(persona.get("notes"))
    summary = need or notes
    proposed_title = _build_opportunity_title(contact=persona, summary=summary)
    persona_account_id = persona.get("cuenta_id")
    current_description = _clean_text(opportunity.get("descripcion"))
    current_contact_need = _clean_text(metadata.get("contacto_necesidad"))
    description_auto_generated = _normalize_manual_override(metadata.get("description_auto_generated"))
    should_refresh_description = bool(summary) and (
        not current_description
        or description_auto_generated
        or _looks_like_placeholder_opportunity_description(current_description)
    )
    should_refresh_contact_need = bool(summary) and (
        not current_contact_need
        or description_auto_generated
        or _looks_like_placeholder_insight(current_contact_need)
        or _looks_like_placeholder_opportunity_description(current_description)
    )

    if full_name:
        metadata["contacto_nombre"] = full_name
        current_name = _clean_text(opportunity.get("contacto_nombre"))
        if not current_name or current_name != full_name:
            patch["contacto_nombre"] = full_name
    if email:
        metadata["contacto_correo"] = email
    if phone:
        metadata["contacto_telefono"] = phone
    if company_name:
        metadata["contacto_empresa"] = company_name
    if summary and should_refresh_contact_need:
        metadata["contacto_necesidad"] = summary
        metadata["contacto_necesidad_auto_generated"] = True
        metadata["contacto_necesidad_auto_source"] = "persona_sync"
        metadata["contacto_necesidad_auto_updated_at"] = datetime.now(timezone.utc).isoformat()
    if summary and should_refresh_description:
        patch["descripcion"] = summary[:1000]
        metadata["description_auto_generated"] = True
        metadata["description_auto_source"] = "persona_sync"
        metadata["description_auto_updated_at"] = datetime.now(timezone.utc).isoformat()
    if proposed_title and _is_generic_opportunity_title(
        current_title=_clean_text(opportunity.get("titulo")),
        contact=persona,
        auto_generated=_normalize_manual_override(metadata.get("title_auto_generated")),
    ):
        metadata["project_name"] = proposed_title
        patch["titulo"] = proposed_title
        metadata["title_auto_generated"] = True
        metadata["title_auto_source"] = "persona_sync"
        metadata["title_auto_updated_at"] = datetime.now(timezone.utc).isoformat()
    if persona_account_id:
        current_account_id = _clean_text(opportunity.get("cuenta_id"))
        if not current_account_id:
            patch["cuenta_id"] = str(persona_account_id)

    if metadata:
        patch["metadata"] = metadata

    if not patch:
        return False

    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
            payload=patch,
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "storage.sync_persona_opportunity_context.update_failed",
            extra={"opportunity_id": opportunity_id, "conversation_id": conversation_id, "error": str(exc)},
        )
        return False
    return True


async def apply_lead_scoring(
    *,
    conversation_id: str,
    persona_id: str,
    opportunity_id: str | None = None,
    answers: dict[str, Any] | None = None,
    events: dict[str, Any] | None = None,
    profiling_statuses: dict[str, Any] | None = None,
    profiling_reprompt_counts: dict[str, Any] | None = None,
    source: str = "ai_progressive_scoring",
) -> dict[str, Any] | None:
    """Calcula y persiste scoring en oportunidad, persona, insights e historial."""

    try:
        contact = await fetch_persona(persona_id)
    except StorageError as exc:
        logger.warning(
            "storage.lead_scoring.contact_lookup_failed",
            extra={"persona_id": persona_id, "conversation_id": conversation_id, "error": str(exc)},
        )
        return None

    opportunity_value = (opportunity_id or "").strip()
    if not opportunity_value:
        try:
            opportunity_value = await ensure_conversation_opportunity(
                conversation_id=conversation_id,
                persona_id=persona_id,
                channel=str((events or {}).get("channel") or "").strip() or None,
            )
        except StorageError as exc:
            logger.warning(
                "storage.lead_scoring.ensure_opportunity_failed",
                extra={"persona_id": persona_id, "conversation_id": conversation_id, "error": str(exc)},
            )
            return None

    try:
        opp_uuid = UUID(str(opportunity_value))
    except (TypeError, ValueError):
        return None

    org_value = contact.get("organizacion_id")
    if not org_value:
        return None
    try:
        org_uuid = UUID(str(org_value))
    except (TypeError, ValueError):
        return None

    scoring_runtime = await tenant_runtime.get_lead_scoring_runtime_settings(
        organizacion_id=org_uuid
    )
    if not scoring_runtime.enabled:
        return None

    repo = CRMRepository()
    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "storage.lead_scoring.opportunity_lookup_failed",
            extra={"opportunity_id": str(opp_uuid), "conversation_id": conversation_id, "error": str(exc)},
        )
        return None
    if not opportunity:
        return None

    metadata = _ensure_dict(opportunity.get("metadata"))
    previous_scoring = _ensure_dict(metadata.get("lead_scoring"))
    previous_answers = _ensure_dict(previous_scoring.get("answers"))
    previous_events = _ensure_dict(previous_scoring.get("events"))

    normalized_answers = dict(previous_answers)
    for key, value in (answers or {}).items():
        normalized_answers[key] = _normalize_answer_value(key, value)

    merged_events = dict(previous_events)
    merged_events.update(_ensure_dict(events))
    now_iso = datetime.now(timezone.utc).isoformat()
    channel_value = str(merged_events.get("channel") or "").strip().lower()
    channel_key = channel_value if channel_value in {"whatsapp", "webchat"} else "unknown"
    profiling_enabled = True
    if channel_value in {"whatsapp", "webchat"}:
        profiling_enabled = await tenant_runtime.is_profiling_enabled(
            organizacion_id=org_uuid,
            channel=channel_value,
        )

    allowed_catalog_fields: set[str] | None = None
    if channel_value in {"whatsapp", "webchat"}:
        try:
            catalog_questions = await repo.list_scoring_questions(
                organizacion_id=org_uuid,
                canal=channel_value,
                include_inactive=False,
            )
        except CRMRepositoryError:
            catalog_questions = []
        extracted_fields = {
            str(row.get("field_key") or "").strip()
            for row in catalog_questions
            if str(row.get("field_key") or "").strip()
        }
        if extracted_fields:
            allowed_catalog_fields = extracted_fields
            normalized_answers = {
                key: value
                for key, value in normalized_answers.items()
                if key in allowed_catalog_fields
            }

    previous_profiling_by_channel = _ensure_dict(previous_scoring.get("profiling_by_channel"))
    previous_channel_payload = _ensure_dict(previous_profiling_by_channel.get(channel_key))
    previous_channel_questions = _ensure_dict(previous_channel_payload.get("questions"))
    if allowed_catalog_fields is not None:
        previous_channel_questions = {
            key: value
            for key, value in previous_channel_questions.items()
            if str(key).strip() in allowed_catalog_fields
        }

    merged_statuses = _extract_profiling_statuses(profiling_statuses)
    merged_counts = _extract_reprompt_counts(profiling_reprompt_counts)
    if allowed_catalog_fields is not None:
        merged_statuses = {
            key: value for key, value in merged_statuses.items() if key in allowed_catalog_fields
        }
        merged_counts = {
            key: value for key, value in merged_counts.items() if key in allowed_catalog_fields
        }

    all_question_keys = set(previous_channel_questions.keys())
    all_question_keys.update(str(key).strip() for key in normalized_answers.keys())
    all_question_keys.update(merged_statuses.keys())
    all_question_keys.update(merged_counts.keys())

    channel_questions: dict[str, dict[str, Any]] = {}
    for field in sorted(key for key in all_question_keys if key):
        previous_question = _ensure_dict(previous_channel_questions.get(field))
        status = merged_statuses.get(field)
        if not status:
            status = _normalize_profiling_status(previous_question.get("estado_respuesta"))
        derived_status = _derive_profiling_status_from_answer(normalized_answers.get(field))
        if status in {None, "unknown"} and derived_status in {"answered", "refused"}:
            status = derived_status
        elif not status:
            status = derived_status
        reprompt_count = merged_counts.get(field)
        if reprompt_count is None:
            reprompt_count = _coerce_non_negative_int(
                previous_question.get("repregunta_count"),
                default=0,
            )
        if status is None and reprompt_count == 0:
            continue
        channel_questions[field] = {
            "estado_respuesta": status or "unknown",
            "repregunta_count": reprompt_count,
        }

    profiling_by_channel = dict(previous_profiling_by_channel)
    profiling_by_channel[channel_key] = {
        **previous_channel_payload,
        "channel": channel_key,
        "updated_at": now_iso,
        "questions": channel_questions,
    }

    scoring = _compute_lead_scoring(normalized_answers, merged_events, scoring_runtime)
    if channel_value in {"whatsapp", "webchat"}:
        try:
            dynamic_scoring = await _compute_lead_scoring_from_catalog(
                repo=repo,
                organizacion_id=org_uuid,
                channel=channel_value,
                answers=normalized_answers,
                events=merged_events,
                runtime_settings=scoring_runtime,
            )
        except CRMRepositoryError as exc:
            logger.warning(
                "storage.lead_scoring.catalog_lookup_failed",
                extra={
                    "opportunity_id": str(opp_uuid),
                    "conversation_id": conversation_id,
                    "channel": channel_value,
                    "error": str(exc),
                },
            )
            dynamic_scoring = None
        if dynamic_scoring:
            scoring = dynamic_scoring
        else:
            logger.warning(
                "storage.lead_scoring.catalog_fallback_legacy",
                extra={
                    "opportunity_id": str(opp_uuid),
                    "conversation_id": conversation_id,
                    "channel": channel_value,
                },
            )

    if not profiling_enabled:
        scoring["critical_fields"] = []
        scoring["missing_fields"] = []
        scoring["refused_fields"] = []

    scoring_payload = {
        **scoring,
        "answers": normalized_answers,
        "events": merged_events,
        "profiling_by_channel": profiling_by_channel,
        "profiling": profiling_by_channel.get(channel_key, {}),
        "version": "v1",
        "source": source,
        "last_scored_at": now_iso,
    }

    metadata["lead_scoring"] = scoring_payload
    metadata["lead_score"] = int(round(scoring_payload["score_total"]))
    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
            payload={"metadata": metadata},
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "storage.lead_scoring.opportunity_update_failed",
            extra={"opportunity_id": str(opp_uuid), "conversation_id": conversation_id, "error": str(exc)},
        )
        return None

    persona_contacto_datos = _ensure_dict(
        contact.get("persona_datos") or contact.get("contacto_datos") or contact.get("metadata")
    )
    persona_contacto_datos["lead_scoring"] = {
        "answers": normalized_answers,
        "profiling_by_channel": profiling_by_channel,
        "profiling": profiling_by_channel.get(channel_key, {}),
        "missing_fields": scoring_payload["missing_fields"],
        "refused_fields": scoring_payload["refused_fields"],
        "last_scored_at": now_iso,
    }
    try:
        await update_persona(persona_id, {"persona_datos": persona_contacto_datos})
    except StorageError as exc:
        logger.warning(
            "storage.lead_scoring.contact_update_failed",
            extra={"persona_id": persona_id, "conversation_id": conversation_id, "error": str(exc)},
        )

    try:
        await upsert_conversation_insights(
            conversation_id=conversation_id,
            lead_score=int(round(scoring_payload["score_total"])),
        )
    except StorageError as exc:
        logger.warning(
            "storage.lead_scoring.insights_update_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )

    event_payload = {
        "organizacion_id": str(org_uuid),
        "oportunidad_id": str(opp_uuid),
        "conversacion_id": conversation_id,
        "score_total": scoring_payload["score_total"],
        "grade": scoring_payload["grade"],
        "confidence": scoring_payload["confidence"],
        "factors": scoring_payload["factors"],
        "missing_fields": scoring_payload["missing_fields"],
        "refused_fields": scoring_payload["refused_fields"],
        "events": merged_events,
    }
    try:
        await repo.create_opportunity_scoring_event(payload=event_payload)
    except CRMRepositoryError as exc:
        logger.warning(
            "storage.lead_scoring.event_insert_failed",
            extra={"opportunity_id": str(opp_uuid), "conversation_id": conversation_id, "error": str(exc)},
        )

    return {
        "oportunidad_id": str(opp_uuid),
        "score_total": scoring_payload["score_total"],
        "grade": scoring_payload["grade"],
        "confidence": scoring_payload["confidence"],
        "missing_fields": scoring_payload["missing_fields"],
    }


async def apply_persona_lead_scoring(
    *,
    conversation_id: str,
    persona_id: str,
    opportunity_id: str | None = None,
    answers: dict[str, Any] | None = None,
    events: dict[str, Any] | None = None,
    profiling_statuses: dict[str, Any] | None = None,
    profiling_reprompt_counts: dict[str, Any] | None = None,
    source: str = "ai_progressive_scoring",
) -> dict[str, Any] | None:
    """Alias con nombre de persona para el scoring."""
    return await apply_lead_scoring(
        conversation_id=conversation_id,
        persona_id=persona_id,
        opportunity_id=opportunity_id,
        answers=answers,
        events=events,
        profiling_statuses=profiling_statuses,
        profiling_reprompt_counts=profiling_reprompt_counts,
        source=source,
    )


async def maybe_promote_prequalified_from_scoring(
    *,
    conversation_id: str,
    persona_id: str,
    opportunity_id: str,
    channel: str,
) -> bool:
    """Promueve a precalificado cuando se cumplen condiciones minimas de scoring."""
    try:
        contact = await fetch_persona(persona_id)
    except StorageError:
        return False
    org_id = contact.get("organizacion_id")
    if not org_id:
        return False

    try:
        org_uuid = UUID(str(org_id))
        opp_uuid = UUID(str(opportunity_id))
    except (TypeError, ValueError):
        return False

    repo = CRMRepository()
    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError:
        return False
    if not opportunity:
        return False

    metadata = _ensure_dict(opportunity.get("metadata"))
    scoring = _ensure_dict(metadata.get("lead_scoring"))
    answers = _ensure_dict(scoring.get("answers"))

    channel_key = str(channel or "").strip().lower()
    profiling_enabled = await tenant_runtime.is_profiling_enabled(
        organizacion_id=org_uuid,
        channel=channel_key if channel_key in {"whatsapp", "webchat"} else "webchat",
    )
    has_name = _contact_has_name(contact)
    has_phone = _contact_has_phone(contact)
    has_email = _contact_has_email(contact)

    has_required_contact_data = False
    if channel_key == "whatsapp":
        has_required_contact_data = has_name and has_phone
    elif channel_key == "webchat":
        has_required_contact_data = has_name and (has_email or has_phone)

    if not has_required_contact_data:
        metadata["precalificacion_incompleta"] = True
        try:
            await repo.update_opportunity(
                organizacion_id=org_uuid,
                oportunidad_id=opp_uuid,
                payload={"metadata": metadata},
            )
        except CRMRepositoryError:
            pass
        return False

    required_fields = await _load_prequalification_required_fields(
        repo=repo,
        organizacion_id=org_uuid,
        channel=channel_key,
        profiling_enabled=profiling_enabled,
        fallback_answers=answers,
        fallback_fields=scoring.get("critical_fields") if isinstance(scoring.get("critical_fields"), list) else (),
    )
    has_required_answers = all(
        (answers.get(field) not in (None, "", "unknown", "refused"))
        for field in required_fields
    )

    if not has_required_answers:
        metadata["precalificacion_incompleta"] = True
        try:
            await repo.update_opportunity(
                organizacion_id=org_uuid,
                oportunidad_id=opp_uuid,
                payload={"metadata": metadata},
            )
        except CRMRepositoryError:
            pass
        return False

    metadata["precalificacion_incompleta"] = False
    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
            payload={"metadata": metadata},
        )
    except CRMRepositoryError:
        pass

    try:
        return await promote_opportunity_stage(
            oportunidad_id=str(opp_uuid),
            organizacion_id=str(org_uuid),
            stage_code="precalificado",
            source="lead_scoring_rules",
            channel=channel,
        )
    except StorageError:
        return False


async def maybe_promote_prequalified_from_persona(
    *,
    conversation_id: str,
    persona_id: str,
    opportunity_id: str,
    channel: str,
) -> bool:
    """Alias con nombre de persona para la promoción a precalificado."""
    return await maybe_promote_prequalified_from_scoring(
        conversation_id=conversation_id,
        persona_id=persona_id,
        opportunity_id=opportunity_id,
        channel=channel,
    )


async def promote_opportunity_stage(
    *,
    oportunidad_id: str,
    organizacion_id: str,
    stage_code: str,
    source: str | None = None,
    channel: str | None = None,
) -> bool:
    """Promueve una oportunidad a la etapa indicada (por código) si aún no ha llegado ahí."""
    normalized_code = (stage_code or "").strip().lower()
    if not normalized_code:
        return False

    try:
        org_uuid = UUID(str(organizacion_id))
        opp_uuid = UUID(str(oportunidad_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("opportunity_stage_invalid_id") from exc

    repo = CRMRepository()
    log_context = {
        "oportunidad_id": str(opp_uuid),
        "organizacion_id": str(org_uuid),
        "stage_code": normalized_code,
        "source": source or "system",
        "channel": channel,
    }
    try:
        stage = await repo.get_active_stage_by_legacy_code(
            organizacion_id=org_uuid,
            codigo=normalized_code,
        )
        if not stage:
            stage = await repo.get_stage_by_code(
                organizacion_id=org_uuid,
                codigo=normalized_code,
            )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    if not stage:
        log_event(logger, "promote_stage.stage_not_found", **log_context)
        return False

    stage_id = stage.get("id")
    if not isinstance(stage_id, UUID):
        try:
            stage_id = UUID(str(stage_id))
        except (TypeError, ValueError) as exc:
            raise StorageError("opportunity_stage_invalid_target") from exc

    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    if not opportunity:
        log_event(logger, "promote_stage.opportunity_missing", **log_context)
        return False

    current_stage_value = opportunity.get("etapa_id")
    try:
        current_stage_uuid = UUID(str(current_stage_value)) if current_stage_value else None
    except (TypeError, ValueError):
        current_stage_uuid = None

    if current_stage_uuid == stage_id:
        log_event(logger, "promote_stage.already_in_stage", **log_context)
        return False

    current_stage_order = (opportunity.get("etapa") or {}).get("orden")
    target_order = stage.get("orden")
    if isinstance(current_stage_order, (int, float)) and isinstance(target_order, (int, float)):
        if current_stage_order >= target_order:
            log_event(
                logger,
                "promote_stage.skipped_order",
                current_stage_order=current_stage_order,
                target_order=target_order,
                **log_context,
            )
            return False

    metadata = _ensure_dict(opportunity.get("metadata"))
    auto_stage = _ensure_dict(metadata.get("auto_stage"))
    auto_stage[normalized_code] = {
        "stage_code": normalized_code,
        "source": source or "system",
        "channel": channel,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    metadata["auto_stage"] = auto_stage

    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
            payload={"etapa_id": str(stage_id), "metadata": metadata},
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    log_event(logger, "promote_stage.success", **log_context)
    return True


async def mark_opportunity_lost(
    *,
    oportunidad_id: str,
    organizacion_id: str,
    reason: str | None = None,
    conversation_id: str | None = None,
) -> None:
    """Cierra una oportunidad en la etapa `cerrado_perdido` destacando la razón."""
    await promote_opportunity_stage(
        oportunidad_id=oportunidad_id,
        organizacion_id=organizacion_id,
        stage_code="cerrado_perdido",
        source="assistant_negacion",
    )

    try:
        org_uuid = UUID(str(organizacion_id))
        opp_uuid = UUID(str(oportunidad_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("opportunity_stage_invalid_id") from exc

    repo = CRMRepository()
    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    if not opportunity:
        log_event(
            logger,
            "storage.mark_opportunity_lost.missing_opportunity",
            oportunidad_id=str(opp_uuid),
            organizacion_id=str(org_uuid),
        )
        return

    metadata = _ensure_dict(opportunity.get("metadata"))
    closure_meta = _ensure_dict(metadata.get("closure"))
    closure_meta["assistant_negacion"] = {
        "reason": str(reason or "Negación definitiva detectada por Tal-IA").strip(),
        "marked_at": datetime.now(timezone.utc).isoformat(),
        "conversation_id": conversation_id,
    }
    metadata["closure"] = closure_meta

    payload = {"estado": "perdida", "metadata": metadata}
    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
            payload=payload,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    # El cierre debe ser autosuficiente: no depender solo de la tarea que
    # cancela seguimientos cuando entra el mensaje del contacto.
    try:
        from app.services import whatsapp_followups

        await whatsapp_followups.cancel_followup_jobs_for_inbound(
            conversation_id=str(conversation_id or ""),
            reason="opportunity_lost_negation",
        )
    except Exception as exc:
        logger.warning(
            "storage.mark_opportunity_lost.cancel_followups_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )


async def record_demo_booking_metadata(
    *,
    oportunidad_id: str,
    organizacion_id: str,
    scheduled_at: datetime,
    booking_id: str | None = None,
) -> None:
    """Actualiza stage_prep.demo con la hora agendada y el booking_id."""
    try:
        org_uuid = UUID(str(organizacion_id))
        opp_uuid = UUID(str(oportunidad_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("opportunity_stage_invalid_id") from exc

    repo = CRMRepository()
    log_context = {
        "oportunidad_id": str(opp_uuid),
        "organizacion_id": str(org_uuid),
        "booking_id": booking_id,
    }
    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    if not opportunity:
        log_event(logger, "demo_booking.opportunity_missing", **log_context)
        return

    metadata = _ensure_dict(opportunity.get("metadata"))
    stage_prep = _ensure_dict(metadata.get("stage_prep"))
    demo_prep = _ensure_dict(stage_prep.get("demo"))
    demo_prep["demo_scheduled_at"] = scheduled_at.astimezone(timezone.utc).isoformat()
    if booking_id:
        demo_prep["demo_booking_id"] = booking_id
    stage_prep["demo"] = demo_prep
    metadata["stage_prep"] = stage_prep

    try:
        await repo.update_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
            payload={"metadata": metadata},
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc
    log_event(logger, "demo_booking.metadata_updated", **log_context)


async def fetch_demo_booking_metadata(
    *,
    oportunidad_id: str,
    organizacion_id: str,
) -> dict[str, Any] | None:
    """Obtiene la metadata de la etapa stage_prep.demo para la oportunidad."""
    try:
        org_uuid = UUID(str(organizacion_id))
        opp_uuid = UUID(str(oportunidad_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("opportunity_stage_invalid_id") from exc

    repo = CRMRepository()
    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    if not opportunity:
        return None

    metadata = _ensure_dict(opportunity.get("metadata"))
    stage_prep = _ensure_dict(metadata.get("stage_prep"))
    demo_prep = _ensure_dict(stage_prep.get("demo"))
    if not demo_prep:
        return None
    return {k: v for k, v in demo_prep.items() if v is not None}


async def fetch_opportunity_contact(
    *,
    oportunidad_id: str,
    organizacion_id: str | None,
) -> dict[str, Any] | None:
    """Obtiene el contacto principal ligado a la oportunidad indicada.

    Si no se proporciona organizacion_id, se busca directamente por oportunidad
    usando credenciales de service role (válido para tareas internas).
    """
    org_uuid: UUID | None = None
    try:
        opp_uuid = UUID(str(oportunidad_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("opportunity_contact_invalid_id") from exc
    if organizacion_id:
        try:
            org_uuid = UUID(str(organizacion_id))
        except (TypeError, ValueError) as exc:
            raise StorageError("opportunity_contact_invalid_org") from exc

    repo = CRMRepository()
    try:
        if org_uuid:
            opportunity = await repo.get_pipeline_opportunity(
                organizacion_id=org_uuid,
                oportunidad_id=opp_uuid,
            )
        else:
            opportunity = await repo.get_pipeline_opportunity_by_id(
                oportunidad_id=opp_uuid,
            )
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc

    if not opportunity:
        return None
    contact = opportunity.get("contacto")
    if not isinstance(contact, dict):
        return None
    result = dict(contact)
    resolved_org = opportunity.get("organizacion_id") or (str(org_uuid) if org_uuid else None)
    if resolved_org:
        result.setdefault("organizacion_id", resolved_org)
    return result


async def fetch_opportunity_persona(
    *,
    oportunidad_id: str,
    organizacion_id: str | None,
) -> dict[str, Any] | None:
    """Alias con nombre de persona para la entidad principal de una oportunidad."""
    return await fetch_opportunity_contact(
        oportunidad_id=oportunidad_id,
        organizacion_id=organizacion_id,
    )


async def fetch_calendar_booking(booking_id: str) -> dict[str, Any] | None:
    """Obtiene una cita del calendario utilizando credenciales de servicio."""
    booking_key = str(booking_id or "").strip()
    if not booking_key:
        return None
    try:
        booking_uuid = UUID(booking_key)
    except (TypeError, ValueError) as exc:
        raise StorageError("calendar_booking_invalid_id") from exc
    repo = CRMRepository()
    try:
        return await repo.get_calendar_booking_by_id(booking_id=booking_uuid)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_calendar_booking_by_conversation(conversation_id: str) -> dict[str, Any] | None:
    """Busca la cita asociada a la conversación dada."""
    if not conversation_id:
        return None
    try:
        conv_uuid = UUID(str(conversation_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("calendar_booking_invalid_conversation_id") from exc
    repo = CRMRepository()
    try:
        return await repo.get_calendar_booking_by_conversation(conversation_id=conv_uuid)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def fetch_calendar_booking_by_persona(persona_id: str) -> dict[str, Any] | None:
    """Busca la cita asociada a una persona."""
    if not persona_id:
        return None
    try:
        persona_uuid = UUID(str(persona_id))
    except (TypeError, ValueError) as exc:
        raise StorageError("calendar_booking_invalid_persona_id") from exc
    repo = CRMRepository()
    try:
        return await repo.get_calendar_booking_by_persona(persona_id=persona_uuid)
    except CRMRepositoryError as exc:
        raise StorageError(str(exc)) from exc


async def capture_opportunity_if_ready(
    *,
    conversation_id: str,
    persona_id: str,
    channel: str | None = None,
) -> tuple[bool, str | None]:
    """Crea/promueve la oportunidad cuando la persona ya tiene al menos un dato válido."""
    capture_channel = channel or "assistant"
    log_context = {
        "conversation_id": conversation_id,
        "persona_id": persona_id,
        "channel": capture_channel,
    }

    try:
        contact = await fetch_persona(persona_id)
    except StorageError as exc:
        logger.warning(
            "storage.capture_opportunity.contact_failed",
            extra={"persona_id": persona_id, "error": str(exc)},
        )
        log_event(
            logger,
            "capture_opportunity.contact_lookup_failed",
            error=str(exc),
            **log_context,
        )
        return False, None

    correo = _contact_email_value(contact)
    telefono = _contact_phone_value(contact)
    if not correo and not telefono:
        log_event(logger, "capture_opportunity.skipped_no_contact_data", **log_context)
        return False, None

    try:
        oportunidad_id = await ensure_conversation_opportunity(
            conversation_id=conversation_id,
            persona_id=persona_id,
            channel=capture_channel,
        )
    except StorageError as exc:
        logger.warning(
            "storage.capture_opportunity.ensure_failed",
            extra={
                "conversation_id": conversation_id,
                "persona_id": persona_id,
                "error": str(exc),
            },
        )
        log_event(
            logger,
            "capture_opportunity.ensure_failed",
            error=str(exc),
            **log_context,
        )
        return False, None

    organizacion_id = contact.get("organizacion_id")
    if not organizacion_id:
        log_event(
            logger,
            "capture_opportunity.no_org_context",
            opportunity_id=oportunidad_id,
            **log_context,
        )
        return True, oportunidad_id

    try:
        await promote_opportunity_stage(
            oportunidad_id=oportunidad_id,
            organizacion_id=str(organizacion_id),
            stage_code="captado",
            source="capture_opportunity",
            channel=capture_channel,
        )
    except StorageError as exc:
        logger.warning(
            "storage.capture_opportunity.promote_failed",
            extra={
                "conversation_id": conversation_id,
                "persona_id": persona_id,
                "error": str(exc),
            },
        )
        log_event(
            logger,
            "capture_opportunity.promote_failed",
            opportunity_id=oportunidad_id,
            error=str(exc),
            **log_context,
        )
        return True, oportunidad_id

    log_event(
        logger,
        "capture_opportunity.promoted",
        opportunity_id=oportunidad_id,
        stage_code="captado",
        **log_context,
    )
    return True, oportunidad_id


async def capture_persona_opportunity_if_ready(
    *,
    conversation_id: str,
    persona_id: str,
    channel: str | None = None,
) -> tuple[bool, str | None]:
    """Alias con nombre de persona para la captura/promoción de oportunidad."""
    return await capture_opportunity_if_ready(
        conversation_id=conversation_id,
        persona_id=persona_id,
        channel=channel,
    )


async def capture_persona_lead_if_ready(
    *,
    conversation_id: str,
    persona_id: str,
    channel: str | None = None,
) -> tuple[bool, str | None]:
    """Alias con nombre de persona para la captura de oportunidad."""
    return await capture_persona_opportunity_if_ready(
        conversation_id=conversation_id,
        persona_id=persona_id,
        channel=channel,
    )
