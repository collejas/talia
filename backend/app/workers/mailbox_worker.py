"""Proceso independiente para lectura de buzones IMAP."""

from __future__ import annotations

import asyncio
import logging
import signal

from app.core.config import settings
from app.core.logging import configure_logging, resolve_log_level
from app.services.prospeccion_email_inbound_reader import email_inbound_reader


logger = logging.getLogger("app.workers.mailbox_worker")


async def _run() -> None:
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(signum, stop_event.set)

    await email_inbound_reader.start()
    logger.info("mailbox_worker.started")
    try:
        await stop_event.wait()
    finally:
        await email_inbound_reader.shutdown()
        logger.info("mailbox_worker.stopped")


def main() -> None:
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    configure_logging(
        level=min(resolve_log_level(settings.log_level, default=logging.INFO), logging.INFO),
        log_file="/var/www/talia/logs/mailbox-worker.log",
    )
    asyncio.run(_run())


if __name__ == "__main__":
    main()
