"""Refresh periódico y controlado de la MV de consultas de Prospección."""

from __future__ import annotations

import asyncio
import time

from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.crm import CRMRepository

logger = get_logger(__name__)


class ProspeccionQueryDailyMVRefreshRunner:
    """Actualiza la MV fuera del camino crítico de las peticiones del panel."""

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        if not settings.prospeccion_query_mv_refresh_enabled:
            logger.info(
                "prospeccion.query_daily_mv.runner_disabled",
                extra={"reason": "disabled_by_config"},
            )
            return
        self._stop = asyncio.Event()
        self._task = asyncio.create_task(
            self._run_loop(),
            name="prospeccion-query-daily-mv-refresh",
        )
        logger.info(
            "prospeccion.query_daily_mv.runner_started",
            extra={
                "interval_seconds": settings.prospeccion_query_mv_refresh_interval_seconds,
            },
        )

    async def shutdown(self) -> None:
        self._stop.set()
        if self._task:
            await self._task
            self._task = None
        logger.info("prospeccion.query_daily_mv.runner_stopped")

    async def _run_loop(self) -> None:
        while not self._stop.is_set():
            started = time.perf_counter()
            try:
                await CRMRepository().refresh_prospeccion_query_daily_mv()
                logger.info(
                    "prospeccion.query_daily_mv.refresh_ok",
                    extra={
                        "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                    },
                )
            except Exception as exc:  # pragma: no cover - protección del worker
                logger.warning(
                    "prospeccion.query_daily_mv.refresh_failed",
                    extra={
                        "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                        "error": str(exc),
                    },
                )
            try:
                await asyncio.wait_for(
                    self._stop.wait(),
                    timeout=max(60, settings.prospeccion_query_mv_refresh_interval_seconds),
                )
            except asyncio.TimeoutError:
                continue


prospeccion_query_daily_mv_refresh_runner = ProspeccionQueryDailyMVRefreshRunner()
