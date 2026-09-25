"""Conciliación histórica de eventos transaccionales de Brevo.

Este proceso es independiente del sender para que una consulta histórica no
añada latencia al inicio de los lotes. Los eventos se persisten de forma
idempotente y nunca eliminan el historial local cuando Brevo deja de conservar
el evento.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from uuid import UUID

import httpx

from app.core.config import settings
from app.core.logging import get_logger, log_event
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.services import tenant_runtime
from app.services.brevo import process_brevo_events

logger = get_logger("brevo.sync")


def _as_event_list(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("events", "data", "items"):
        value = payload.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]
    return []


async def _fetch_events_page(
    *,
    api_key: str,
    base_url: str,
    start_date: date,
    end_date: date,
    offset: int,
    limit: int,
) -> list[dict[str, Any]]:
    headers = {"api-key": api_key, "accept": "application/json"}
    params = {
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "limit": str(limit),
        "offset": str(offset),
        "sort": "desc",
    }
    async with httpx.AsyncClient(timeout=settings.postmark_sync_page_timeout_seconds) as client:
        response = await client.get(
            f"{base_url.rstrip('/')}/smtp/statistics/events",
            headers=headers,
            params=params,
        )
    if response.status_code >= 400:
        raise RuntimeError(f"brevo_events_http_{response.status_code}")
    return _as_event_list(response.json() if response.content else {})


async def synchronize_brevo_organization(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    days: int,
) -> int:
    runtime = await tenant_runtime.get_brevo_runtime_settings(organizacion_id=organizacion_id)
    if not runtime.api_key:
        return 0
    end_date = date.today()
    start_date = end_date - timedelta(days=max(1, min(days, 90)) - 1)
    offset = 0
    page_size = 5000
    processed = 0
    while True:
        events = await _fetch_events_page(
            api_key=runtime.api_key,
            base_url=runtime.base_url,
            start_date=start_date,
            end_date=end_date,
            offset=offset,
            limit=page_size,
        )
        if not events:
            break
        processed += await process_brevo_events(
            repo=repo,
            events=events,
            organizacion_id=organizacion_id,
        )
        if len(events) < page_size:
            break
        offset += len(events)
    return processed


async def synchronize_brevo_history(*, repo: CRMRepository) -> dict[str, int]:
    summary = {"organizations": 0, "events": 0, "failed_organizations": 0}
    organization_ids = await repo.list_active_brevo_organizations()
    for organizacion_id in organization_ids:
        summary["organizations"] += 1
        try:
            summary["events"] += await synchronize_brevo_organization(
                repo=repo,
                organizacion_id=organizacion_id,
                days=settings.brevo_sync_days,
            )
        except (CRMRepositoryError, RuntimeError, httpx.HTTPError, ValueError) as exc:
            summary["failed_organizations"] += 1
            log_event(
                logger,
                "brevo.sync_organization_failed",
                organizacion_id=str(organizacion_id),
                error=str(exc),
            )
    log_event(logger, "brevo.sync_cycle_completed", **summary)
    return summary


__all__ = [
    "synchronize_brevo_history",
    "synchronize_brevo_organization",
]
