"""Worker aislado para construir snapshots de atribución de Prospección."""

from __future__ import annotations

import asyncio
import logging
import signal
import time
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import UUID

import asyncpg

from app.core.config import settings
from app.core.logging import configure_logging, resolve_log_level
from app.repositories.crm import CRMRepository

logger = logging.getLogger("app.workers.prospeccion_atribucion_worker")


def _listener_dsn() -> str | None:
    raw_url = (settings.database_url or "").strip()
    if not raw_url:
        return None
    parsed = urlsplit(raw_url)
    query = [(key, value) for key, value in parse_qsl(parsed.query) if key != "sslmode"]
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment))


async def _listen_for_jobs(wakeup: asyncio.Event, stop_event: asyncio.Event) -> None:
    dsn = _listener_dsn()
    if not dsn:
        logger.warning("prospeccion_atribucion_worker.listener_disabled_missing_database_url")
        return

    while not stop_event.is_set():
        connection: asyncpg.Connection | None = None
        try:
            connection = await asyncpg.connect(dsn=dsn, timeout=10, ssl="require")

            def on_notification(
                _connection: asyncpg.Connection,
                _pid: int,
                _channel: str,
                _payload: str,
            ) -> None:
                wakeup.set()

            await connection.add_listener("prospeccion_atribucion_jobs", on_notification)
            logger.info("prospeccion_atribucion_worker.listener_connected")
            while not stop_event.is_set():
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=60)
                except asyncio.TimeoutError:
                    await connection.fetchval("select 1")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning(
                "prospeccion_atribucion_worker.listener_failed",
                extra={"error": str(exc)},
            )
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=15)
            except asyncio.TimeoutError:
                continue
        finally:
            if connection is not None:
                await connection.close()


async def _run() -> None:
    if not settings.prospeccion_atribucion_worker_enabled:
        logger.warning("prospeccion_atribucion_worker.disabled")
        return

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(signum, stop_event.set)

    repo = CRMRepository(timeout=125.0)
    wakeup_event = asyncio.Event()
    listener_task = asyncio.create_task(_listen_for_jobs(wakeup_event, stop_event))
    logger.info(
        "prospeccion_atribucion_worker.started",
        extra={"interval_seconds": settings.prospeccion_atribucion_worker_interval_seconds},
    )
    recovery_interval_seconds = 300
    try:
        while not stop_event.is_set():
            jobs = await repo.worker_claim_prospeccion_campana_atribucion_jobs(
                limit=1, lease_seconds=300
            )
            for job in jobs:
                job_id = UUID(str(job["id"]))
                organizacion_id = UUID(str(job["organizacion_id"]))
                started = time.perf_counter()
                try:
                    # Un refresh global puede recorrer todo el histórico del
                    # tenant y alcanzar el timeout de PostgREST. Se convierte
                    # en trabajos por campaña, cada uno acotado por el mismo
                    # periodo y protegido por la idempotencia de la cola.
                    if not job.get("campana_id"):
                        campaign_ids = await repo.worker_list_campaign_ids(
                            organizacion_id=organizacion_id
                        )
                        for campaign_id in campaign_ids:
                            await repo.enqueue_prospeccion_campana_atribucion_job(
                                organizacion_id=organizacion_id,
                                date_from_iso=str(job["periodo_desde"]),
                                date_to_iso=str(job["periodo_hasta"]),
                                campana_id=campaign_id,
                            )
                        await repo.worker_finish_prospeccion_campana_atribution_job(
                            job_id=job_id, success=True
                        )
                        logger.info(
                            "prospeccion_atribucion_job.split",
                            extra={
                                "job_id": str(job_id),
                                "campaigns": len(campaign_ids),
                                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                            },
                        )
                        continue
                    await repo.refresh_prospeccion_campana_atribucion_cache(
                        organizacion_id=organizacion_id,
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

            # Drena trabajos que ya estaban pendientes antes de conectar el
            # listener. Las notificaciones despiertan trabajos nuevos, pero
            # no se vuelven a emitir para una cola que ya existía al arrancar.
            if jobs:
                continue

            try:
                await asyncio.wait_for(wakeup_event.wait(), timeout=recovery_interval_seconds)
                wakeup_event.clear()
            except asyncio.TimeoutError:
                # Recuperación ocasional ante pérdida de NOTIFY o reconexión
                # del listener; no es el mecanismo normal de ejecución.
                continue
    finally:
        listener_task.cancel()
        await asyncio.gather(listener_task, return_exceptions=True)
        logger.info("prospeccion_atribucion_worker.stopped")


def main() -> None:
    configure_logging(
        level=max(resolve_log_level(settings.log_level, default=logging.INFO), logging.INFO),
        log_file="/var/www/talia/logs/prospeccion-atribucion-worker.log",
    )
    asyncio.run(_run())


if __name__ == "__main__":
    main()
