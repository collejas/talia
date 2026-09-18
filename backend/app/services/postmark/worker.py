"""Worker aislado para entregar mensajes encolados de Postmark."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.integrations.postmark.client import PostmarkClient
from app.integrations.postmark.errors import PostmarkError
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services.tenant_runtime import get_secret_plaintext
from app.core.config import settings

from .repository import PostmarkRepository, PostmarkRepositoryError
from .provisioning import PostmarkProvisioningError, PostmarkProvisioningService
from .service import PostmarkService
from .synchronization import synchronize_hard_bounces, synchronize_outbound_messages

logger = logging.getLogger(__name__)


class PostmarkWorker:
    """Procesa únicamente mensajes de tenants con Postmark habilitado."""

    def __init__(self, *, interval_seconds: float = 10.0, batch_size: int = 500) -> None:
        self.interval_seconds = max(interval_seconds, 1.0)
        self.batch_size = max(min(batch_size, 500), 1)
        self._task: asyncio.Task[None] | None = None
        self._stop_event = asyncio.Event()
        self._last_sync_at: datetime | None = None

    async def run_once(self) -> int:
        repository = PostmarkRepository()
        service = PostmarkService(repository=repository)
        processed = await self._process_provision_jobs(repository)
        for organizacion_id in await repository.list_enabled_organizations():
            server = await repository.get_server(organizacion_id=organizacion_id)
            if not server or server.get("server_status") != "active":
                logger.warning(
                    "postmark.worker_tenant_server_not_ready",
                    extra={"organizacion_id": str(organizacion_id)},
                )
                continue
            try:
                await PostmarkProvisioningService(repository=repository).ensure_webhooks(
                    organizacion_id=organizacion_id, server=server
                )
            except (PostmarkError, PostmarkProvisioningError, PostmarkRepositoryError) as exc:
                logger.error(
                    "postmark.worker_webhooks_not_ready",
                    extra={"organizacion_id": str(organizacion_id), "error": str(exc)},
                )
                continue
            token = await get_secret_plaintext(
                organizacion_id=organizacion_id,
                clave=str(server.get("server_token_secret_key") or "postmark.server_token"),
            )
            if not token:
                logger.error(
                    "postmark.worker_tenant_server_token_missing",
                    extra={"organizacion_id": str(organizacion_id)},
                )
                continue
            client = PostmarkClient(
                server_token=token,
                transactional_stream=str(server.get("transactional_stream") or "outbound"),
                broadcast_stream=str(server.get("broadcast_stream") or "broadcast"),
            )
            claimed = await repository.claim_messages(
                organizacion_id=organizacion_id,
                limit=self.batch_size,
            )
            if claimed:
                try:
                    deliveries = await service.deliver_claimed_batch(
                        organizacion_id=organizacion_id,
                        claimed_rows=claimed,
                        client=client,
                        inter_batch_seconds=settings.postmark_worker_inter_batch_seconds,
                    )
                    crm_repo = CRMRepository()
                    for delivery in deliveries:
                        message_id = delivery.get("message_id")
                        if not message_id:
                            continue
                        idempotency_key = await repository.get_message_idempotency_key(
                            message_id=UUID(str(message_id))
                        )
                        envio_id = self._prospeccion_envio_id(idempotency_key)
                        if not envio_id:
                            continue
                        if delivery.get("provider_accepted") and delivery.get("provider_message_id"):
                            await crm_repo.worker_complete_envio(
                                envio_id=envio_id,
                                payload={
                                    "mensaje_id": delivery["provider_message_id"],
                                    "proveedor_aceptado_en": datetime.now(timezone.utc).isoformat(),
                                },
                            )
                        elif not delivery.get("provider_accepted"):
                            await crm_repo.worker_complete_envio(
                                envio_id=envio_id,
                                payload={
                                    "estado": "error",
                                    "error": "postmark_provider_rejected",
                                    "procesado_en": datetime.now(timezone.utc).isoformat(),
                                },
                            )
                    processed += len(deliveries)
                except (PostmarkError, PostmarkRepositoryError, CRMRepositoryError, ValueError) as exc:
                    logger.exception(
                        "postmark.worker_batch_failed",
                        extra={"organizacion_id": str(organizacion_id), "batch_size": len(claimed), "error": str(exc)},
                    )
        if settings.postmark_sync_enabled and self._sync_is_due():
            processed += await self._synchronize_history(repository)
        return processed

    def _sync_is_due(self) -> bool:
        if self._last_sync_at is None:
            return True
        elapsed = datetime.now(timezone.utc) - self._last_sync_at
        return elapsed.total_seconds() >= settings.postmark_sync_interval_seconds

    async def _synchronize_history(self, repository: PostmarkRepository) -> int:
        """Procesa una página por stream y tenant; nunca purga datos locales."""
        self._last_sync_at = datetime.now(timezone.utc)
        processed = 0
        now = datetime.now(timezone.utc)
        # Postmark recibe filtros de fecha, no timestamps. Usar la fecha del
        # día hace estable la ventana durante el ciclo y permite reanudar el
        # offset sin reiniciarlo por cada segundo que pasa.
        from_date = (now - timedelta(days=45)).date().isoformat()
        to_date = now.date().isoformat()
        for organizacion_id in await repository.list_enabled_organizations():
            server = await repository.get_server(organizacion_id=organizacion_id)
            if not server or server.get("server_status") != "active":
                continue
            server_id = UUID(str(server["id"]))
            for message_stream in ("outbound", "broadcast"):
                checkpoint = await repository.claim_sync_checkpoint(
                    organizacion_id=organizacion_id,
                    server_id=server_id,
                    sync_type="messages",
                    message_stream=message_stream,
                    window_from=from_date,
                    window_to=to_date,
                )
                if not checkpoint:
                    continue
                offset = 0
                if checkpoint:
                    provider_total = int(checkpoint.get("last_provider_total") or 0)
                    next_offset = int(checkpoint.get("next_offset") or 0)
                    if checkpoint.get("last_provider_total") is not None and next_offset >= provider_total:
                        await repository.upsert_sync_checkpoint(
                            payload={
                                "organizacion_id": str(organizacion_id),
                                "server_id": str(server_id),
                                "sync_type": "messages",
                                "message_stream": message_stream,
                                "window_from": from_date,
                                "window_to": to_date,
                                "next_offset": next_offset,
                                "last_provider_total": provider_total,
                                "last_success_at": checkpoint.get("last_success_at"),
                                "locked_at": None,
                            }
                        )
                        continue
                    if next_offset < provider_total:
                        offset = next_offset
                try:
                    result = await asyncio.wait_for(
                        synchronize_outbound_messages(
                            repository=repository,
                            organizacion_id=organizacion_id,
                            from_date=from_date,
                            to_date=to_date,
                            message_stream=message_stream,
                            count=settings.postmark_sync_page_size,
                            offset=offset,
                        ),
                        timeout=settings.postmark_sync_page_timeout_seconds,
                    )
                    processed += int(result.get("provider_messages") or 0)
                except (PostmarkError, PostmarkRepositoryError, RuntimeError, ValueError) as exc:
                    logger.error(
                        "postmark.worker_history_sync_failed",
                        extra={"organizacion_id": str(organizacion_id), "stream": message_stream, "error": str(exc)},
                    )
            for message_stream in ("outbound", "broadcast"):
                for bounce_type in ("HardBounce", "SpamComplaint", "Unsubscribe"):
                    bounce_checkpoint = await repository.claim_sync_checkpoint(
                        organizacion_id=organizacion_id,
                        server_id=server_id,
                        sync_type="bounces",
                        message_stream=message_stream,
                        window_from=from_date,
                        window_to=to_date,
                        provider_filter=bounce_type,
                    )
                    if not bounce_checkpoint:
                        continue
                    provider_total = int(bounce_checkpoint.get("last_provider_total") or 0)
                    offset = int(bounce_checkpoint.get("next_offset") or 0)
                    if bounce_checkpoint.get("last_provider_total") is not None and offset >= provider_total:
                        await repository.upsert_sync_checkpoint(
                            payload={
                                "organizacion_id": str(organizacion_id),
                                "server_id": str(server_id),
                                "sync_type": "bounces",
                                "message_stream": message_stream,
                                "provider_filter": bounce_type,
                                "window_from": from_date,
                                "window_to": to_date,
                                "next_offset": offset,
                                "last_provider_total": provider_total,
                                "last_success_at": bounce_checkpoint.get("last_success_at"),
                                "locked_at": None,
                            }
                        )
                        continue
                    try:
                        bounce_result = await synchronize_hard_bounces(
                            repository=repository,
                            organizacion_id=organizacion_id,
                            from_date=from_date,
                            to_date=to_date,
                            message_stream=message_stream,
                            count=settings.postmark_sync_page_size,
                            offset=offset,
                            single_page=True,
                            bounce_type=bounce_type,
                        )
                        processed += int(bounce_result.get("imported") or 0)
                    except (PostmarkError, PostmarkRepositoryError, RuntimeError, ValueError) as exc:
                        logger.error(
                            "postmark.worker_bounce_sync_failed",
                            extra={
                                "organizacion_id": str(organizacion_id),
                                "stream": message_stream,
                                "bounce_type": bounce_type,
                                "error": str(exc),
                            },
                        )
        return processed

    async def _process_provision_jobs(self, repository: PostmarkRepository) -> int:
        """Procesa provisiones externas fuera de la transacción comercial."""
        jobs = await repository.claim_server_provision_jobs(limit=10)
        processed = 0
        provisioning = PostmarkProvisioningService(repository=repository)
        for job in jobs:
            try:
                job_id = UUID(str(job["id"]))
                organizacion_id = UUID(str(job["organizacion_id"]))
                server = await repository.get_server(organizacion_id=organizacion_id)
                server_name = str((server or {}).get("server_name") or f"Talia - {organizacion_id}")
                await provisioning.provision_tenant_server(
                    organizacion_id=organizacion_id,
                    server_name=server_name,
                )
                await repository.update_server_provision_job(
                    job_id=job_id,
                    payload={
                        "status": "completed",
                        "completed_at": datetime.now(timezone.utc).isoformat(),
                        "locked_at": None,
                        "last_error": None,
                    },
                )
                processed += 1
            except (PostmarkError, PostmarkProvisioningError, PostmarkRepositoryError, ValueError) as exc:
                attempts = int(job.get("attempts") or 1)
                retry = attempts < 5
                try:
                    await repository.update_server_provision_job(
                        job_id=UUID(str(job["id"])),
                        payload={
                            "status": "queued" if retry else "failed",
                            "available_at": (
                                datetime.now(timezone.utc) + timedelta(minutes=min(attempts * 5, 60))
                            ).isoformat(),
                            "locked_at": None,
                            "last_error": str(exc)[:500],
                        },
                    )
                except PostmarkRepositoryError:
                    logger.exception("postmark.worker_provision_job_update_failed")
                logger.exception(
                    "postmark.worker_provision_job_failed",
                    extra={"organizacion_id": str(job.get("organizacion_id")), "attempts": attempts},
                )
        return processed

    @staticmethod
    def _prospeccion_envio_id(idempotency_key: str | None) -> UUID | None:
        prefix = "prospeccion-envio:"
        if not idempotency_key or not idempotency_key.startswith(prefix):
            return None
        try:
            return UUID(idempotency_key[len(prefix) :])
        except ValueError:
            return None

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stop_event = asyncio.Event()
        self._task = asyncio.create_task(self._run_loop(), name="postmark-worker")

    async def shutdown(self) -> None:
        self._stop_event.set()
        if self._task:
            await self._task
            self._task = None

    async def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self.run_once()
            except (PostmarkError, PostmarkRepositoryError) as exc:
                logger.exception("postmark.worker_cycle_failed", extra={"error": str(exc)})
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self.interval_seconds)
            except asyncio.TimeoutError:
                continue


postmark_worker = PostmarkWorker(
    batch_size=settings.postmark_worker_batch_size,
)

__all__ = ["PostmarkWorker", "postmark_worker"]
