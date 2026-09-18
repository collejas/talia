"""Proceso independiente para entrega y sincronización de correo.

El worker reutiliza la cola durable de prospección para Brevo y Postmark. La sincronización
histórica permanece controlada exclusivamente por POSTMARK_SYNC_ENABLED y no se
activa desde este módulo.
"""

from __future__ import annotations

import asyncio
import logging
import signal

from app.core.config import settings
from app.core.logging import configure_logging, resolve_log_level
from app.services.prospeccion_contact_sender import ProspeccionContactSender
from app.services.postmark import postmark_worker


logger = logging.getLogger("app.workers.email_worker")


async def _run() -> None:
    if not settings.postmark_worker_enabled:
        logger.warning("email_worker.disabled", extra={"reason": "postmark_worker_disabled"})
        return

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(signum, stop_event.set)

    contact_sender = ProspeccionContactSender(channels=("correo",))
    await contact_sender.start()
    await postmark_worker.start()
    logger.info(
        "email_worker.started",
        extra={
            "postmark_sync_enabled": bool(settings.postmark_sync_enabled),
            "postmark_sync_interval_seconds": settings.postmark_sync_interval_seconds,
        },
    )
    try:
        await stop_event.wait()
    finally:
        await contact_sender.shutdown()
        await postmark_worker.shutdown()
        logger.info("email_worker.stopped")


def main() -> None:
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    configure_logging(
        level=min(resolve_log_level(settings.log_level, default=logging.INFO), logging.INFO),
        log_file="/var/www/talia/logs/email-worker.log",
    )
    asyncio.run(_run())


if __name__ == "__main__":
    main()
