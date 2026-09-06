"""Actualiza periódicamente el estado de seguimiento de oportunidades abiertas."""

from __future__ import annotations

import asyncio

from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError

logger = get_logger(__name__)


class OpportunityFollowupStateRunner:
    """Evalúa estados por tenant usando la configuración almacenada en Supabase."""

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        if not bool(getattr(settings, "opportunity_followup_state_queue_enabled", True)):
            logger.info(
                "opportunity_followup_state.runner_disabled",
                extra={"reason": "disabled_by_config"},
            )
            return
        self._stop = asyncio.Event()
        self._task = asyncio.create_task(
            self._run_loop(),
            name="opportunity-followup-state",
        )
        logger.info(
            "opportunity_followup_state.runner_started",
            extra={
                "interval_seconds": int(
                    settings.opportunity_followup_state_runner_interval_seconds
                )
            },
        )

    async def shutdown(self) -> None:
        self._stop.set()
        if self._task:
            await self._task
            self._task = None

    async def _run_loop(self) -> None:
        interval = max(
            60,
            int(getattr(settings, "opportunity_followup_state_runner_interval_seconds", 300)),
        )
        while not self._stop.is_set():
            try:
                result = await CRMRepository().worker_evaluar_oportunidades_seguimiento()
                updated = int(result.get("oportunidades_actualizadas") or 0)
                if updated:
                    logger.info(
                        "opportunity_followup_state.cycle_ok",
                        extra={
                            "organizations_processed": result.get("organizaciones_procesadas"),
                            "opportunities_updated": updated,
                        },
                    )
            except CRMRepositoryError as exc:
                logger.warning(
                    "opportunity_followup_state.cycle_failed",
                    extra={"error": str(exc)},
                )
            except Exception as exc:  # pragma: no cover - defensa del worker
                logger.exception(
                    "opportunity_followup_state.cycle_unexpected_failed",
                    extra={"error": str(exc)},
                )
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=interval)
            except asyncio.TimeoutError:
                continue


opportunity_followup_state_runner = OpportunityFollowupStateRunner()
