"""Cola robusta para notificaciones críticas a vendedor."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.assistants.tool_runtime import ToolRuntimeContext
from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError

logger = get_logger("app.services.sales_notification_jobs")

_DEFAULT_RETRY_BACKOFF_SECONDS: tuple[int, ...] = (30, 120, 300, 900, 1800)


def _safe_uuid(value: Any) -> UUID | None:
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _clean_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _retry_delay_for_attempt(attempt_count: int) -> int:
    index = max(0, int(attempt_count) - 1)
    if index >= len(_DEFAULT_RETRY_BACKOFF_SECONDS):
        return _DEFAULT_RETRY_BACKOFF_SECONDS[-1]
    return _DEFAULT_RETRY_BACKOFF_SECONDS[index]


def _serialize_contact(contact: dict[str, Any] | None) -> dict[str, Any] | None:
    return dict(contact) if isinstance(contact, dict) else None


async def enqueue_webchat_sales_notification(
    *,
    conversation_id: str,
    contact_id: str,
    trigger: str,
    channel: str,
    organizacion_id: UUID,
    opportunity_id: str | None,
    resumen: str | None,
    notes: str | None,
    email: str | None,
    extra: dict[str, Any] | None,
    contact: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Encola una notificación crítica para vendedor."""

    conversation_uuid = _safe_uuid(conversation_id)
    contact_uuid = _safe_uuid(contact_id)
    if not conversation_uuid or not contact_uuid:
        logger.warning(
            "sales_notification.enqueue_invalid_ids",
            extra={
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "trigger": trigger,
            },
        )
        return None
    opportunity_uuid = _safe_uuid(opportunity_id)
    payload = {
        "context": {
            "conversation_id": str(conversation_uuid),
            "contact_id": str(contact_uuid),
            "channel": _clean_text(channel) or "webchat",
        },
        "trigger": _clean_text(trigger),
        "opportunity_id": str(opportunity_uuid) if opportunity_uuid else None,
        "resumen": _clean_text(resumen),
        "notes": _clean_text(notes),
        "email": _clean_text(email),
        "extra": dict(extra or {}),
        "contact": _serialize_contact(contact),
        "queued_at": datetime.now(timezone.utc).isoformat(),
    }
    repo = CRMRepository()
    try:
        row = await repo.worker_enqueue_sales_notification_job(
            organizacion_id=organizacion_id,
            channel=_clean_text(channel) or "webchat",
            trigger=_clean_text(trigger) or "unknown_trigger",
            conversation_id=conversation_uuid,
            contact_id=contact_uuid,
            opportunity_id=opportunity_uuid,
            payload=payload,
            max_attempts=max(1, int(settings.sales_notification_max_attempts)),
        )
    except CRMRepositoryError as exc:
        logger.warning(
            "sales_notification.enqueue_failed",
            extra={
                "conversation_id": str(conversation_uuid),
                "contact_id": str(contact_uuid),
                "trigger": trigger,
                "error": str(exc),
            },
        )
        return None

    await sales_notification_jobs_runner.wakeup()
    logger.info(
        "sales_notification.enqueued",
        extra={
            "job_id": row.get("id"),
            "conversation_id": str(conversation_uuid),
            "contact_id": str(contact_uuid),
            "trigger": trigger,
        },
    )
    return row


