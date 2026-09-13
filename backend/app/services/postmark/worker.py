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

from .repository import PostmarkRepository, PostmarkRepositoryError
from .provisioning import PostmarkProvisioningError, PostmarkProvisioningService
from .service import PostmarkService

logger = logging.getLogger(__name__)


class PostmarkWorker:
    """Procesa únicamente mensajes de tenants con Postmark habilitado."""

    def __init__(self, *, interval_seconds: float = 10.0, batch_size: int = 25) -> None:
        self.interval_seconds = max(interval_seconds, 1.0)
        self.batch_size = max(min(batch_size, 500), 1)
        self._task: asyncio.Task[None] | None = None
        self._stop_event = asyncio.Event()

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
            for row in claimed:
                message_id = row.get("message_id")
                if not message_id:
                    continue
                try:
                    message_uuid = UUID(str(message_id))
                    idempotency_key = await repository.get_message_idempotency_key(message_id=message_uuid)
                    envio_id = self._prospeccion_envio_id(idempotency_key)
                    if envio_id:
                        reservation = await CRMRepository().worker_reserve_envio_dispatch(envio_id=envio_id)
                        if not reservation.get("permitido"):
                            await repository.defer_message(message_id=message_uuid)
                            continue

                    delivery = await service.deliver_queued_message(
                        organizacion_id=organizacion_id,
                        message_id=message_uuid,
                        client=client,
                    )
                    if envio_id:
                        crm_repo = CRMRepository()
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
                    processed += 1
                except (PostmarkError, PostmarkRepositoryError, CRMRepositoryError, ValueError) as exc:
                    logger.exception(
                        "postmark.worker_message_failed",
                        extra={
                            "organizacion_id": str(organizacion_id),
                            "message_id": str(message_id),
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


postmark_worker = PostmarkWorker()

__all__ = ["PostmarkWorker", "postmark_worker"]
