"""Worker aislado para construir snapshots de atribución de Prospección."""

from __future__ import annotations

import asyncio
import logging
import signal
import time
from uuid import UUID

from app.core.config import settings
from app.core.logging import configure_logging, resolve_log_level
from app.repositories.crm import CRMRepository

logger = logging.getLogger("app.workers.prospeccion_atribucion_worker")


async def _run() -> None:
    if not settings.prospeccion_atribucion_worker_enabled:
        logger.warning("prospeccion_atribucion_worker.disabled")
        return

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(signum, stop_event.set)

    repo = CRMRepository(timeout=125.0)
    logger.info(
        "prospeccion_atribucion_worker.started",
        extra={"interval_seconds": settings.prospeccion_atribucion_worker_interval_seconds},
    )
    try:
        while not stop_event.is_set():
            jobs = await repo.worker_claim_prospeccion_campana_atribucion_jobs(
                limit=1, lease_seconds=300
            )
            for job in jobs:
                job_id = UUID(str(job["id"]))
                started = time.perf_counter()
                try:
                    await repo.refresh_prospeccion_campana_atribucion_cache(
                        organizacion_id=UUID(str(job["organizacion_id"])),
                        date_from_iso=str(job["periodo_desde"]),
                        date_to_iso=str(job["periodo_hasta"]),
                        campana_id=UUID(str(job["campana_id"])) if job.get("campana_id") else None,
                    )
                    await repo.worker_finish_prospeccion_campana_atribution_job(
                        job_id=job_id, success=True
                    )
                    logger.info(
                        "prospeccion_atribucion_job.completed",
                        extra={
                            "job_id": str(job_id),
                            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                        },
                    )
                except Exception as exc:
                    try:
                        await repo.worker_finish_prospeccion_campana_atribution_job(
                            job_id=job_id, success=False, error=str(exc), retry_seconds=120
                        )
                    except Exception:
                        logger.exception(
                            "prospeccion_atribucion_job.finish_failed",
                            extra={"job_id": str(job_id)},
                        )
                    logger.exception(
                        "prospeccion_atribucion_job.failed",
                        extra={"job_id": str(job_id), "error": str(exc)},
                    )

            try:
                await asyncio.wait_for(
                    stop_event.wait(),
                    timeout=max(5, settings.prospeccion_atribucion_worker_interval_seconds),
                )
            except asyncio.TimeoutError:
                continue
    finally:
        logger.info("prospeccion_atribucion_worker.stopped")


def main() -> None:
    configure_logging(
        level=min(resolve_log_level(settings.log_level, default=logging.INFO), logging.INFO),
        log_file="/var/www/talia/logs/prospeccion-atribucion-worker.log",
    )
    asyncio.run(_run())


if __name__ == "__main__":
    main()
