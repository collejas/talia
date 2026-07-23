"""Cola persistente para reenganche automático y alertas a vendedores en WhatsApp."""

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
from app.services import conversation_summary, storage, tenant_runtime
from app.services.non_critical_job_gate import should_defer_non_critical_jobs
from app.services.storage import StorageError

logger = get_logger("app.services.whatsapp_followups")

REENGAGE_TEMPLATE = "¿Seguimos en contacto?"
_INFERRED_INACTIVITY_LABEL = "Resumen inferido por inactividad"
_DEFAULT_RETRY_BACKOFF_SECONDS: tuple[int, ...] = (30, 120, 300, 900, 1800)


def _safe_uuid(value: Any) -> UUID | None:
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
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
        if isinstance(value, str):
            trimmed = value.strip()
            if trimmed:
                return trimmed
    return None


def _retry_delay_for_attempt(attempt_count: int) -> int:
    index = max(0, int(attempt_count) - 1)
    if index >= len(_DEFAULT_RETRY_BACKOFF_SECONDS):
        return _DEFAULT_RETRY_BACKOFF_SECONDS[-1]
    return _DEFAULT_RETRY_BACKOFF_SECONDS[index]


async def schedule_customer_followup(
    *,
    conversation_id: str,
    persona_id: str,
    organizacion_id: str | None,
    opportunity_id: str | None = None,
    reason: str = "outbound_message",
) -> dict[str, Any] | None:
    conversation_uuid = _safe_uuid(conversation_id)
    persona_uuid = _safe_uuid(persona_id)
    org_uuid = _safe_uuid(organizacion_id)
    if not conversation_uuid or not persona_uuid or not org_uuid:
        logger.warning(
            "whatsapp.followup.schedule_invalid_ids",
            extra={
                "conversation_id": conversation_id,
                "persona_id": persona_id,
                "organizacion_id": organizacion_id,
                "reason": reason,
            },
        )
        return None
    runtime = await tenant_runtime.get_whatsapp_runtime_settings(organizacion_id=org_uuid)
    due_at = datetime.now(timezone.utc) + timedelta(minutes=max(1, runtime.reengage_minutes))
    repo = CRMRepository()
    return await _schedule_next_followup_job(
        repo=repo,
        organizacion_id=org_uuid,
        conversation_id=conversation_uuid,
        persona_id=persona_uuid,
        opportunity_id=_safe_uuid(opportunity_id),
        due_at=due_at,
        next_action="reengage",
        scheduled_reason=reason,
    )


async def cancel_followup_jobs_for_inbound(*, conversation_id: str, reason: str = "customer_replied") -> int:
    conversation_uuid = _safe_uuid(conversation_id)
    if not conversation_uuid:
        return 0
    repo = CRMRepository()
    try:
        canceled = await repo.worker_cancel_active_whatsapp_followup_jobs(
            conversation_id=conversation_uuid,
            reason=reason,
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "whatsapp.followup.cancel_failed",
            extra={"conversation_id": conversation_id, "reason": reason, "error": str(exc)},
        )
        return 0
    if canceled:
        logger.info(
            "whatsapp.followup.canceled",
            extra={"conversation_id": conversation_id, "reason": reason, "rows": canceled},
        )
    return canceled


async def _schedule_next_followup_job(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    conversation_id: UUID,
    persona_id: UUID,
    opportunity_id: UUID | None,
    due_at: datetime,
    next_action: str,
    scheduled_reason: str,
) -> dict[str, Any] | None:
    try:
        await repo.worker_cancel_active_whatsapp_followup_jobs(
            conversation_id=conversation_id,
            reason=f"replaced:{scheduled_reason}",
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "whatsapp.followup.replace_cancel_failed",
            extra={"conversation_id": str(conversation_id), "error": str(exc)},
        )
    try:
        row = await repo.worker_enqueue_whatsapp_followup_job(
            organizacion_id=organizacion_id,
            conversation_id=conversation_id,
            persona_id=persona_id,
            opportunity_id=opportunity_id,
            due_at=due_at,
            next_action=next_action,
            scheduled_reason=scheduled_reason,
            max_attempts=max(1, int(settings.whatsapp_reengage_max_attempts or 5)),
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "whatsapp.followup.enqueue_failed",
            extra={
                "conversation_id": str(conversation_id),
                "persona_id": str(persona_id),
                "next_action": next_action,
                "error": str(exc),
            },
        )
        return None
    await followup_runner.wakeup()
    logger.info(
        "whatsapp.followup.enqueued",
        extra={
            "job_id": row.get("id"),
            "conversation_id": str(conversation_id),
            "persona_id": str(persona_id),
            "due_at": due_at.astimezone(timezone.utc).isoformat(),
            "next_action": next_action,
            "scheduled_reason": scheduled_reason,
        },
    )
    return row


