"""Worker aislado para conciliación histórica de Brevo."""

from __future__ import annotations

import asyncio
import logging
import signal

from app.core.config import settings
from app.core.logging import configure_logging, resolve_log_level
from app.repositories.crm import CRMRepository
from app.services.brevo_sync import synchronize_brevo_history

logger = logging.getLogger("app.workers.brevo_sync_worker")


async def _run() -> None:
    if not settings.brevo_sync_enabled:
        logger.warning("brevo_sync_worker.disabled", extra={"reason": "brevo_sync_disabled"})
        return
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(signum, stop_event.set)
    repo = CRMRepository(timeout=settings.postmark_sync_page_timeout_seconds)
    logger.info(
        "brevo_sync_worker.started",
        extra={
            "interval_seconds": settings.brevo_sync_interval_seconds,
            "days": settings.brevo_sync_days,
        },
    )
    try:
        while not stop_event.is_set():
            try:
                await synchronize_brevo_history(repo=repo)
            except Exception:  # pragma: no cover - protección del proceso supervisor
                logger.exception("brevo_sync_worker.cycle_failed")
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=settings.brevo_sync_interval_seconds)
            except asyncio.TimeoutError:
                continue
    finally:
        logger.info("brevo_sync_worker.stopped")


def main() -> None:
    configure_logging(
        level=min(resolve_log_level(settings.log_level, default=logging.INFO), logging.INFO),
        log_file="/var/www/talia/logs/brevo-sync-worker.log",
    )
    asyncio.run(_run())


if __name__ == "__main__":
    main()
