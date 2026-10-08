"""Preparador independiente de campañas Postmark.

Este proceso prepara la cola de prospección y materializa bloques homogéneos
de hasta 500 mensajes. No llama a Postmark ni procesa Brevo/WhatsApp; la
entrega queda exclusivamente en ``talia-email-worker.service``.
"""

from __future__ import annotations

import asyncio
import logging
import signal
from uuid import UUID

from app.core.config import settings
from app.core.logging import configure_logging, resolve_log_level
from app.repositories.crm import CRMRepository
from app.services.postmark.repository import PostmarkRepository, PostmarkRepositoryError
from app.services.prospeccion_contact_sender import ProspeccionContactSender

logger = logging.getLogger("app.workers.postmark_preparer")


class PostmarkCampaignTargetPreparationWorker:
    """Convierte el manifiesto durable en envíos operativos por bloques de 500.

    Aquí no se llama a Postmark. La única responsabilidad es materializar el
    snapshot local; ``ProspeccionContactSender`` y ``PostmarkWorker`` siguen
    siendo los únicos procesos que encolan y entregan respectivamente.
    """

    def __init__(self, *, batch_size: int = 500) -> None:
        self.batch_size = max(1, min(int(batch_size), 500))

    async def run_once(self) -> int:
        repository = CRMRepository()
        prepared = 0
        for job in await repository.worker_claim_postmark_preparation_jobs(limit=5):
            try:
                organizacion_id = UUID(str(job["organizacion_id"]))
                batch_id = UUID(str(job["batch_id"]))
                job_id = UUID(str(job["id"]))
                manifest = job.get("manifest")
                if not isinstance(manifest, list) or not manifest:
                    raise ValueError("postmark_preparation_manifest_invalid")
                await repository.worker_materialize_postmark_campaign_targets(
                    organizacion_id=organizacion_id,
                    batch_id=batch_id,
                    manifest=[row for row in manifest if isinstance(row, dict)],
                )
                await repository.worker_initialize_postmark_preparation(
                    organizacion_id=organizacion_id,
                    batch_id=batch_id,
                    total=len(manifest),
                )
                await repository.worker_finish_postmark_preparation_job(
                    job_id=job_id, success=True
                )
                logger.info(
                    "postmark.preparation_manifest_materialized",
                    extra={"organizacion_id": str(organizacion_id), "batch_id": str(batch_id), "target_count": len(manifest)},
                )
            except Exception as exc:
                try:
                    await repository.worker_finish_postmark_preparation_job(
                        job_id=UUID(str(job.get("id"))), success=False, error=str(exc)
                    )
                except Exception:
                    logger.exception("postmark.preparation_manifest_finish_failed", extra={"job_id": str(job.get("id"))})
                logger.exception("postmark.preparation_manifest_failed", extra={"job_id": str(job.get("id"))})
        for batch in await repository.worker_list_postmark_campaign_batches(limit=20):
            try:
                organizacion_id = UUID(str(batch["organizacion_id"]))
                batch_id = UUID(str(batch["id"]))
            except (KeyError, TypeError, ValueError):
                continue
            targets = await repository.worker_claim_postmark_campaign_targets(
                organizacion_id=organizacion_id,
                batch_id=batch_id,
                limit=self.batch_size,
            )
            if not targets:
                if int(batch.get("preparacion_total") or 0) <= 0:
                    # El manifiesto todavía no fue materializado. No debemos
                    # sincronizarlo como completado con cero destinatarios.
                    continue
                await repository.worker_sync_postmark_campaign_preparation(
                    organizacion_id=organizacion_id,
                    batch_id=batch_id,
                )
                continue

            entries: list[dict[str, object]] = []
            target_ids: list[UUID] = []
            for target in targets:
                try:
                    target_id = UUID(str(target["id"]))
                    target_ids.append(target_id)
                except (KeyError, TypeError, ValueError):
                    continue
                entries.append(
                    {
                        "batch_id": str(batch_id),
                        "prospecto_id": str(target["prospecto_id"]),
                        "organizacion_id": str(organizacion_id),
                        "canal": "correo",
                        "numero_lote": int(target.get("numero_lote") or 1),
                        "lote_programado_en": target.get("lote_programado_en"),
                        "programado_en": target.get("programado_en"),
                        "plantilla_id": target.get("plantilla_id"),
                        "version_id": target.get("version_id"),
                        "payload": target.get("payload") if isinstance(target.get("payload"), dict) else {},
                        "detalle": target.get("detalle") if isinstance(target.get("detalle"), dict) else {},
                    }
                )

            try:
                await repository.worker_insert_contact_envios(
                    organizacion_id=organizacion_id,
                    entries=entries,
                )
                await repository.worker_finish_postmark_campaign_targets(
                    organizacion_id=organizacion_id,
                    batch_id=batch_id,
                    target_ids=target_ids,
                    success=True,
                )
                prepared += len(entries)
                logger.info(
                    "postmark.campaign_targets_prepared",
                    extra={
                        "organizacion_id": str(organizacion_id),
                        "source_batch_id": str(batch_id),
                        "target_count": len(entries),
                    },
                )
            except Exception as exc:
                await repository.worker_finish_postmark_campaign_targets(
                    organizacion_id=organizacion_id,
                    batch_id=batch_id,
                    target_ids=target_ids,
                    success=False,
                    error=str(exc),
                )
                logger.exception(
                    "postmark.campaign_targets_prepare_failed",
                    extra={
                        "organizacion_id": str(organizacion_id),
                        "source_batch_id": str(batch_id),
                        "target_count": len(targets),
                    },
                )
            await repository.worker_sync_postmark_campaign_preparation(
                organizacion_id=organizacion_id,
                batch_id=batch_id,
            )
        return prepared