class SalesNotificationJobsRunner:
    """Procesa la cola persistente de notificaciones a vendedor."""

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self._wake = asyncio.Event()

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        if not bool(getattr(settings, "sales_notification_queue_enabled", True)):
            logger.warning("sales_notification.runner_disabled", extra={"reason": "disabled_by_config"})
            return
        self._stop = asyncio.Event()
        self._wake = asyncio.Event()
        self._task = asyncio.create_task(self._run_loop(), name="sales-notification-jobs")
        logger.info(
            "sales_notification.runner_started",
            extra={"interval_seconds": int(settings.sales_notification_runner_interval_seconds)},
        )

    async def shutdown(self) -> None:
        self._stop.set()
        self._wake.set()
        if self._task:
            await self._task
            self._task = None
        logger.info("sales_notification.runner_stopped")

    async def wakeup(self) -> None:
        self._wake.set()

    async def _run_loop(self) -> None:
        interval_seconds = max(5, int(getattr(settings, "sales_notification_runner_interval_seconds", 20)))
        while not self._stop.is_set():
            try:
                await self._process_cycle()
            except Exception as exc:  # pragma: no cover
                logger.exception("sales_notification.runner_cycle_failed", extra={"error": str(exc)})
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

    async def _process_cycle(self) -> None:
        repo = CRMRepository()
        try:
            requeued = await repo.worker_requeue_expired_sales_notification_jobs(limit=200)
        except CRMRepositoryError as exc:
            logger.warning("sales_notification.requeue_expired_failed", extra={"error": str(exc)})
            requeued = 0
        if requeued:
            logger.info("sales_notification.requeue_expired_ok", extra={"rows": requeued})

        try:
            jobs = await repo.worker_list_ready_sales_notification_jobs(limit=50)
        except CRMRepositoryError as exc:
            logger.warning("sales_notification.list_ready_failed", extra={"error": str(exc)})
            return
        if not jobs:
            return

        for row in jobs:
            job_id = _safe_uuid(row.get("id"))
            if not job_id:
                continue
            expected_attempt_count = int(row.get("attempt_count") or 0)
            try:
                claimed = await repo.worker_claim_sales_notification_job(
                    job_id=job_id,
                    expected_attempt_count=expected_attempt_count,
                    lease_seconds=max(30, int(settings.sales_notification_job_lease_seconds)),
                )
            except CRMRepositoryError as exc:
                logger.warning(
                    "sales_notification.claim_failed",
                    extra={"job_id": str(job_id), "error": str(exc)},
                )
                continue
            if not claimed:
                continue
            await self._process_claimed_job(repo=repo, row=claimed)

    async def _process_claimed_job(self, *, repo: CRMRepository, row: dict[str, Any]) -> None:
        job_id = _safe_uuid(row.get("id"))
        if not job_id:
            return
        payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
        context_payload = payload.get("context") if isinstance(payload, dict) else {}
        if not isinstance(context_payload, dict):
            context_payload = {}
        conversation_id = _clean_text(context_payload.get("conversation_id"))
        persona_id = _clean_text(context_payload.get("persona_id"))
        if not persona_id:
            persona_id = _clean_text(context_payload.get("contact_id"))
        channel = _clean_text(context_payload.get("channel")) or "webchat"
        trigger = _clean_text(payload.get("trigger")) or _clean_text(row.get("trigger")) or "unknown_trigger"
        if not conversation_id or not persona_id:
            await self._fail_job(
                repo=repo,
                row=row,
                error="missing_context_ids",
            )
            return
        context = ToolRuntimeContext(
            conversation_id=conversation_id,
            persona_id=persona_id,
            channel=channel,
        )

        # Import diferido para evitar ciclos al bootstrap.
        from app.channels.webchat import notifications as webchat_notifications

        try:
            await webchat_notifications.notify_sales_rep(
                context=context,
                trigger=trigger,
                persona=payload.get("contact") if isinstance(payload.get("contact"), dict) else None,
                opportunity_id=_clean_text(payload.get("opportunity_id")),
                resumen=_clean_text(payload.get("resumen")),
                notes=_clean_text(payload.get("notes")),
                email=_clean_text(payload.get("email")),
                extra=payload.get("extra") if isinstance(payload.get("extra"), dict) else {},
                force_retry=bool(int(row.get("attempt_count") or 0) > 1),
                raise_on_delivery_error=True,
            )
        except Exception as exc:  # pragma: no cover
            await self._fail_job(repo=repo, row=row, error=str(exc))
            return

        result_payload = dict(payload)
        result_payload["processed_at"] = datetime.now(timezone.utc).isoformat()
        try:
            await repo.worker_mark_sales_notification_done(job_id=job_id, result=result_payload)
        except CRMRepositoryError as exc:
            logger.warning(
                "sales_notification.mark_done_failed",
                extra={"job_id": str(job_id), "error": str(exc)},
            )
            return
        logger.info(
            "sales_notification.job_done",
            extra={
                "job_id": str(job_id),
                "trigger": trigger,
                "attempt_count": int(row.get("attempt_count") or 0),
            },
        )

    async def _fail_job(self, *, repo: CRMRepository, row: dict[str, Any], error: str) -> None:
        job_id = _safe_uuid(row.get("id"))
        if not job_id:
            return
        attempt_count = int(row.get("attempt_count") or 0)
        max_attempts = int(row.get("max_attempts") or settings.sales_notification_max_attempts or 5)
        retry_delay = _retry_delay_for_attempt(attempt_count=attempt_count)
        try:
            updated = await repo.worker_mark_sales_notification_retry_or_failed(
                job_id=job_id,
                attempt_count=attempt_count,
                max_attempts=max_attempts,
                error=error,
                retry_delay_seconds=retry_delay,
            )
        except CRMRepositoryError as exc:
            logger.warning(
                "sales_notification.mark_retry_failed",
                extra={"job_id": str(job_id), "error": str(exc)},
            )
            return
        new_state = _clean_text(updated.get("state") if isinstance(updated, dict) else None)
        logger.warning(
            "sales_notification.job_failed",
            extra={
                "job_id": str(job_id),
                "attempt_count": attempt_count,
                "max_attempts": max_attempts,
                "retry_delay_seconds": retry_delay,
                "state": new_state,
                "error": str(error),
            },
        )


sales_notification_jobs_runner = SalesNotificationJobsRunner()
