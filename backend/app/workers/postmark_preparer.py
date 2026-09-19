"""Preparador independiente de campañas Postmark.

Este proceso prepara la cola de prospección y materializa bloques homogéneos
de hasta 500 mensajes. No llama a Postmark ni procesa Brevo/WhatsApp; la
entrega queda exclusivamente en ``talia-email-worker.service``.
"""

from __future__ import annotations

import asyncio
import logging
import signal

from app.core.config import settings
from app.core.logging import configure_logging, resolve_log_level
from app.services.postmark.repository import PostmarkRepository, PostmarkRepositoryError
from app.services.prospeccion_contact_sender import ProspeccionContactSender

logger = logging.getLogger("app.workers.postmark_preparer")


class PostmarkPreparationWorker:
    def __init__(self, *, interval_seconds: float = 5.0) -> None:
        self.interval_seconds = max(float(interval_seconds), 1.0)
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

    async def run_once(self) -> int:
        repository = PostmarkRepository()
        prepared = 0
        for organizacion_id in await repository.list_enabled_organizations():
            for source_batch_id in await repository.list_queued_source_batches(
                organizacion_id=organizacion_id
            ):
                source_batch = await repository.get_contact_batch(batch_id=source_batch_id)
                if not source_batch or source_batch.get("estado") != "completado":
                    continue
                blocks = await repository.prepare_delivery_batches(
                    organizacion_id=organizacion_id,
                    source_batch_id=source_batch_id,
                    max_messages=500,
                )
                if blocks:
                    prepared += len(blocks)
                    logger.info(
                        "postmark.preparation_ready",
                        extra={
                            "organizacion_id": str(organizacion_id),
                            "source_batch_id": str(source_batch_id),
                            "blocks": len(blocks),
                            "message_count": sum(
                                int(block.get("message_count") or 0) for block in blocks
                            ),
                        },
                    )
        return prepared

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stop = asyncio.Event()
        self._task = asyncio.create_task(self._run_loop(), name="postmark-preparer")
        logger.info(
            "postmark.preparer_started",
            extra={
                "interval_seconds": self.interval_seconds,
                "max_concurrency": settings.postmark_preparer_max_concurrency,
            },
        )

    async def shutdown(self) -> None:
        self._stop.set()
        if self._task:
            await self._task
            self._task = None

    async def _run_loop(self) -> None:
        while not self._stop.is_set():
            try:
                await self.run_once()
            except (PostmarkRepositoryError, ValueError) as exc:
                logger.warning("postmark.preparer_cycle_failed", extra={"error": str(exc)})
            except Exception as exc:  # pragma: no cover - protección del proceso
                logger.exception("postmark.preparer_cycle_unexpected", extra={"error": str(exc)})
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.interval_seconds)
            except asyncio.TimeoutError:
                pass


async def _run() -> None:
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(signum, stop_event.set)

    sender = ProspeccionContactSender(
        batch_size=settings.postmark_prospeccion_batch_size,
        max_concurrency=settings.postmark_preparer_max_concurrency,
        per_minute_limit=settings.postmark_prospeccion_per_minute_limit,
        channels=("correo",),
        provider="postmark",
    )
    preparer = PostmarkPreparationWorker(
        interval_seconds=settings.postmark_preparer_poll_interval_seconds,
    )
    if settings.postmark_worker_enabled:
        await sender.start()
        await preparer.start()
    else:
        logger.warning("postmark.preparer_disabled", extra={"reason": "postmark_worker_disabled"})
    try:
        await stop_event.wait()
    finally:
        await preparer.shutdown()
        await sender.shutdown()
        logger.info("postmark.preparer_stopped")


def main() -> None:
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    configure_logging(
        level=min(resolve_log_level(settings.log_level, default=logging.INFO), logging.INFO),
        log_file="/var/www/talia/logs/postmark-preparer.log",
    )
    asyncio.run(_run())


if __name__ == "__main__":
    main()
