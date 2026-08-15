"""Cierra callbacks Meta antiguos que no pudieron vincularse a un mensaje."""

from __future__ import annotations

import asyncio

from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError

logger = get_logger(__name__)


class MetaDeliveryReconciliationRunner:
    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self._wake = asyncio.Event()

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        if not bool(getattr(settings, "meta_delivery_reconciliation_enabled", True)):
            logger.info("meta_delivery_reconciliation.runner_disabled")
            return
        self._stop = asyncio.Event()
        self._wake = asyncio.Event()
        self._task = asyncio.create_task(self._run_loop(), name="meta-delivery-reconciliation")
        logger.info(
            "meta_delivery_reconciliation.runner_started",
            extra={"interval_seconds": int(settings.meta_delivery_reconciliation_interval_seconds)},
        )

    async def shutdown(self) -> None:
        self._stop.set()
        self._wake.set()
        if self._task:
            await self._task
            self._task = None

    async def wakeup(self) -> None:
        self._wake.set()

    async def _run_loop(self) -> None:
        interval_seconds = max(30, int(settings.meta_delivery_reconciliation_interval_seconds))
        while not self._stop.is_set():
            try:
                await self._process_cycle()
            except Exception as exc:  # pragma: no cover - defensivo
                logger.exception("meta_delivery_reconciliation.cycle_failed", extra={"error": str(exc)})
            self._wake.clear()
            wait_tasks = [asyncio.create_task(self._stop.wait()), asyncio.create_task(self._wake.wait())]
            try:
                await asyncio.wait(wait_tasks, timeout=interval_seconds, return_when=asyncio.FIRST_COMPLETED)
            finally:
                for task in wait_tasks:
                    if not task.done():
                        task.cancel()

    async def _process_cycle(self) -> None:
        try:
            updated = await CRMRepository().worker_reconcile_stale_meta_delivery_events(
                older_than_minutes=max(15, int(settings.meta_delivery_reconciliation_older_than_minutes)),
                limit=max(1, int(settings.meta_delivery_reconciliation_batch_size)),
            )
        except CRMRepositoryError as exc:
            logger.warning("meta_delivery_reconciliation.cycle_failed", extra={"error": str(exc)})
            return
        if updated:
            logger.info("meta_delivery_reconciliation.cycle_ok", extra={"no_conciliado": updated})


meta_delivery_reconciliation_runner = MetaDeliveryReconciliationRunner()
