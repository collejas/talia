"""Worker independiente para WhatsApp/Meta.

Procesa campañas programadas de WhatsApp, follow-ups, webhooks Meta y
reconciliación de estados. No ejecuta la sincronización histórica de Postmark.
"""

from __future__ import annotations

import asyncio
import logging
import signal
from typing import Any
from uuid import UUID

from app.channels.whatsapp import schemas, service
from app.core.config import settings
from app.core.logging import configure_logging, resolve_log_level
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services.meta_delivery_reconciliation_jobs import meta_delivery_reconciliation_runner
from app.services.prospeccion_contact_sender import ProspeccionContactSender
from app.services.whatsapp_followups import followup_runner

logger = logging.getLogger("app.workers.whatsapp_worker")
WEBHOOK_RETRY_BACKOFF_SECONDS = (15, 60, 300, 900, 1800)


def _retry_delay(attempt_count: int) -> int:
    index = max(0, int(attempt_count) - 1)
    return WEBHOOK_RETRY_BACKOFF_SECONDS[min(index, len(WEBHOOK_RETRY_BACKOFF_SECONDS) - 1)]


async def _process_webhook_job(repo: CRMRepository, row: dict[str, Any]) -> None:
    job_id = UUID(str(row["id"]))
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    organization_id = str(row.get("organizacion_id") or "").strip()
    if not organization_id:
        raise ValueError("whatsapp_webhook_missing_organization")

    incoming = schemas.MetaWhatsAppIncomingMessage.from_webhook_payload(payload)
    statuses = schemas.MetaWhatsAppStatusCallback.from_webhook_payload(payload)
    for message in incoming:
        await service.handle_incoming_message(
            message,
            "meta_worker",
            organizacion_id=organization_id,
        )
    for callback in statuses:
        await service.handle_status_callback(
            callback,
            provider="meta",
            organizacion_id=organization_id,
        )
    await repo.worker_mark_whatsapp_webhook_done(job_id=job_id)
    logger.info(
        "whatsapp.webhook_job_done",
        extra={"job_id": str(job_id), "messages": len(incoming), "statuses": len(statuses)},
    )


async def _process_webhook_cycle() -> bool:
    repo = CRMRepository()
    requeued = await repo.worker_requeue_expired_whatsapp_webhook_jobs(limit=100)
    if requeued:
        logger.warning("whatsapp.webhook_jobs_requeued", extra={"rows": requeued})
    rows = await repo.worker_list_ready_whatsapp_webhook_jobs(limit=25)
    processed = False
    for row in rows:
        try:
            job_id = UUID(str(row.get("id")))
            claimed = await repo.worker_claim_whatsapp_webhook_job(
                job_id=job_id,
                expected_attempt_count=int(row.get("attempt_count") or 0),
                lease_seconds=max(30, int(settings.whatsapp_webhook_job_lease_seconds)),
            )
        except (CRMRepositoryError, ValueError) as exc:
            logger.warning("whatsapp.webhook_job_claim_failed", extra={"error": str(exc)})
            continue
        if not claimed:
            continue
        processed = True
        try:
            await _process_webhook_job(repo, claimed)
        except Exception as exc:  # pragma: no cover - depende del proveedor/DB
            attempt_count = int(claimed.get("attempt_count") or 0)
            try:
                await repo.worker_mark_whatsapp_webhook_retry_or_failed(
                    job_id=job_id,
                    attempt_count=attempt_count,
                    max_attempts=int(claimed.get("max_attempts") or settings.whatsapp_webhook_max_attempts),
                    error=str(exc),
                    retry_delay_seconds=_retry_delay(attempt_count),
                )
            except CRMRepositoryError as mark_exc:
                logger.exception(
                    "whatsapp.webhook_job_mark_retry_failed",
                    extra={"job_id": str(job_id), "error": str(mark_exc)},
                )
            logger.exception(
                "whatsapp.webhook_job_failed",
                extra={"job_id": str(job_id), "attempt_count": attempt_count},
            )
    return processed


class WhatsAppWebhookRunner:
    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        if not settings.whatsapp_webhook_queue_enabled:
            logger.info("whatsapp.webhook_worker_disabled", extra={"reason": "disabled_by_config"})
            return
        self._stop = asyncio.Event()
        self._task = asyncio.create_task(self._run_loop(), name="whatsapp-webhook-worker")
        logger.info(
            "whatsapp.webhook_worker_started",
            extra={"interval_seconds": settings.whatsapp_webhook_worker_interval_seconds},
        )

    async def shutdown(self) -> None:
        self._stop.set()
        if self._task:
            await self._task
            self._task = None

    async def _run_loop(self) -> None:
        interval = max(1, int(settings.whatsapp_webhook_worker_interval_seconds))
        while not self._stop.is_set():
            try:
                processed = await _process_webhook_cycle()
            except Exception as exc:  # pragma: no cover - defensivo
                logger.exception("whatsapp.webhook_worker_cycle_failed", extra={"error": str(exc)})
                processed = False
            if not processed:
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=interval)
                except asyncio.TimeoutError:
                    pass


async def _run() -> None:
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(signum, stop_event.set)

    sender = ProspeccionContactSender(
        batch_size=getattr(settings, "prospeccion_sender_batch_size", 10),
        max_concurrency=getattr(settings, "prospeccion_sender_max_concurrency", 2),
        per_minute_limit=getattr(settings, "prospeccion_sender_per_minute_limit", 40),
        channels=("whatsapp",),
    )
    await sender.start()
    await followup_runner.start()
    await meta_delivery_reconciliation_runner.start()
    webhook_runner = WhatsAppWebhookRunner()
    await webhook_runner.start()
    logger.info("whatsapp_worker.started")
    try:
        await stop_event.wait()
    finally:
        await webhook_runner.shutdown()
        await meta_delivery_reconciliation_runner.shutdown()
        await followup_runner.shutdown()
        await sender.shutdown()
        logger.info("whatsapp_worker.stopped")


def main() -> None:
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    configure_logging(
        level=min(resolve_log_level(settings.log_level, default=logging.INFO), logging.INFO),
        log_file="/var/www/talia/logs/whatsapp-worker.log",
    )
    asyncio.run(_run())


if __name__ == "__main__":
    main()
