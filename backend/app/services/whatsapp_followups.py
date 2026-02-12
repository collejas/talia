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
from app.services import storage, tenant_runtime
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
    if _should_skip_reengage_for_business_rules(opportunity):
        logger.info(
            "whatsapp.followup.skip_business_rule",
            extra={
                "conversation_id": convo_id,
                "contact_id": contact_id,
            },
        )
        return

    metadata = _ensure_dict(opportunity.get("metadata"))
    followup_meta = _ensure_dict(metadata.get("whatsapp_followup"))
    reengage_meta = _ensure_dict(followup_meta.get("reengage"))
    escalate_meta = _ensure_dict(followup_meta.get("escalate"))
    reengage_sent_at = _parse_ts(reengage_meta.get("sent_at"))
    escalate_sent_at = _parse_ts(escalate_meta.get("sent_at"))

    whatsapp_settings = await tenant_runtime.get_whatsapp_runtime_settings(organizacion_id=org_uuid)
    reengage_cutoff = reference_time - timedelta(minutes=whatsapp_settings.reengage_minutes)
    escalate_cutoff = reference_time - timedelta(minutes=whatsapp_settings.escalate_minutes)
    reengage_attempts = int(reengage_meta.get("attempts") or 0)
    max_reengage_attempts = max(1, whatsapp_settings.reengage_max_attempts)
    escalate_reference = reengage_sent_at or last_out
    escalate_delay_minutes = max(0, whatsapp_settings.escalate_minutes)
    if escalate_delay_minutes <= 0:
        escalate_delay_reached = True
    else:
        escalate_delay_reached = (reference_time - escalate_reference) >= timedelta(
            minutes=escalate_delay_minutes
        )

    should_reengage = (
        last_out <= reengage_cutoff
        and (reengage_sent_at is None or reengage_sent_at <= reengage_cutoff)
        and reengage_attempts < max_reengage_attempts
    )

    should_escalate = (
        reengage_attempts >= max_reengage_attempts
        and escalate_sent_at is None
        and escalate_delay_reached
    )

    last_out_iso = last_out.isoformat() if last_out else None
    escalate_reference_iso = (
        escalate_reference.isoformat() if isinstance(escalate_reference, datetime) else None
    )
    logger.info(
        "whatsapp.followup.reengage_check",
        extra={
            "conversation_id": convo_id,
            "contact_id": contact_id,
            "last_out": last_out_iso,
            "reengage_cutoff": reengage_cutoff.isoformat(),
            "reengage_sent_at": reengage_sent_at.isoformat() if reengage_sent_at else None,
            "attempts": reengage_attempts,
            "contact_complete": contact_complete,
            "should_reengage": should_reengage,
            "escalate_cutoff": escalate_cutoff.isoformat(),
            "escalate_reference": escalate_reference_iso,
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
            whatsapp_settings=whatsapp_settings,
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
    whatsapp_settings: tenant_runtime.WhatsappRuntimeSettings,
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
            "reengage_minutes": whatsapp_settings.reengage_minutes,
        },
    )
    send_result = None
    try:
        send_result = await whatsapp_service.send_manual_message(
            to_number=phone,
            body=REENGAGE_TEMPLATE,
            organizacion_id=org_id,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "whatsapp.followup.reengage_send_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        return

    message_sid = getattr(send_result, "sid", None) if send_result else None
    if message_sid:
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
                message_sid=message_sid,
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
                    "message_sid": message_sid,
                    "error": str(exc),
                },
            )

    attempt_count = int(followup_meta.get("reengage", {}).get("attempts") or 0) + 1
    followup_meta["reengage"] = {
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "attempts": attempt_count,
    }
    restart_sequence_value = int(metadata.get("restart_sequence") or 1)
    metadata["restart_sequence"] = restart_sequence_value
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

    if attempt_count >= 1:
        contact_id_value = str(contact.get("id") or contact.get("contacto_id") or contact_id)
        try:
            await storage.ensure_conversation_opportunity(
                conversation_id=conversation_id,
                contact_id=contact_id_value,
                channel="whatsapp",
            )
        except StorageError as exc:
            logger.warning(
                "whatsapp.followup.ensure_restart_failed",
                extra={"conversation_id": conversation_id, "error": str(exc)},
            )
        else:
            try:
                await storage.update_conversation(
                    conversation_id, {"restart_sequence": metadata["restart_sequence"]}
                )
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


def _should_skip_reengage_for_business_rules(opportunity: dict[str, Any]) -> bool:
    """Reglas de negocio inmobiliaria para no reenganchar leads ya resueltos."""
    stage = opportunity.get("etapa")
    stage_category = ""
    stage_code = ""
    if isinstance(stage, dict):
        stage_category = str(stage.get("categoria") or "").strip().lower()
        stage_code = str(stage.get("codigo") or "").strip().lower()
    elif isinstance(stage, list) and stage and isinstance(stage[0], dict):
        stage_category = str(stage[0].get("categoria") or "").strip().lower()
        stage_code = str(stage[0].get("codigo") or "").strip().lower()

    estado = str(opportunity.get("estado") or "").strip().lower()
    is_closed = (
        estado in {"ganada", "perdida", "cerrada"}
        or stage_category in {"ganada", "perdida", "cerrada"}
        or stage_code in {"cerrado_ganado", "cerrado_perdido", "ganada", "perdida"}
    )
    if is_closed:
        return True

    metadata = _ensure_dict(opportunity.get("metadata"))
    sales_notifications = _ensure_dict(metadata.get("sales_notifications"))
    booking_confirmed_at = (
        sales_notifications.get("booking_confirmed_at")
        or sales_notifications.get("booking_confirmed")
        or sales_notifications.get("booking_confirmed_en")
    )
    return bool(booking_confirmed_at)