async def run_followups(
    *,
    now: datetime | None = None,
    limit: int | None = None,
    cursor_last_out: datetime | None = None,
    cursor_last_id: str | None = None,
) -> tuple[datetime | None, str | None]:
    del cursor_last_out, cursor_last_id
    reference_time = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    repo = CRMRepository()
    try:
        requeued = await repo.worker_requeue_expired_whatsapp_followup_jobs(limit=200)
    except CRMRepositoryError as exc:
        logger.warning("whatsapp.followup.requeue_expired_failed", extra={"error": str(exc)})
        requeued = 0
    if requeued:
        logger.info("whatsapp.followup.requeue_expired_ok", extra={"rows": requeued})

    try:
        jobs = await repo.worker_list_ready_whatsapp_followup_jobs(limit=limit or 50)
    except CRMRepositoryError as exc:
        logger.warning("whatsapp.followup.list_ready_failed", extra={"error": str(exc)})
        return None, None
    for row in jobs:
        job_id = _safe_uuid(row.get("id"))
        if not job_id:
            continue
        expected_attempt_count = int(row.get("attempt_count") or 0)
        try:
            claimed = await repo.worker_claim_whatsapp_followup_job(
                job_id=job_id,
                expected_attempt_count=expected_attempt_count,
                lease_seconds=max(30, int(settings.whatsapp_followup_job_lease_seconds)),
            )
        except CRMRepositoryError as exc:
            logger.warning(
                "whatsapp.followup.claim_failed",
                extra={"job_id": str(job_id), "error": str(exc)},
            )
            continue
        if not claimed:
            continue
        await _process_claimed_job(repo=repo, row=claimed, reference_time=reference_time)
    return None, None


