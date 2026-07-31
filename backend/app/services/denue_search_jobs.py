"""Background manager para búsquedas DENUE con persistencia en Supabase."""

from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import tenant_runtime
from app.services.denue import (
    DenueClient,
    DenueError,
    expand_denue_activity_codes,
    expand_state_to_municipalities,
    expand_targets_for_area_act,
    normalize_denue_place,
)

logger = get_logger(__name__)
search_logger = get_logger("app.prospeccion.busquedas")


@dataclass(slots=True)
class DenueSearchJob:
    job_id: UUID
    busqueda_id: UUID
    organizacion_id: UUID | None
    payload: dict[str, Any]


class _DenueJobControl:
    def __init__(self) -> None:
        self._cancel_requested = False

    def request_cancel(self) -> None:
        self._cancel_requested = True

    @property
    def cancel_requested(self) -> bool:
        return self._cancel_requested


class DenueSearchJobManager:
    def __init__(self) -> None:
        self._tasks: dict[UUID, asyncio.Task[None]] = {}
        self._controls: dict[UUID, _DenueJobControl] = {}
        self._semaphore = asyncio.Semaphore(1)

    def schedule_job(self, *, repo: CRMRepository, job: DenueSearchJob) -> None:
        if job.job_id in self._tasks:
            return
        control = _DenueJobControl()
        task = asyncio.create_task(self._run_job(repo, job, control), name=f"denue-job-{job.job_id}")
        self._tasks[job.job_id] = task
        self._controls[job.job_id] = control
        task.add_done_callback(lambda _task, job_id=job.job_id: self._finalize(job_id))

    def request_cancel(self, job_id: UUID) -> bool:
        control = self._controls.get(job_id)
        if not control:
            return False
        control.request_cancel()
        return True

    def _finalize(self, job_id: UUID) -> None:
        self._tasks.pop(job_id, None)
        self._controls.pop(job_id, None)

    async def _run_job(self, repo: CRMRepository, job: DenueSearchJob, control: _DenueJobControl) -> None:
        async with self._semaphore:
            start_time = datetime.now(timezone.utc)
            start_iso = start_time.isoformat()
            try:
                await repo.worker_update_denue_job(
                    job_id=job.job_id,
                    payload={"status": "running", "started_at": start_iso, "error": None},
                )
                await self._patch_busqueda_meta(
                    repo,
                    busqueda_id=job.busqueda_id,
                    patch={"status": "running", "denue_job_id": str(job.job_id)},
                )
            except CRMRepositoryError as exc:  # pragma: no cover
                logger.exception("denue_job_start_update_failed", extra={"job_id": str(job.job_id), "error": str(exc)})
                return

            try:
                await self._execute(repo, job, control)
            except DenueError as exc:
                await self._mark_failed(repo, job, str(exc))
                return
            except CRMRepositoryError as exc:  # pragma: no cover
                await self._mark_failed(repo, job, f"supabase_error:{exc}")
                return
            except Exception as exc:  # pragma: no cover
                await self._mark_failed(repo, job, str(exc))
                return

            finish_time = datetime.now(timezone.utc)
            duration_ms = int((finish_time - start_time).total_seconds() * 1000)
            finish_iso = finish_time.isoformat()
            final_status = "completed"
            if control.cancel_requested:
                final_status = "canceled"
            try:
                await repo.worker_update_denue_job(
                    job_id=job.job_id,
                    payload={
                        "status": final_status,
                        "finished_at": finish_iso,
                        "duration_ms": duration_ms,
                    },
                )
                await self._patch_busqueda_meta(
                    repo,
                    busqueda_id=job.busqueda_id,
                    patch={"status": final_status, "denue_job_id": str(job.job_id)},
                )
            except CRMRepositoryError as exc:  # pragma: no cover
                logger.exception("denue_job_complete_update_failed", extra={"job_id": str(job.job_id), "error": str(exc)})

    async def _mark_failed(self, repo: CRMRepository, job: DenueSearchJob, error: str) -> None:
        finish_iso = datetime.now(timezone.utc).isoformat()
        try:
            await repo.worker_update_denue_job(
                job_id=job.job_id,
                payload={"status": "failed", "error": error, "finished_at": finish_iso},
            )
            await self._patch_busqueda_meta(
                repo,
                busqueda_id=job.busqueda_id,
                patch={"status": "failed", "denue_job_id": str(job.job_id), "error": error},
            )
        except CRMRepositoryError:  # pragma: no cover
            logger.exception("denue_job_fail_update_failed", extra={"job_id": str(job.job_id), "error": error})

    async def _patch_busqueda_meta(self, repo: CRMRepository, *, busqueda_id: UUID, patch: dict[str, Any]) -> None:
        row = await repo.get_prospeccion_busqueda(busqueda_id=busqueda_id, select="meta")
        current = row.get("meta") if isinstance(row, dict) else None
        meta: dict[str, Any] = dict(current) if isinstance(current, dict) else {}
        meta.update(patch)
        await repo.worker_update_busqueda(busqueda_id=busqueda_id, payload={"meta": meta})

    async def _execute(self, repo: CRMRepository, job: DenueSearchJob, control: _DenueJobControl) -> None:
        organizacion_id = job.organizacion_id
        denue_settings = await tenant_runtime.get_denue_runtime_settings(organizacion_id=organizacion_id)
        client = DenueClient(token=denue_settings.token, base_url=denue_settings.base_url)
        payload = job.payload

        modo = str(payload.get("modo") or "radio")
        text_query = str(payload.get("texto_busqueda") or "").strip() or None
        activity_codes = payload.get("actividad_codigos") or []
        estrato_ids = payload.get("estrato_ids") or []
        geo_estados = payload.get("geo_estados") or []
        geo_municipios = payload.get("geo_municipios") or []
        registro_inicial = int(payload.get("registro_inicial") or 1)
        # Nota: en DENUE "registro_final" es parte del rango por request, no un "cap" total.
        # El worker avanza en ventanas de tamaño `batch_size` hasta que DENUE regrese menos filas que el batch.
        requested_registro_final = int(payload.get("registro_final") or (registro_inicial + settings.denue_batch_size - 1))

        def _geo_targets() -> list[tuple[str | None, str | None]]:
            targets: list[tuple[str | None, str | None]] = []
            for item in geo_municipios:
                if not isinstance(item, str):
                    continue
                if "::" in item:
                    estado, mun = item.split("::", 1)
                    estado = estado.strip() or None
                    mun = mun.strip() or None
                    targets.append((estado, mun))
            for estado in geo_estados:
                if not isinstance(estado, str):
                    continue
                trimmed = estado.strip()
                if trimmed:
                    targets.append((trimmed, None))
            if not targets:
                targets.append((None, None))
            # unique preserve order
            seen: set[tuple[str | None, str | None]] = set()
            unique: list[tuple[str | None, str | None]] = []
            for pair in targets:
                if pair in seen:
                    continue
                seen.add(pair)
                unique.append(pair)
            return unique

        def _activities() -> list[str]:
            items: list[str] = []
            for value in activity_codes:
                if isinstance(value, str) and value.strip():
                    items.append(value.strip())
            return expand_denue_activity_codes(items)

        combo_limit = 20
        batch_base_size = max(requested_registro_final - registro_inicial + 1, 1)
        batch_size = min(batch_base_size, settings.denue_batch_size)
        if batch_size <= 0:
            batch_size = settings.denue_batch_size
        max_batches = settings.denue_max_batches or None

        upserted_total = 0
        processed_batches = 0
        preview_items: list[dict[str, Any]] = []
        seen_external_ids: set[str] = set()

        def _is_statement_timeout(error: Exception) -> bool:
            text = str(error) or ""
            return ("57014" in text) or ("statement timeout" in text.lower())

        async def _upsert_chunk(items: list[dict[str, Any]]) -> None:
            await repo.worker_upsert_resultados(
                payload={
                    "p_busqueda_id": str(job.busqueda_id),
                    "p_fuente": "denue",
                    "p_items": items,
                    "p_organizacion_id": str(organizacion_id) if organizacion_id else None,
                },
                organizacion_id=organizacion_id,
            )

        async def _upsert(items: list[dict[str, Any]]) -> int:
            if not items:
                return 0
            # Mitigación: aunque el lote de DENUE sea de 500, el UPSERT puede exceder el statement_timeout
            # en Supabase. Insertamos en chunks más pequeños y hacemos "adaptive split" si hay 57014.
            chunk_size = 200
            min_chunk_size = 25
            upserted = 0
            idx = 0
            while idx < len(items):
                chunk = items[idx : idx + chunk_size]
                try:
                    await _upsert_chunk(chunk)
                    upserted += len(chunk)
                    idx += len(chunk)
                except CRMRepositoryError as exc:
                    if _is_statement_timeout(exc) and chunk_size > min_chunk_size:
                        chunk_size = max(min_chunk_size, int(math.floor(chunk_size / 2)))
                        search_logger.warning(
                            "denue.upsert_chunk_timeout",
                            extra={
                                "job_id": str(job.job_id),
                                "busqueda_id": str(job.busqueda_id),
                                "next_chunk_size": chunk_size,
                                "failed_chunk_size": len(chunk),
                            },
                        )
                        continue
                    raise
            return upserted

        async def _update_progress(extra: dict[str, Any]) -> None:
            nonlocal upserted_total, processed_batches
            payload_progress = {
                "upserted": upserted_total,
                "batches": processed_batches,
                "batch_size": batch_size,
            }
            payload_progress.update(extra)
            await repo.worker_update_denue_job(
                job_id=job.job_id,
                payload={"progress": payload_progress},
                strict=False,
            )

        async def _process_batches(
            fetch_batch: Any,
            *,
            extra: dict[str, Any],
        ) -> None:
            nonlocal upserted_total, processed_batches, preview_items
            current = registro_inicial
            batch_index = 0
            while True:
                if control.cancel_requested:
                    break
                end = current + batch_size - 1
                search_logger.info(
                    "denue.batch_requested",
                    extra={
                        "job_id": str(job.job_id),
                        "busqueda_id": str(job.busqueda_id),
                        "modo": modo,
                        "registro_inicial": current,
                        "registro_final": end,
                        **extra,
                    },
                )
                rows = await fetch_batch(current, end)
                normalized_raw = [normalize_denue_place(item) for item in rows]
                normalized: list[dict[str, Any]] = []
                for item in normalized_raw:
                    external_id = item.get("external_id")
                    if not external_id:
                        normalized.append(item)
                        continue
                    key = str(external_id)
                    if key in seen_external_ids:
                        continue
                    seen_external_ids.add(key)
                    normalized.append(item)
                if normalized and len(preview_items) < 10:
                    preview_items.extend(normalized[: 10 - len(preview_items)])
                upserted_total += await _upsert(normalized)
                await repo.worker_update_busqueda(
                    busqueda_id=job.busqueda_id,
                    payload={"total_encontrados": upserted_total},
                )
                processed_batches += 1
                batch_index += 1
                await _update_progress(
                    {
                        "registro_inicial": current,
                        "registro_final": end,
                        "last_batch_rows": len(normalized),
                        **extra,
                    }
                )
                if not rows:
                    break
                if max_batches is not None and batch_index >= max_batches:
                        break
                if len(rows) < (end - current + 1):
                    break
                current = end + 1

        if modo == "radio":
            query = str(payload.get("query") or "").strip()
            lat = float(payload.get("lat"))
            lng = float(payload.get("lng"))
            radio_m = int(payload.get("radio_m") or 1000)
            records = await client.search(query=query, latitude=lat, longitude=lng, radius_m=radio_m)
            normalized_items = [normalize_denue_place(item) for item in records]
            if normalized_items and len(preview_items) < 10:
                preview_items.extend(normalized_items[:10])
            upserted_total += await _upsert(normalized_items)
        elif modo == "entidad":
            if not text_query:
                raise DenueError("texto_busqueda_required")
            targets = expand_targets_for_area_act(_geo_targets())
            entidades = [estado for estado, _ in targets if estado]
            if not entidades:
                raise DenueError("entidad_required")
            if len(entidades) > combo_limit:
                entidades = entidades[:combo_limit]
            for entidad in entidades:
                async def fetch_batch(start: int, end: int, *, _entidad: str = entidad) -> list[dict[str, Any]]:
                    return await client.search_by_entidad(
                        condicion=text_query,
                        entidad=_entidad,
                        registro_inicial=start,
                        registro_final=end,
                    )

                await _process_batches(fetch_batch, extra={"entidad": entidad})
        elif modo in {"area_act", "area_act_estr"}:
            acts = _activities()
            if not acts:
                raise DenueError("actividad_required")
            targets = _geo_targets()
            estratos: list[str | None]
            if modo == "area_act_estr":
                cleaned = [
                    str(value).strip()
                    for value in estrato_ids
                    if value and str(value).strip() and str(value).strip() != "0"
                ]
                if not cleaned:
                    raise DenueError("estrato_required")
                estratos = cleaned
            else:
                estratos = [None]

            combos: list[tuple[str, str | None, str | None, str | None]] = []
            for activity in acts:
                for entidad, municipio in targets:
                    for estrato in estratos:
                        combos.append((activity, entidad, municipio, estrato))
            if len(combos) > combo_limit:
                combos = combos[:combo_limit]

            for activity, entidad, municipio, estrato in combos:
                async def _run_combo(
                    *,
                    _activity: str = activity,
                    _entidad: str | None = entidad,
                    _municipio: str | None = municipio,
                    _estrato: str | None = estrato,
                ) -> None:
                    if modo == "area_act_estr":
                        async def fetch_batch(
                            start: int,
                            end: int,
                            *,
                            _activity_inner: str = _activity,
                            _entidad_inner: str | None = _entidad,
                            _municipio_inner: str | None = _municipio,
                            _estrato_inner: str | None = _estrato,
                        ) -> list[dict[str, Any]]:
                            return await client.search_area_act_estr(
                                entidad=_entidad_inner,
                                municipio=_municipio_inner,
                                actividad_codigo=_activity_inner,
                                texto=text_query,
                                registro_inicial=start,
                                registro_final=end,
                                estrato=_estrato_inner,
                            )
                    else:
                        async def fetch_batch(
                            start: int,
                            end: int,
                            *,
                            _activity_inner: str = _activity,
                            _entidad_inner: str | None = _entidad,
                            _municipio_inner: str | None = _municipio,
                        ) -> list[dict[str, Any]]:
                            return await client.search_area_act(
                                entidad=_entidad_inner,
                                municipio=_municipio_inner,
                                actividad_codigo=_activity_inner,
                                texto=text_query,
                                registro_inicial=start,
                                registro_final=end,
                            )

                    await _process_batches(
                        fetch_batch,
                        extra={
                            "actividad_codigo": _activity,
                            "entidad": _entidad,
                            "municipio": _municipio,
                            "estrato": _estrato,
                        },
                    )

                try:
                    await _run_combo()
                except DenueError as exc:
                    if municipio is not None:
                        raise
                    fallback_targets = expand_state_to_municipalities(entidad)
                    if not fallback_targets:
                        raise
                    search_logger.warning(
                        "denue.state_municipality_fallback",
                        extra={
                            "job_id": str(job.job_id),
                            "busqueda_id": str(job.busqueda_id),
                            "modo": modo,
                            "entidad": entidad,
                            "actividad_codigo": activity,
                            "estrato": estrato,
                            "error": str(exc),
                            "municipios": len(fallback_targets),
                        },
                    )
                    fallback_success = False
                    last_fallback_exc: DenueError | None = None
                    for fallback_entidad, fallback_municipio in fallback_targets:
                        try:
                            await _run_combo(
                                _entidad=fallback_entidad,
                                _municipio=fallback_municipio,
                                _estrato=estrato,
                            )
                            fallback_success = True
                        except DenueError as fallback_exc:
                            last_fallback_exc = fallback_exc
                            search_logger.warning(
                                "denue.state_municipality_fallback_target_failed",
                                extra={
                                    "job_id": str(job.job_id),
                                    "busqueda_id": str(job.busqueda_id),
                                    "modo": modo,
                                    "entidad": fallback_entidad,
                                    "municipio": fallback_municipio,
                                    "actividad_codigo": activity,
                                    "estrato": estrato,
                                    "error": str(fallback_exc),
                                },
                            )
                    if not fallback_success and last_fallback_exc is not None:
                        raise last_fallback_exc
        else:
            raise DenueError("modo_desconocido")

        await repo.worker_update_busqueda(
            busqueda_id=job.busqueda_id,
            payload={"total_encontrados": upserted_total},
        )
        if settings.prospeccion_credits_enforcement_enabled and organizacion_id is not None:
            await repo.record_denue_raw_results(
                organizacion_id=organizacion_id,
                busqueda_id=job.busqueda_id,
            )
        await repo.worker_update_denue_job(
            job_id=job.job_id,
            payload={"total": upserted_total, "stats": {"upserted": upserted_total, "batches": processed_batches}},
            strict=False,
        )


DENUE_SEARCH_JOB_MANAGER = DenueSearchJobManager()
