"""Gestor de trabajos del Buscador con persistencia en Supabase."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services.buscador_runner import (
    BuscadorParams,
    BuscadorRunnerError,
    BuscadorRunResult,
    run_buscador,
)

logger = get_logger(__name__)


def _safe_uuid(value: Any) -> UUID | None:
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


@dataclass(slots=True)
class QueuedBuscadorJob:
    id: UUID
    organizacion_id: UUID | None
    params: BuscadorParams


class BuscadorJobManager:
    """Coordina trabajos y sincroniza su estado en Supabase."""

    def __init__(self) -> None:
        self._tasks: dict[UUID, asyncio.Task[None]] = {}

    def schedule_job(
        self,
        *,
        repo: CRMRepository,
        job_row: dict[str, Any],
        params: BuscadorParams,
    ) -> None:
        job_id = _safe_uuid(job_row.get("id"))
        if not job_id:
            logger.error("buscador.invalid_job_id", extra={"job_id": job_row.get("id")})
            return
        organizacion_id = _safe_uuid(job_row.get("organizacion_id"))
        job = QueuedBuscadorJob(id=job_id, organizacion_id=organizacion_id, params=params)
        task = asyncio.create_task(self._run_job(repo, job), name=f"buscador-job-{job_id}")
        self._tasks[job_id] = task
        task.add_done_callback(lambda _task, job_id=job_id: self._tasks.pop(job_id, None))

    async def _run_job(self, repo: CRMRepository, job: QueuedBuscadorJob) -> None:
        start_iso = datetime.now(timezone.utc).isoformat()
        try:
            await repo.worker_update_buscador_job(
                job_id=job.id,
                payload={"status": "running", "started_at": start_iso, "error": None},
            )
        except CRMRepositoryError as exc:  # pragma: no cover - red externa
            logger.exception("buscador.job_start_update_failed", extra={"job_id": str(job.id), "error": str(exc)})
            return

        try:
            result = await run_buscador(job.params)
        except BuscadorRunnerError as exc:
            await self._mark_job_failed(repo, job.id, str(exc))
            return
        except Exception as exc:  # pragma: no cover - error inesperado
            await self._mark_job_failed(repo, job.id, str(exc))
            return

        try:
            await self._store_results(repo, job, result)
        except CRMRepositoryError as exc:  # pragma: no cover - red externa
            await self._mark_job_failed(repo, job.id, f"store_results_failed:{exc}")
            return

        finish_iso = datetime.now(timezone.utc).isoformat()
        try:
            await repo.worker_update_buscador_job(
                job_id=job.id,
                payload={
                    "status": "completed",
                    "finished_at": finish_iso,
                    "duration_ms": result.duration_ms,
                    "total": len(result.results),
                    "stats": result.stats,
                },
            )
        except CRMRepositoryError as exc:  # pragma: no cover - red externa
            logger.exception(
                "buscador.job_complete_update_failed",
                extra={"job_id": str(job.id), "error": str(exc)},
            )

    async def _mark_job_failed(self, repo: CRMRepository, job_id: UUID, error: str) -> None:
        finish_iso = datetime.now(timezone.utc).isoformat()
        try:
            await repo.worker_update_buscador_job(
                job_id=job_id,
                payload={"status": "failed", "error": error, "finished_at": finish_iso},
            )
        except CRMRepositoryError:  # pragma: no cover - red externa
            logger.exception("buscador.job_fail_update_failed", extra={"job_id": str(job_id), "error": error})

    async def _store_results(
        self,
        repo: CRMRepository,
        job: QueuedBuscadorJob,
        result: BuscadorRunResult,
    ) -> None:
        rows: list[dict[str, Any]] = []
        for item in result.results:
            url_value = item.get("source_url") or ""
            rows.append(
                {
                    "job_id": str(job.id),
                    "organizacion_id": str(job.organizacion_id) if job.organizacion_id else None,
                    "url": url_value,
                    "dominio": _extract_domain(url_value),
                    "correo": item.get("email"),
                    "telefono": item.get("phone"),
                    "contacto": item,
                    "metadata": {},
                }
            )
        await repo.worker_replace_buscador_results(
            job_id=job.id,
            organizacion_id=job.organizacion_id,
            items=rows,
        )


def _extract_domain(url_value: str) -> str | None:
    if not url_value:
        return None
    host = urlparse(url_value).netloc
    return host.lower() if host else None


BUSCADOR_JOB_MANAGER = BuscadorJobManager()
