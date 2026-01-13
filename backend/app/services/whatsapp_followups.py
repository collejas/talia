"""Rutinas para reenganche automático y alertas a vendedores en WhatsApp."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from app.assistants.tool_runtime import ToolRuntimeContext
from app.channels.whatsapp import service as whatsapp_service
from app.channels.whatsapp import tools as whatsapp_tools
from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import storage
from app.services.storage import StorageError

logger = get_logger("app.services.whatsapp_followups")

REENGAGE_TEMPLATE = (
    "¿Seguimos en contacto? Tengo ejemplos y demos listos si quieres ver cómo Tal-IA te ayuda "
    "a atender leads 24/7 sin cargar a tu equipo. ¿Te interesa que sigamos?"
)


async def run_followups(*, now: datetime | None = None, limit: int | None = None) -> None:
    """Ejecuta el flujo de reenganche y escalación para conversaciones inactivas."""
    current_ts = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    reengage_delta = timedelta(minutes=settings.whatsapp_reengage_minutes)
    cutoff = current_ts - reengage_delta
    batch_limit = limit or 50
    repo = CRMRepository()
    try:
        conversations = await repo.list_whatsapp_conversations_for_followup(
            inactive_since=cutoff,
            limit=batch_limit,
        )
    except CRMRepositoryError as exc:
        logger.warning("whatsapp.followup.list_failed", extra={"error": str(exc)})
        return

    for conversation in conversations:
        try:
            await _process_conversation(
                repo=repo,
                conversation=conversation,
                reference_time=current_ts,
            )
        except Exception as exc:  # pragma: no cover - defensivo
            logger.exception(
                "whatsapp.followup.unexpected_error",
                extra={"conversation_id": conversation.get("id"), "error": str(exc)},
            )


class WhatsAppFollowupRunner:
    """Ejecuta run_followups en intervalos definidos."""

    def __init__(self, *, interval_minutes: int = 5) -> None:
        self._interval = max(1, interval_minutes)
        self._task: asyncio.Task[None] | None = None
        self._stop_event = asyncio.Event()
        self._enabled = True

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        if not settings.supabase_url or not settings.supabase_service_role:
            self._enabled = False
            logger.warning("whatsapp.followup.disabled", extra={"reason": "supabase_config_missing"})
            return
        self._enabled = True
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run_loop(), name="whatsapp-followups")
        logger.info("whatsapp.followup.started")

    async def shutdown(self) -> None:
        if not self._task:
            return
        self._stop_event.set()
        try:
            await self._task
        finally:
            self._task = None
        logger.info("whatsapp.followup.stopped")

    async def _run_loop(self) -> None:
        interval_seconds = self._interval * 60
        while not self._stop_event.is_set():
            try:
                await run_followups()
            except Exception as exc:  # pragma: no cover
                logger.exception("whatsapp.followup.loop_error", extra={"error": str(exc)})
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=interval_seconds)
            except asyncio.TimeoutError:
                continue


followup_runner = WhatsAppFollowupRunner()


async def _process_conversation(
    *,
    repo: CRMRepository,
    conversation: dict[str, Any],
    reference_time: datetime,
) -> None:
    if _manual_override(conversation):
        return
    state = str(conversation.get("estado") or "").lower()
    if state == "cerrada":
        return
    convo_id = conversation.get("id")
    contact_id = conversation.get("contacto_id")
    if not convo_id or not contact_id:
        return
    last_out = _parse_ts(conversation.get("ultimo_saliente_en"))
    if not last_out:
        return
    if last_out > reference_time:
        return
    last_in = _parse_ts(conversation.get("ultimo_entrante_en"))
    if last_in and last_in > last_out:
        return

    try:
        contact = await storage.fetch_contact(contact_id)
    except StorageError as exc:
        logger.warning(
            "whatsapp.followup.contact_failed",
            extra={"conversation_id": convo_id, "error": str(exc)},
        )
        return
    if not contact or not contact.get("telefono_e164"):
        return

    contact_complete = bool(contact.get("notes")) and bool(contact.get("necesidad_proposito"))

    try:
        oportunidad_id = await storage.ensure_conversation_opportunity(
            conversation_id=convo_id,
            contact_id=contact_id,
            channel="whatsapp",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.followup.ensure_opportunity_failed",
            extra={"conversation_id": convo_id, "error": str(exc)},
        )
        return

    org_id = contact.get("organizacion_id") or conversation.get("organizacion_id")
    if not org_id:
        return
    try:
        org_uuid = UUID(str(org_id))
        opp_uuid = UUID(str(oportunidad_id))
    except (TypeError, ValueError):
        return

    try:
        opportunity = await repo.get_pipeline_opportunity(
            organizacion_id=org_uuid,
            oportunidad_id=opp_uuid,
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "whatsapp.followup.fetch_opportunity_failed",
            extra={"conversation_id": convo_id, "error": str(exc)},
        )
        return
    if not opportunity:
        return

    metadata = _ensure_dict(opportunity.get("metadata"))
    followup_meta = _ensure_dict(metadata.get("whatsapp_followup"))
    reengage_meta = _ensure_dict(followup_meta.get("reengage"))
    escalate_meta = _ensure_dict(followup_meta.get("escalate"))
    reengage_sent_at = _parse_ts(reengage_meta.get("sent_at"))
    escalate_sent_at = _parse_ts(escalate_meta.get("sent_at"))

    reengage_cutoff = reference_time - timedelta(minutes=settings.whatsapp_reengage_minutes)
    escalate_cutoff = reference_time - timedelta(minutes=settings.whatsapp_escalate_minutes)
    reengage_attempts = int(reengage_meta.get("attempts") or 0)
    escalate_reference = reengage_sent_at or last_out
    escalate_delay_minutes = max(0, settings.whatsapp_escalate_minutes)
    if escalate_delay_minutes <= 0:
        escalate_delay_reached = True
    else:
        escalate_delay_reached = (reference_time - escalate_reference) >= timedelta(
            minutes=escalate_delay_minutes
        )

    should_reengage = (
        last_out <= reengage_cutoff
        and (reengage_sent_at is None or reengage_sent_at <= reengage_cutoff)
        and reengage_attempts < 2
    )

    should_escalate = (
        reengage_attempts >= 2
        and escalate_sent_at is None
        and escalate_delay_reached
    )

    logger.info(
        "whatsapp.followup.reengage_check",
        extra={
            "conversation_id": convo_id,
            "contact_id": contact_id,
            "last_out": last_out,
            "reengage_cutoff": reengage_cutoff.isoformat(),
            "reengage_sent_at": reengage_sent_at.isoformat() if reengage_sent_at else None,
            "attempts": reengage_attempts,
            "contact_complete": contact_complete,
            "should_reengage": should_reengage,
            "escalate_cutoff": escalate_cutoff.isoformat(),
            "escalate_reference": escalate_reference,
            "escalate_sent_at": escalate_sent_at.isoformat() if escalate_sent_at else None,
            "escalate_delay_reached": escalate_delay_reached,
            "should_escalate": should_escalate,
        },
    )

    if should_reengage and not contact_complete:
        await _send_reengage_message(
            conversation_id=str(convo_id),
            contact_id=str(contact_id),
            contact=contact,
            followup_meta=followup_meta,
            metadata=metadata,
            repo=repo,
            opportunity_id=opp_uuid,
            org_id=org_uuid,
        )
        return

    if should_escalate and not contact_complete:
        await _escalate_to_sales(
            conversation_id=str(convo_id),
            contact_id=str(contact_id),
            opportunity=opportunity,
            followup_meta=followup_meta,
            metadata=metadata,
            repo=repo,
        )
        return



async def _send_reengage_message(
    *,
    conversation_id: str,
    contact_id: str,
    contact: dict[str, Any],
    followup_meta: dict[str, Any],
    metadata: dict[str, Any],
    repo: CRMRepository,
    opportunity_id: UUID,
    org_id: UUID,
) -> None:
    phone = str(contact.get("telefono_e164") or "").strip()
    if not phone:
        return
    logger.info(
        "whatsapp.followup.reengage_attempt",
        extra={
            "conversation_id": conversation_id,
            "phone": phone,
            "attempts": int(followup_meta.get("reengage", {}).get("attempts") or 0),
        },
    )
    try:
        send_result = await whatsapp_service.send_manual_message(to_number=phone, body=REENGAGE_TEMPLATE)
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "whatsapp.followup.reengage_send_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        return

    if send_result.sid:
        contact_id_value = contact.get("id") or contact.get("contacto_id")
        wa_id = None
        if phone and phone.startswith("+"):
            wa_id = phone.lstrip("+")
        elif phone:
            wa_id = phone
        contact_id_str = str(contact_id_value) if contact_id_value else None
        metadata_payload = {
            "reengage": True,
            "trigger": "whatsapp_followup",
        }
        try:
            await storage.register_whatsapp_message(
                direction="saliente",
                wa_id=wa_id,
                phone_e164=phone,
                body=REENGAGE_TEMPLATE,
                message_sid=send_result.sid,
                conversation_id=conversation_id,
                contact_id=contact_id_str,
                metadata=metadata_payload,
                organizacion_id=str(contact.get("organizacion_id")) if contact.get("organizacion_id") else None,
            )
        except StorageError as exc:
            logger.warning(
                "whatsapp.followup.reengage_register_failed",
                extra={
                    "conversation_id": conversation_id,
                    "message_sid": send_result.sid,
                    "error": str(exc),
                },
            )

    attempt_count = int(followup_meta.get("reengage", {}).get("attempts") or 0) + 1
    followup_meta["reengage"] = {
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "attempts": attempt_count,
    }
    metadata["whatsapp_followup"] = followup_meta
    try:
        await repo.update_opportunity(
            organizacion_id=org_id,
            oportunidad_id=opportunity_id,
            payload={"metadata": metadata},
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "whatsapp.followup.reengage_metadata_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        return

    if attempt_count >= 2:
        restart_sequence_value = int(metadata.get("restart_sequence") or 0)
        if restart_sequence_value < 2:
            metadata["restart_sequence"] = 2
            try:
                await repo.update_opportunity(
                    organizacion_id=org_id,
                    oportunidad_id=opportunity_id,
                    payload={"metadata": metadata},
                )
            except CRMRepositoryError as exc:
                logger.warning(
                    "whatsapp.followup.restart_sequence_update_failed",
                    extra={"conversation_id": conversation_id, "error": str(exc)},
                )
            else:
                try:
                    await storage.update_conversation(conversation_id, {"restart_sequence": 2})
                except StorageError as exc:
                    logger.warning(
                        "whatsapp.followup.conversation_restart_update_failed",
                        extra={"conversation_id": conversation_id, "error": str(exc)},
                    )


async def _escalate_to_sales(
    *,
    conversation_id: str,
    contact_id: str,
    opportunity: dict[str, Any],
    followup_meta: dict[str, Any],
    metadata: dict[str, Any],
    repo: CRMRepository,
) -> None:
    contact = opportunity.get("contacto")
    resumen = None
    if isinstance(contact, dict):
        resumen = contact.get("necesidad_proposito") or contact.get("notes")

    context = ToolRuntimeContext(
        conversation_id=conversation_id,
        contact_id=contact_id,
        channel="whatsapp",
    )
    try:
        await whatsapp_tools._notify_sales_rep(
            context=context,
            trigger="followup_escalate",
            contact=contact,
            opportunity_id=str(opportunity.get("id")),
            resumen=resumen,
            notes=None,
            email=None,
            extra={"reason": "inactivity"},
        )
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "whatsapp.followup.escalate_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        return

    followup_meta["escalate"] = {"sent_at": datetime.now(timezone.utc).isoformat()}
    metadata["whatsapp_followup"] = followup_meta
    org_id = opportunity.get("organizacion_id")
    opp_id = opportunity.get("id")
    if not org_id or not opp_id:
        return
    try:
        await repo.update_opportunity(
            organizacion_id=UUID(str(org_id)),
            oportunidad_id=UUID(str(opp_id)),
            payload={"metadata": metadata},
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "whatsapp.followup.escalate_metadata_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )


def _manual_override(conversation: dict[str, Any]) -> bool:
    controls = conversation.get("conversaciones_controles")
    if isinstance(controls, list) and controls:
        for item in controls:
            if isinstance(item, dict) and bool(item.get("manual_override")):
                return True
    elif isinstance(controls, dict):
        return bool(controls.get("manual_override"))
    return False


def _parse_ts(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc)
    text = str(value)
    if not text:
        return None
    try:
        candidate = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return candidate.astimezone(timezone.utc)


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