class WhatsAppFollowupRunner:
    """Procesa la cola persistente de followups de WhatsApp."""

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self._wake = asyncio.Event()

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        if not settings.supabase_url or not settings.supabase_service_role:
            logger.warning("whatsapp.followup.disabled", extra={"reason": "supabase_config_missing"})
            return
        if not bool(getattr(settings, "whatsapp_followup_queue_enabled", True)):
            logger.warning("whatsapp.followup.disabled", extra={"reason": "disabled_by_config"})
            return
        self._stop = asyncio.Event()
        self._wake = asyncio.Event()
        self._task = asyncio.create_task(self._run_loop(), name="whatsapp-followups")
        logger.info(
            "whatsapp.followup.started",
            extra={"interval_seconds": int(settings.whatsapp_followup_runner_interval_seconds)},
        )

    async def shutdown(self) -> None:
        self._stop.set()
        self._wake.set()
        if self._task:
            await self._task
            self._task = None
        logger.info("whatsapp.followup.stopped")

    async def wakeup(self) -> None:
        self._wake.set()

    async def _run_loop(self) -> None:
        interval_seconds = max(5, int(getattr(settings, "whatsapp_followup_runner_interval_seconds", 20)))
        while not self._stop.is_set():
            try:
                defer, details = await should_defer_non_critical_jobs(job_name="whatsapp_followups")
                if defer:
                    logger.info("whatsapp.followup.deferred_due_to_blast", extra=details)
                else:
                    await run_followups()
            except Exception as exc:  # pragma: no cover
                logger.exception("whatsapp.followup.loop_error", extra={"error": str(exc)})
            self._wake.clear()
            wait_tasks = [
                asyncio.create_task(self._stop.wait()),
                asyncio.create_task(self._wake.wait()),
            ]
            try:
                done, pending = await asyncio.wait(
                    wait_tasks,
                    timeout=interval_seconds,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in done:
                    _ = task.result()
            finally:
                for task in wait_tasks:
                    if not task.done():
                        task.cancel()


followup_runner = WhatsAppFollowupRunner()


async def _process_claimed_job(*, repo: CRMRepository, row: dict[str, Any], reference_time: datetime) -> None:
    job_id = _safe_uuid(row.get("id"))
    conversation_id = _safe_uuid(row.get("conversation_id"))
    if not job_id or not conversation_id:
        return
    try:
        conversation = await repo.get_whatsapp_conversation_for_followup_job(conversation_id=conversation_id)
    except CRMRepositoryError as exc:
        await _fail_job(repo=repo, row=row, error=str(exc))
        return
    if not conversation:
        await repo.worker_mark_whatsapp_followup_done(
            job_id=job_id,
            result={"scheduled_reason": "conversation_missing"},
        )
        return

    try:
        context = await _load_followup_context(repo=repo, conversation=conversation, reference_time=reference_time)
    except Exception as exc:  # pragma: no cover
        await _fail_job(repo=repo, row=row, error=str(exc))
        return
    if context is None:
        await repo.worker_mark_whatsapp_followup_done(
            job_id=job_id,
            result={"scheduled_reason": "context_not_actionable"},
        )
        return

    next_due = _calculate_next_followup_due(
        conversation=context["conversation"],
        opportunity=context["opportunity"],
        whatsapp_settings=context["whatsapp_settings"],
    )
    if not next_due:
        await repo.worker_mark_whatsapp_followup_done(
            job_id=job_id,
            result={"scheduled_reason": "followup_not_needed"},
        )
        return

    logger.info(
        "whatsapp.followup.check",
        extra={
            "job_id": str(job_id),
            "conversation_id": str(conversation_id),
            "persona_id": context["persona_id"],
            "last_out": next_due["last_out"].isoformat() if next_due.get("last_out") else None,
            "due_at": next_due["due_at"].isoformat(),
            "next_action": next_due["next_action"],
            "attempts": next_due["reengage_attempts"],
            "max_attempts": next_due["max_reengage_attempts"],
        },
    )

    if next_due["due_at"] > reference_time:
        await repo.worker_reschedule_whatsapp_followup_job(
            job_id=job_id,
            due_at=next_due["due_at"],
            next_action=next_due["next_action"],
            scheduled_reason="state_recomputed",
        )
        return

    if next_due["next_action"] == "reengage":
        result = await _send_persona_reengage_message(
            conversation_id=str(conversation_id),
            persona_id=context["persona_id"],
            persona=context["contact"],
            followup_meta=next_due["followup_meta"],
            metadata=next_due["metadata"],
            repo=repo,
            opportunity_id=context["opp_uuid"],
            org_id=context["org_uuid"],
            whatsapp_settings=context["whatsapp_settings"],
        )
        if not result:
            await _fail_job(repo=repo, row=row, error="reengage_send_failed")
            return
        next_action = "reengage" if result["attempt_count"] < next_due["max_reengage_attempts"] else "escalate"
        delay_minutes = (
            context["whatsapp_settings"].reengage_minutes
            if next_action == "reengage"
            else max(0, context["whatsapp_settings"].escalate_minutes)
        )
        next_job_due_at = result["sent_at"] + timedelta(minutes=delay_minutes)
        await repo.worker_reschedule_whatsapp_followup_job(
            job_id=job_id,
            due_at=next_job_due_at,
            next_action=next_action,
            scheduled_reason="reengage_sent",
        )
        logger.info(
            "whatsapp.followup.rescheduled_after_reengage",
            extra={
                "job_id": str(job_id),
                "conversation_id": str(conversation_id),
                "next_action": next_action,
                "due_at": next_job_due_at.isoformat(),
            },
        )
        return

    if next_due["next_action"] == "escalate":
        escalated = await _escalate_persona_to_sales(
            conversation_id=str(conversation_id),
            persona_id=context["persona_id"],
            opportunity=context["opportunity"],
            followup_meta=next_due["followup_meta"],
            metadata=next_due["metadata"],
            repo=repo,
        )
        if not escalated:
            await _fail_job(repo=repo, row=row, error="escalate_send_failed")
            return
        await repo.worker_mark_whatsapp_followup_done(
            job_id=job_id,
            result={"scheduled_reason": "escalated"},
        )
        return

    await repo.worker_mark_whatsapp_followup_done(
        job_id=job_id,
        result={"scheduled_reason": "unknown_action"},
    )


async def _fail_job(*, repo: CRMRepository, row: dict[str, Any], error: str) -> None:
    job_id = _safe_uuid(row.get("id"))
    if not job_id:
        return
    attempt_count = int(row.get("attempt_count") or 0)
    max_attempts = int(row.get("max_attempts") or settings.whatsapp_reengage_max_attempts or 5)
    retry_delay = _retry_delay_for_attempt(attempt_count=attempt_count)
    try:
        updated = await repo.worker_mark_whatsapp_followup_retry_or_failed(
            job_id=job_id,
            attempt_count=attempt_count,
            max_attempts=max_attempts,
            error=error,
            retry_delay_seconds=retry_delay,
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "whatsapp.followup.mark_retry_failed",
            extra={"job_id": str(job_id), "error": str(exc)},
        )
        return
    logger.warning(
        "whatsapp.followup.job_failed",
        extra={
            "job_id": str(job_id),
            "attempt_count": attempt_count,
            "max_attempts": max_attempts,
            "retry_delay_seconds": retry_delay,
            "state": str(updated.get("state") if isinstance(updated, dict) else ""),
            "error": str(error),
        },
    )


async def _load_followup_context(
    *,
    repo: CRMRepository,
    conversation: dict[str, Any],
    reference_time: datetime,
) -> dict[str, Any] | None:
    if _manual_override(conversation):
        return None
    state = str(conversation.get("estado") or "").lower()
    if state == "cerrada":
        return None
    convo_id = str(conversation.get("id") or "").strip()
    persona_id = str(conversation.get("persona_id") or conversation.get("contacto_id") or "").strip()
    if not convo_id or not persona_id:
        return None
    last_out = _parse_ts(conversation.get("ultimo_saliente_en"))
    if not last_out or last_out > reference_time:
        return None
    last_in = _parse_ts(conversation.get("ultimo_entrante_en"))
    if last_in and last_in > last_out:
        return None
    if _is_outbound_prospeccion_without_reply(conversation):
        logger.info(
            "whatsapp.followup.skip_outbound_prospeccion",
            extra={
                "conversation_id": convo_id,
                "persona_id": persona_id,
                "source": _ensure_dict(conversation.get("inbox_context")).get("source"),
            },
        )
        return None

    try:
        contact = await storage.fetch_persona(persona_id)
    except StorageError as exc:
        logger.warning(
            "whatsapp.followup.contact_failed",
            extra={"conversation_id": convo_id, "error": str(exc)},
        )
        return None
    if not contact or not _contact_phone_value(contact):
        return None

    try:
        oportunidad_id = await storage.ensure_conversation_opportunity(
            conversation_id=convo_id,
            persona_id=persona_id,
            channel="whatsapp",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.followup.ensure_opportunity_failed",
            extra={"conversation_id": convo_id, "error": str(exc)},
        )
        return None

    org_id = contact.get("organizacion_id") or conversation.get("organizacion_id")
    org_uuid = _safe_uuid(org_id)
    opp_uuid = _safe_uuid(oportunidad_id)
    if not org_uuid or not opp_uuid:
        return None

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
        return None
    if not opportunity or _should_skip_reengage_for_business_rules(opportunity):
        return None

    whatsapp_settings = await tenant_runtime.get_whatsapp_runtime_settings(organizacion_id=org_uuid)
    return {
        "conversation": conversation,
        "contact": contact,
        "opportunity": opportunity,
        "persona_id": persona_id,
        "org_uuid": org_uuid,
        "opp_uuid": opp_uuid,
        "whatsapp_settings": whatsapp_settings,
    }


def _calculate_next_followup_due(
    *,
    conversation: dict[str, Any],
    opportunity: dict[str, Any],
    whatsapp_settings: tenant_runtime.WhatsappRuntimeSettings,
) -> dict[str, Any] | None:
    last_out = _parse_ts(conversation.get("ultimo_saliente_en"))
    if not last_out:
        return None
    last_in = _parse_ts(conversation.get("ultimo_entrante_en"))
    if last_in and last_in > last_out:
        return None

    metadata = _ensure_dict(opportunity.get("metadata"))
    followup_meta = _ensure_dict(metadata.get("whatsapp_followup"))
    reengage_meta = _ensure_dict(followup_meta.get("reengage"))
    escalate_meta = _ensure_dict(followup_meta.get("escalate"))
    reengage_sent_at = _parse_ts(reengage_meta.get("sent_at"))
    escalate_sent_at = _parse_ts(escalate_meta.get("sent_at"))
    reengage_attempts = int(reengage_meta.get("attempts") or 0)
    max_reengage_attempts = max(1, whatsapp_settings.reengage_max_attempts)

    if reengage_attempts < max_reengage_attempts:
        due_at = last_out + timedelta(minutes=max(1, whatsapp_settings.reengage_minutes))
        return {
            "due_at": due_at,
            "next_action": "reengage",
            "metadata": metadata,
            "followup_meta": followup_meta,
            "reengage_attempts": reengage_attempts,
            "max_reengage_attempts": max_reengage_attempts,
            "last_out": last_out,
            "reengage_sent_at": reengage_sent_at,
            "escalate_sent_at": escalate_sent_at,
        }

    if escalate_sent_at is not None:
        return None

    baseline = reengage_sent_at or last_out
    due_at = baseline + timedelta(minutes=max(0, whatsapp_settings.escalate_minutes))
    return {
        "due_at": due_at,
        "next_action": "escalate",
        "metadata": metadata,
        "followup_meta": followup_meta,
        "reengage_attempts": reengage_attempts,
        "max_reengage_attempts": max_reengage_attempts,
        "last_out": last_out,
        "reengage_sent_at": reengage_sent_at,
        "escalate_sent_at": escalate_sent_at,
    }


async def _send_persona_reengage_message(
    *,
    conversation_id: str,
    persona_id: str,
    persona: dict[str, Any],
    followup_meta: dict[str, Any],
    metadata: dict[str, Any],
    repo: CRMRepository,
    opportunity_id: UUID,
    org_id: UUID,
    whatsapp_settings: tenant_runtime.WhatsappRuntimeSettings,
) -> dict[str, Any] | None:
    phone = _contact_phone_value(persona) or ""
    if not phone:
        return None
    logger.info(
        "whatsapp.followup.reengage_attempt",
        extra={
            "conversation_id": conversation_id,
            "phone": phone,
            "attempts": int(followup_meta.get("reengage", {}).get("attempts") or 0),
            "reengage_minutes": whatsapp_settings.reengage_minutes,
        },
    )
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
        return None

    sent_at = datetime.now(timezone.utc)
    message_sid = getattr(send_result, "sid", None) if send_result else None
    if message_sid:
        persona_id_value = persona.get("id") or persona_id
        wa_id = phone.lstrip("+") if phone.startswith("+") else phone
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
                persona_id=str(persona_id_value) if persona_id_value else None,
                metadata=metadata_payload,
                organizacion_id=str(persona.get("organizacion_id")) if persona.get("organizacion_id") else None,
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
        "sent_at": sent_at.isoformat(),
        "attempts": attempt_count,
    }
    metadata["restart_sequence"] = int(metadata.get("restart_sequence") or 1)
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

    try:
        await storage.ensure_conversation_opportunity(
            conversation_id=conversation_id,
            persona_id=str(persona.get("id") or persona_id),
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
                conversation_id,
                {"restart_sequence": metadata["restart_sequence"]},
            )
        except StorageError as exc:
            logger.warning(
                "whatsapp.followup.conversation_restart_update_failed",
                extra={"conversation_id": conversation_id, "error": str(exc)},
            )
    return {"attempt_count": attempt_count, "sent_at": sent_at}


