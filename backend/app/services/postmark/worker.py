"""Worker aislado para entregar mensajes encolados de Postmark."""

from __future__ import annotations

import asyncio
import logging

from app.integrations.postmark.client import PostmarkClient
from app.integrations.postmark.errors import PostmarkError

from .repository import PostmarkRepository, PostmarkRepositoryError
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
        client = PostmarkClient()
        processed = 0
        for organizacion_id in await repository.list_enabled_organizations():
            claimed = await repository.claim_messages(
                organizacion_id=organizacion_id,
                limit=self.batch_size,
            )
            for row in claimed:
                message_id = row.get("message_id")
                if not message_id:
                    continue
                try:
                    await service.deliver_queued_message(
                        organizacion_id=organizacion_id,
                        message_id=message_id,
                        client=client,
                    )
                    processed += 1
                except (PostmarkError, PostmarkRepositoryError) as exc:
                    logger.exception(
                        "postmark.worker_message_failed",
                        extra={
                            "organizacion_id": str(organizacion_id),
                            "message_id": str(message_id),
                            "error": str(exc),
                        },
                    )
        return processed

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
