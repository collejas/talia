"""Background manager para búsquedas de Google Places."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import tenant_runtime
from app.services.google_places import GooglePlacesClient, GooglePlacesError, normalize_place_for_result

logger = get_logger(__name__)


@dataclass(slots=True)
class GoogleSearchJob:
    busqueda_id: UUID
    payload: dict[str, Any]
    meta: dict[str, Any]


class GoogleSearchJobManager:
    def __init__(self) -> None:
        self._tasks: dict[UUID, asyncio.Task[None]] = {}

    def schedule_job(self, *, repo: CRMRepository, job: GoogleSearchJob) -> None:
        if job.busqueda_id in self._tasks:
            return
        task = asyncio.create_task(self._run_job(repo, job), name=f"google-job-{job.busqueda_id}")
        self._tasks[job.busqueda_id] = task
        task.add_done_callback(lambda _task, job_id=job.busqueda_id: self._tasks.pop(job_id, None))

    async def _run_job(self, repo: CRMRepository, job: GoogleSearchJob) -> None:
        queue_meta = dict(job.meta)
        queue_meta["status"] = "running"
        try:
            await repo.worker_update_busqueda(busqueda_id=job.busqueda_id, payload={"meta": queue_meta})
        except CRMRepositoryError as exc:
            logger.exception("google_job_update_metadata_failed", extra={"busqueda_id": str(job.busqueda_id), "error": str(exc)})
        logger.info("google_job_meta", extra={"busqueda_id": str(job.busqueda_id), "meta": job.meta})
        organizacion_id_value = job.meta.get("organizacion_id")
        organizacion_id: UUID | None = None
        if isinstance(organizacion_id_value, str) and organizacion_id_value:
            try:
                organizacion_id = UUID(organizacion_id_value)
            except ValueError:
                logger.warning(
                    "google_job_invalid_org_id",
                    extra={"busqueda_id": str(job.busqueda_id), "organizacion_id": organizacion_id_value},
                )
        dense = bool(job.payload.get("dense_mode"))
        google_settings = await tenant_runtime.get_google_places_runtime_settings(
            organizacion_id=organizacion_id
        )
        grid_radius = (
            google_settings.dense_grid_max_tile_radius_m
            if dense
            else google_settings.grid_max_tile_radius_m
        )
        pause_between = (
            google_settings.dense_pause_between_pages
            if dense
            else google_settings.pause_between_pages
        )
        max_results = google_settings.dense_max_results if dense else None
        client = GooglePlacesClient(
            api_key=google_settings.api_key,
            nearby_url=google_settings.nearby_url,
            text_url=google_settings.text_url,
            field_mask=google_settings.field_mask,
            default_language=google_settings.language_code,
            default_region=google_settings.region_code,
            grid_max_tile_radius_m=grid_radius,
            pause_between_pages=pause_between,
            details_url=google_settings.details_url,
            details_concurrency=20,
        )
        try:
            places = await client.search_places(
                query=job.payload.get("query"),
                latitude=job.payload["lat"],
                longitude=job.payload["lng"],
                radius_m=job.payload["radio_m"],
                included_types=job.payload.get("included_types"),
                strategy=job.payload.get("strategy", "nearby"),
                language_code=job.payload.get("language_code"),
                region_code=job.payload.get("region_code"),
                max_results=max_results,
                enrich_details=False,
            )
        except GooglePlacesError as exc:
            await self._mark_failed(repo, job.busqueda_id, str(exc))
            return
        normalized_items = [normalize_place_for_result(place) for place in places]
        try:
            await repo.worker_upsert_resultados(
                payload={
                    "p_busqueda_id": str(job.busqueda_id),
                    "p_fuente": "google_places",
                    "p_items": normalized_items,
                    "p_organizacion_id": str(organizacion_id) if organizacion_id else None,
                },
                organizacion_id=organizacion_id,
            )
        except CRMRepositoryError as exc:
            logger.exception(
                "google_job_upsert_failed",
                extra={"busqueda_id": str(job.busqueda_id), "error": str(exc)},
            )
            await self._mark_failed(repo, job.busqueda_id, f"upsert_failed:{exc}")
            return
        completed_meta = dict(job.meta)
        completed_meta["status"] = "completed"
        updates: dict[str, Any] = {"meta": completed_meta, "total_encontrados": len(normalized_items)}
        try:
            await repo.worker_update_busqueda(busqueda_id=job.busqueda_id, payload=updates)
        except CRMRepositoryError as exc:
            logger.exception("google_job_update_final_failed", extra={"busqueda_id": str(job.busqueda_id), "error": str(exc)})

    async def _mark_failed(self, repo: CRMRepository, busqueda_id: UUID, error: str) -> None:
        failed_meta = {"status": "failed", "error": error}
        try:
            await repo.worker_update_busqueda(
                busqueda_id=busqueda_id,
                payload={"meta": failed_meta, "total_encontrados": 0},
            )
        except CRMRepositoryError:
            logger.exception("google_job_fail_update_failed", extra={"busqueda_id": str(busqueda_id), "error": error})


GOOGLE_SEARCH_JOB_MANAGER = GoogleSearchJobManager()