async def _escalate_persona_to_sales(
    *,
    conversation_id: str,
    persona_id: str,
    opportunity: dict[str, Any],
    followup_meta: dict[str, Any],
    metadata: dict[str, Any],
    repo: CRMRepository,
) -> bool:
    persona = opportunity.get("contacto")
    if isinstance(persona, dict):
        persona = await _ensure_inferred_persona_context(
            conversation_id=conversation_id,
            persona_id=persona_id,
            persona=persona,
            opportunity=opportunity,
        )
    resumen = None
    notes = None
    if isinstance(persona, dict):
        resumen = persona.get("necesidad_proposito") or persona.get("notes")
        notes = persona.get("notes")

    context = ToolRuntimeContext(
        conversation_id=conversation_id,
        persona_id=persona_id,
        channel="whatsapp",
    )
    try:
        await whatsapp_tools._notify_sales_rep(
            context=context,
            trigger="followup_escalate",
            persona=persona,
            opportunity_id=str(opportunity.get("id")),
            resumen=resumen,
            notes=notes,
            email=None,
            extra={"reason": "inactivity"},
        )
        await whatsapp_tools._notify_customer_assigned_seller(
            context=context,
            opportunity_id=str(opportunity.get("id") or "") or None,
            persona=persona,
            trigger="followup_escalate",
        )
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "whatsapp.followup.escalate_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        return False

    followup_meta["escalate"] = {"sent_at": datetime.now(timezone.utc).isoformat()}
    metadata["whatsapp_followup"] = followup_meta
    org_id = opportunity.get("organizacion_id")
    opp_id = opportunity.get("id")
    if not org_id or not opp_id:
        return True
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
    return True


