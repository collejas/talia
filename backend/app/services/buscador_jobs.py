"""Gestor de trabajos del Buscador ejecutados en segundo plano."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from app.core.config import settings
from app.core.logging import get_logger
from app.services.buscador_runner import (
    BuscadorParams,
    BuscadorRunnerError,
    BuscadorRunResult,
    run_buscador,
)

logger = get_logger(__name__)


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc)


@dataclass(slots=True)
class BuscadorJob:
    id: UUID
    params: BuscadorParams
    status: str = "pending"
    created_at: datetime = field(default_factory=_utc_now)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_ms: int | None = None
    total: int | None = None
    stats: dict[str, Any] | None = None
    result_path: str | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "duration_ms": self.duration_ms,
            "total": self.total,
            "stats": self.stats,
            "error": self.error,
            "result_path": self.result_path,
            "params": {
                "sitio": self.params.sitio,
                "url": self.params.url,
                "mode": self.params.mode,
                "max_pages": self.params.max_pages,
                "max_depth": self.params.max_depth,
                "max_runtime": self.params.max_runtime,
                "max_queue_size": self.params.max_queue_size,
                "max_no_new_emails": self.params.max_no_new_emails,
                "max_memory_mb": self.params.max_memory_mb,
            },
        }


class BuscadorJobManager:
    """Coordina trabajos en background y almacena los resultados en disco."""

    def __init__(self, results_dir: Path):
        self._jobs: dict[UUID, BuscadorJob] = {}
        self._results_dir = results_dir
        self._results_dir.mkdir(parents=True, exist_ok=True)

    def list_jobs(self, limit: int = 50) -> list[BuscadorJob]:
        jobs = sorted(self._jobs.values(), key=lambda job: job.created_at, reverse=True)
        return jobs[:limit]

    def get_job(self, job_id: UUID) -> BuscadorJob | None:
        return self._jobs.get(job_id)

    def schedule_job(self, params: BuscadorParams) -> BuscadorJob:
        job = BuscadorJob(id=uuid4(), params=params)
        self._jobs[job.id] = job
        asyncio.create_task(self._run_job(job))
        return job

    async def _run_job(self, job: BuscadorJob) -> None:
        job.status = "running"
        job.started_at = _utc_now()
        try:
            result: BuscadorRunResult = await run_buscador(job.params)
            job.duration_ms = result.duration_ms
            job.total = len(result.results)
            job.stats = result.stats
            result_path = self._results_dir / f"{job.id}.json"
            with result_path.open("w", encoding="utf-8") as fh:
                json.dump(result.results, fh, ensure_ascii=False, indent=2)
            job.result_path = str(result_path)
            job.status = "completed"
        except BuscadorRunnerError as exc:
            job.status = "failed"
            job.error = str(exc)
            logger.warning("buscador.job_failed", extra={"job_id": str(job.id), "error": str(exc)})
        except Exception as exc:  # pragma: no cover - excepción inesperada
            job.status = "failed"
            job.error = str(exc)
            logger.exception("buscador.job_crashed", extra={"job_id": str(job.id)})
        finally:
            job.finished_at = _utc_now()

    def read_results(self, job: BuscadorJob) -> list[dict[str, Any]] | None:
        if not job.result_path:
            return None
        path = Path(job.result_path)
        if not path.exists():
            return None
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)


RESULTS_DIR = Path(settings.log_file_path).parent / "buscador_jobs"
BUSCADOR_JOB_MANAGER = BuscadorJobManager(RESULTS_DIR)
