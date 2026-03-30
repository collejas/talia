"""Gestor de trabajos del Buscador con persistencia en Supabase."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import urlparse
from uuid import UUID

from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services.buscador_control import BuscadorJobControl
from app.services.buscador_runner import (
    BuscadorParams,
    BuscadorRunnerError,
    BuscadorRunResult,
    run_buscador,
)
from app.services.ui_realtime_hub import prospectos_topic_for_org, ui_realtime_hub

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
    metadata: dict[str, Any]


@dataclass(slots=True)
class ManagedBuscadorJob:
    task: asyncio.Task[None]
    control: BuscadorJobControl


class BuscadorJobManager:
    """Coordina trabajos y sincroniza su estado en Supabase."""

    def __init__(self) -> None:
        self._jobs: dict[UUID, ManagedBuscadorJob] = {}

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
        metadata = job_row.get("metadata") if isinstance(job_row.get("metadata"), dict) else {}
        job = QueuedBuscadorJob(
            id=job_id,
            organizacion_id=organizacion_id,
            params=params,
            metadata=metadata,
        )
        control = BuscadorJobControl()
        task = asyncio.create_task(self._run_job(repo, job, control), name=f"buscador-job-{job_id}")
        self._jobs[job_id] = ManagedBuscadorJob(task=task, control=control)
        task.add_done_callback(lambda _task, job_id=job_id: self._jobs.pop(job_id, None))

    def request_pause(self, job_id: UUID) -> bool:
        """Intenta pausar el job. Devuelve False si ya se completó."""

        return self._request_stop(job_id, action="pause")

    def request_cancel(self, job_id: UUID) -> bool:
        """Intenta cancelar completamente el job."""

        return self._request_stop(job_id, action="cancel")

    def _request_stop(self, job_id: UUID, *, action: Literal["pause", "cancel"]) -> bool:
        handle = self._jobs.get(job_id)
        if not handle:
            return False
        if handle.task.done():
            return False
        if action == "pause":
            handle.control.request_pause()
        else:
            handle.control.request_cancel()
        return True

    async def _run_job(
        self,
        repo: CRMRepository,
        job: QueuedBuscadorJob,
        control: BuscadorJobControl,
    ) -> None:
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
            result = await run_buscador(job.params, control=control)
        except BuscadorRunnerError as exc:
            await self._mark_job_failed(repo, job, str(exc))
            return
        except Exception as exc:  # pragma: no cover - error inesperado
            await self._mark_job_failed(repo, job, str(exc))
            return

        try:
            await self._store_results(repo, job, result)
        except CRMRepositoryError as exc:  # pragma: no cover - red externa
            await self._mark_job_failed(repo, job, f"store_results_failed:{exc}")
            return

        finish_iso = datetime.now(timezone.utc).isoformat()
        stop_reason = result.stop_reason or control.stop_reason
        final_status = "completed"
        if stop_reason == "paused":
            final_status = "paused"
        elif stop_reason == "canceled":
            final_status = "canceled"
        try:
            await repo.worker_update_buscador_job(
                job_id=job.id,
                payload={
                    "status": final_status,
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
        await self._publish_job_event(job=job, status=final_status, result=result)

    async def _mark_job_failed(self, repo: CRMRepository, job: QueuedBuscadorJob, error: str) -> None:
        finish_iso = datetime.now(timezone.utc).isoformat()
        try:
            await repo.worker_update_buscador_job(
                job_id=job.id,
                payload={"status": "failed", "error": error, "finished_at": finish_iso},
            )
        except CRMRepositoryError:  # pragma: no cover - red externa
            logger.exception("buscador.job_fail_update_failed", extra={"job_id": str(job.id), "error": error})
        await self._publish_job_event(job=job, status="failed", error=error)

    async def _publish_job_event(
        self,
        *,
        job: QueuedBuscadorJob,
        status: str,
        result: BuscadorRunResult | None = None,
        error: str | None = None,
    ) -> None:
        if not job.organizacion_id:
            return
        fuente = str(job.metadata.get("fuente") or "").strip().lower()
        if fuente != "checklist_scraper":
            return
        payload: dict[str, Any] = {
            "job_id": str(job.id),
            "status": status,
            "prospecto_id": str(job.metadata.get("prospecto_id") or "").strip() or None,
            "emails_total": len(result.results) if result is not None else 0,
        }
        if error:
            payload["error"] = error
        await ui_realtime_hub.publish(
            prospectos_topic_for_org(organizacion_id=str(job.organizacion_id)),
            {
                "type": "prospectos_checklist_scraper_finished",
                "scope": "prospeccion_prospectos",
                "organizacion_id": str(job.organizacion_id),
                "at": datetime.now(timezone.utc).isoformat(),
                "payload": payload,
            },
        )

    async def _store_results(
        self,
        repo: CRMRepository,
        job: QueuedBuscadorJob,
        result: BuscadorRunResult,
    ) -> None:
        rows: list[dict[str, Any]] = []
        for item in result.results:
            url_value = item.get("source_url") or ""
            email_value = item.get("email")
            contact_payload = {
                "source_url": url_value,
                "email": email_value,
            }
            rows.append(
                {
                    "job_id": str(job.id),
                    "organizacion_id": str(job.organizacion_id) if job.organizacion_id else None,
                    "url": url_value,
                    "dominio": _extract_domain(url_value),
                    "correo": email_value,
                    "telefono": None,
                    "contacto": contact_payload,
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