def _build_inactivity_need(summary_text: str) -> str:
    normalized = " ".join(str(summary_text or "").split()).strip(" .")
    if not normalized:
        return _INFERRED_INACTIVITY_LABEL
    first_sentence = normalized.split(". ", 1)[0].strip(" .")
    if not first_sentence:
        first_sentence = normalized[:220].rstrip(" ,;:")
    if len(first_sentence) > 220:
        first_sentence = first_sentence[:219].rstrip() + "…"
    return f"{_INFERRED_INACTIVITY_LABEL}: {first_sentence}"


async def _ensure_inferred_persona_context(
    *,
    conversation_id: str,
    persona_id: str,
    persona: dict[str, Any],
    opportunity: dict[str, Any],
) -> dict[str, Any]:
    existing_notes = str(persona.get("notes") or "").strip()
    existing_need = str(persona.get("necesidad_proposito") or "").strip()
    if existing_notes and existing_need:
        return persona

    org_id = persona.get("organizacion_id") or opportunity.get("organizacion_id")
    try:
        org_uuid = UUID(str(org_id)) if org_id else None
    except (TypeError, ValueError):
        org_uuid = None

    try:
        summary_record = await conversation_summary.ensure_conversation_summary(
            conversation_id=conversation_id,
            persona_id=persona_id,
            organizacion_id=org_uuid,
            generate_if_missing=True,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "whatsapp.followup.inferred_summary_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
        return persona

    summary_text = ""
    if isinstance(summary_record, dict):
        summary_text = str(summary_record.get("resumen") or "").strip()
    if not summary_text:
        return persona

    inferred_notes = existing_notes or f"{_INFERRED_INACTIVITY_LABEL}: {summary_text}"
    inferred_need = existing_need or _build_inactivity_need(summary_text)
    patch_payload: dict[str, Any] = {}
    if not existing_notes:
        patch_payload["notes"] = inferred_notes
    if not existing_need:
        patch_payload["necesidad_proposito"] = inferred_need
    if not patch_payload:
        return persona

    try:
        updated_contact = await storage.update_persona(persona_id, patch_payload)
    except StorageError as exc:
        logger.warning(
            "whatsapp.followup.inferred_contact_update_failed",
            extra={"conversation_id": conversation_id, "persona_id": persona_id, "error": str(exc)},
        )
        updated_contact = {**persona, **patch_payload}
    try:
        await storage.upsert_conversation_insights(
            conversation_id=conversation_id,
            resumen=inferred_notes,
            intencion=inferred_need,
            siguiente_accion="seguimiento_vendedor_por_inactividad",
        )
    except StorageError as exc:
        logger.warning(
            "whatsapp.followup.inferred_insights_failed",
            extra={"conversation_id": conversation_id, "error": str(exc)},
        )
    logger.info(
        "whatsapp.followup.inferred_contact_context_created",
        extra={
            "conversation_id": conversation_id,
            "persona_id": persona_id,
            "filled_notes": "notes" in patch_payload,
            "filled_need": "necesidad_proposito" in patch_payload,
        },
    )
    return updated_contact if isinstance(updated_contact, dict) else {**persona, **patch_payload}


async def _send_reengage_message(
    *,
    conversation_id: str,
    persona_id: str,
    contact: dict[str, Any],
    followup_meta: dict[str, Any],
    metadata: dict[str, Any],
    repo: CRMRepository,
    opportunity_id: UUID,
    org_id: UUID,
    whatsapp_settings: tenant_runtime.WhatsappRuntimeSettings,
) -> dict[str, Any] | None:
    return await _send_persona_reengage_message(
        conversation_id=conversation_id,
        persona_id=persona_id,
        persona=contact,
        followup_meta=followup_meta,
        metadata=metadata,
        repo=repo,
        opportunity_id=opportunity_id,
        org_id=org_id,
        whatsapp_settings=whatsapp_settings,
    )


async def _escalate_to_sales(
    *,
    conversation_id: str,
    persona_id: str,
    opportunity: dict[str, Any],
    followup_meta: dict[str, Any],
    metadata: dict[str, Any],
    repo: CRMRepository,
) -> bool:
    return await _escalate_persona_to_sales(
        conversation_id=conversation_id,
        persona_id=persona_id,
        opportunity=opportunity,
        followup_meta=followup_meta,
        metadata=metadata,
        repo=repo,
    )


async def _ensure_inferred_contact_context(
    *,
    conversation_id: str,
    persona_id: str,
    contact: dict[str, Any],
    opportunity: dict[str, Any],
) -> dict[str, Any]:
    return await _ensure_inferred_persona_context(
        conversation_id=conversation_id,
        persona_id=persona_id,
        persona=contact,
        opportunity=opportunity,
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


def _is_outbound_prospeccion_without_reply(conversation: dict[str, Any]) -> bool:
    context = _ensure_dict(conversation.get("inbox_context"))
    source = str(context.get("source") or "").strip().lower()
    if source != "prospeccion":
        return False
    last_in = _parse_ts(conversation.get("ultimo_entrante_en"))
    return last_in is None


def _should_skip_reengage_for_business_rules(opportunity: dict[str, Any]) -> bool:
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
    primary_by_channel = _ensure_dict(metadata.get("sales_primary_notifications"))
    primary_whatsapp = _ensure_dict(primary_by_channel.get("whatsapp"))
    if primary_whatsapp:
        return True

    for trigger in ("close_lead", "booking_confirmed", "booking_canceled", "followup_escalate"):
        notification_payload = sales_notifications.get(trigger)
        if isinstance(notification_payload, dict):
            if str(notification_payload.get("sent_at") or "").strip():
                return True
        elif notification_payload:
            return True

    booking_confirmed_at = (
        sales_notifications.get("booking_confirmed_at")
        or sales_notifications.get("booking_confirmed")
        or sales_notifications.get("booking_confirmed_en")
    )
    return bool(booking_confirmed_at)