class PostmarkPreparationWorker:
    def __init__(self, *, interval_seconds: float = 5.0) -> None:
        self.interval_seconds = max(float(interval_seconds), 1.0)
        self.campaign_target_preparer = PostmarkCampaignTargetPreparationWorker(batch_size=500)
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

    async def run_once(self) -> int:
        repository = PostmarkRepository()
        prepared = await self.campaign_target_preparer.run_once()
        for organizacion_id in await repository.list_enabled_organizations():
            for source_batch_id in await repository.list_queued_source_batches(
                organizacion_id=organizacion_id
            ):
                source_batch = await repository.get_contact_batch(batch_id=source_batch_id)
                if not source_batch:
                    continue
                preparation_state = source_batch.get("preparacion_estado")
                if preparation_state not in (None, "no_requerida", "completada"):
                    continue
                if preparation_state != "completada" and source_batch.get("estado") != "completado":
                    continue
                blocks = await repository.prepare_delivery_batches(
                    organizacion_id=organizacion_id,
                    source_batch_id=source_batch_id,
                    max_messages=500,
                )
                if blocks:
                    prepared += len(blocks)
                    logger.info(
                        "postmark.preparation_ready",
                        extra={
                            "organizacion_id": str(organizacion_id),
                            "source_batch_id": str(source_batch_id),
                            "blocks": len(blocks),
                            "message_count": sum(
                                int(block.get("message_count") or 0) for block in blocks
                            ),
                        },
                    )
        return prepared

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stop = asyncio.Event()
        self._task = asyncio.create_task(self._run_loop(), name="postmark-preparer")
        logger.info(
            "postmark.preparer_started",
            extra={
                "interval_seconds": self.interval_seconds,
                "max_concurrency": settings.postmark_preparer_max_concurrency,
            },
        )

    async def shutdown(self) -> None:
        self._stop.set()
        if self._task:
            await self._task
            self._task = None

    async def _run_loop(self) -> None:
        while not self._stop.is_set():
            try:
                await self.run_once()
            except (PostmarkRepositoryError, ValueError) as exc:
                logger.warning("postmark.preparer_cycle_failed", extra={"error": str(exc)})
            except Exception as exc:  # pragma: no cover - protección del proceso
                logger.exception("postmark.preparer_cycle_unexpected", extra={"error": str(exc)})
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.interval_seconds)
            except asyncio.TimeoutError:
                pass


async def _run() -> None:
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(signum, stop_event.set)

    sender = ProspeccionContactSender(
        batch_size=settings.postmark_prospeccion_batch_size,
        max_concurrency=settings.postmark_preparer_max_concurrency,
        per_minute_limit=settings.postmark_prospeccion_per_minute_limit,
        channels=("correo",),
        provider="postmark",
    )
    preparer = PostmarkPreparationWorker(
        interval_seconds=settings.postmark_preparer_poll_interval_seconds,
    )
    if settings.postmark_worker_enabled:
        await sender.start()
        await preparer.start()
    else:
        logger.warning("postmark.preparer_disabled", extra={"reason": "postmark_worker_disabled"})
    try:
        await stop_event.wait()
    finally:
        await preparer.shutdown()
        await sender.shutdown()
        logger.info("postmark.preparer_stopped")


def main() -> None:
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    configure_logging(
        level=min(resolve_log_level(settings.log_level, default=logging.INFO), logging.INFO),
        log_file="/var/www/talia/logs/postmark-preparer.log",
    )
    asyncio.run(_run())


if __name__ == "__main__":
    main()
