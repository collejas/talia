"""Worker periodico que purga búsquedas DENUE borradas lógicamente."""

from __future__ import annotations

import asyncio
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError

logger = get_logger(__name__)


class DeletedBusquedasPurgeRunner:
    """Procesa en background la purga física de búsquedas marcadas como borradas."""

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self._wake = asyncio.Event()

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        if not bool(getattr(settings, "busquedas_purge_queue_enabled", True)):
            logger.info("deleted_busquedas_purge.runner_disabled", extra={"reason": "disabled_by_config"})
            return
        self._stop = asyncio.Event()
        self._wake = asyncio.Event()
        self._task = asyncio.create_task(self._run_loop(), name="deleted-busquedas-purge")
        logger.info(
            "deleted_busquedas_purge.runner_started",
            extra={"interval_seconds": int(settings.busquedas_purge_runner_interval_seconds)},
        )

    async def shutdown(self) -> None:
        self._stop.set()
        self._wake.set()
        if self._task:
            await self._task
            self._task = None
        logger.info("deleted_busquedas_purge.runner_stopped")

    async def wakeup(self) -> None:
        self._wake.set()

    async def _run_loop(self) -> None:
        interval_seconds = max(30, int(getattr(settings, "busquedas_purge_runner_interval_seconds", 300)))
        while not self._stop.is_set():
            try:
                await self._process_cycle()
            except Exception as exc:  # pragma: no cover - defensivo
                logger.exception("deleted_busquedas_purge.runner_cycle_failed", extra={"error": str(exc)})
            self._wake.clear()
            wait_tasks = [
                asyncio.create_task(self._stop.wait()),
                asyncio.create_task(self._wake.wait()),
            ]
            try:
                done, _pending = await asyncio.wait(
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
            result = await repo.worker_purge_deleted_busquedas(
                batch_size=max(1, int(settings.busquedas_purge_batch_size)),
                row_chunk_size=max(1, int(settings.busquedas_purge_row_chunk_size)),
                purge_after_days=max(1, int(settings.busquedas_purge_after_days)),
            )
        except CRMRepositoryError as exc:
            logger.warning("deleted_busquedas_purge.cycle_failed", extra={"error": str(exc)})
            return
        if not isinstance(result, dict):
            return
        archived = int(result.get("archived_now") or 0)
        deleted = int(result.get("deleted_now") or 0)
        busquedas_deleted = int(result.get("busquedas_deleted_now") or 0)
        if archived or deleted or busquedas_deleted:
            logger.info(
                "deleted_busquedas_purge.cycle_ok",
                extra={
                    "archived_now": archived,
                    "deleted_now": deleted,
                    "busquedas_deleted_now": busquedas_deleted,
                },
            )


deleted_busquedas_purge_runner = DeletedBusquedasPurgeRunner()
