"""Evalúa límites de consumo de mensajes y mantiene alertas idempotentes."""

from __future__ import annotations

import asyncio

from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError

logger = get_logger(__name__)


class MessageBillingAlertRunner:
    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stop = asyncio.Event()
        self._task = asyncio.create_task(self._run_loop(), name="message-billing-alerts")
        logger.info("message_billing_alerts.runner_started", extra={"interval_seconds": settings.billing_alerts_interval_seconds})

    async def shutdown(self) -> None:
        self._stop.set()
        if self._task:
            await self._task
            self._task = None

    async def _run_loop(self) -> None:
        interval = max(30, int(settings.billing_alerts_interval_seconds))
        while not self._stop.is_set():
            try:
                updated = await CRMRepository().evaluate_message_billing_limit_alerts()
                if updated:
                    logger.info("message_billing_alerts.cycle_ok", extra={"alerts_updated": updated})
            except CRMRepositoryError as exc:
                logger.warning("message_billing_alerts.cycle_failed", extra={"error": str(exc)})
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=interval)
            except asyncio.TimeoutError:
                continue


message_billing_alert_runner = MessageBillingAlertRunner()
