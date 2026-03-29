"""Reconciliación de costos oficiales de OpenAI contra el ledger interno."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.services.tenant_runtime import get_secret_plaintext

logger = get_logger("app.services.openai_reconciliation")

MASTER_ORGANIZACION_ID = UUID("00000000-0000-0000-0000-000000000001")


def _parse_date(value: str | None, *, fallback: date) -> date:
    if not value:
        return fallback
    return date.fromisoformat(value)


def _to_unix(value: date) -> int:
    return int(datetime.combine(value, time.min, tzinfo=timezone.utc).timestamp())


def _as_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


async def _resolve_admin_api_key() -> str | None:
    secret = await get_secret_plaintext(
        organizacion_id=MASTER_ORGANIZACION_ID,
        clave="openai.admin_api_key",
    )
    return secret or settings.openai_admin_api_key


async def _supabase_request(
    method: str,
    path: str,
    *,
    params: dict[str, str] | None = None,
    json_payload: Any = None,
    prefer: str | None = None,
) -> httpx.Response:
    if not settings.supabase_url or not settings.supabase_service_role:
        raise RuntimeError("supabase_not_configured")
    headers = {
        "Accept": "application/json",
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
    }
    if prefer:
        headers["Prefer"] = prefer
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.request(
            method,
            f"{settings.supabase_url.rstrip('/')}{path}",
            params=params,
            json=json_payload,
            headers=headers,
        )
    response.raise_for_status()
    return response


@dataclass(slots=True)
class SyncResult:
    buckets_seen: int = 0
    rows_upserted: int = 0
    pages_fetched: int = 0


async def sync_openai_cost_reconciliation(
    *,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    admin_api_key = await _resolve_admin_api_key()
    if not admin_api_key:
        raise RuntimeError("openai_admin_api_key_not_configured")

    today = datetime.now(timezone.utc).date()
    start_date = _parse_date(date_from, fallback=today - timedelta(days=29))
    end_date = _parse_date(date_to, fallback=today)
    if end_date < start_date:
        raise RuntimeError("invalid_date_range")

    query_params: dict[str, str] = {
        "start_time": str(_to_unix(start_date)),
        "end_time": str(_to_unix(end_date + timedelta(days=1))),
        "bucket_width": "1d",
        "group_by": "project_id",
        "limit": "31",
    }

    headers = {"Authorization": f"Bearer {admin_api_key}"}
    sync = SyncResult()
    page: str | None = None

    async with httpx.AsyncClient(timeout=45.0) as client:
        while True:
            params = dict(query_params)
            if page:
                params["page"] = page
            response = await client.get(
                "https://api.openai.com/v1/organization/costs",
                headers=headers,
                params=params,
            )
            response.raise_for_status()
            payload = response.json()
            sync.pages_fetched += 1

            rows_to_upsert: list[dict[str, Any]] = []
            for bucket in payload.get("data") or []:
                if not isinstance(bucket, dict):
                    continue
                bucket_start = bucket.get("start_time_iso") or datetime.fromtimestamp(
                    int(bucket.get("start_time")),
                    tz=timezone.utc,
                ).isoformat()
                bucket_end = bucket.get("end_time_iso") or datetime.fromtimestamp(
                    int(bucket.get("end_time")),
                    tz=timezone.utc,
                ).isoformat()
                sync.buckets_seen += 1
                for result in bucket.get("results") or []:
                    if not isinstance(result, dict):
                        continue
                    project_id = result.get("project_id")
                    line_item = result.get("line_item")
                    amount = result.get("amount") if isinstance(result.get("amount"), dict) else {}
                    rows_to_upsert.append(
                        {
                            "source_endpoint": "organization/costs",
                            "bucket_start": bucket_start,
                            "bucket_end": bucket_end,
                            "organization_id": result.get("organization_id") or "__unknown__",
                            "organization_name": result.get("organization_name"),
                            "openai_project_id": project_id,
                            "openai_project_name": result.get("project_name"),
                            "project_bucket_key": str(project_id or "__none__"),
                            "line_item": line_item,
                            "line_item_key": str(line_item or "__all__"),
                            "amount_value_usd": str(_as_decimal(amount.get("value"))),
                            "currency": str(amount.get("currency") or "usd"),
                            "raw": result,
                            "synced_at": datetime.now(timezone.utc).isoformat(),
                        }
                    )
            if rows_to_upsert:
                await _supabase_request(
                    "POST",
                    "/rest/v1/openai_cost_api_buckets",
                    params={
                        "on_conflict": "source_endpoint,bucket_start,bucket_end,organization_id,project_bucket_key,line_item_key",
                    },
                    json_payload=rows_to_upsert,
                    prefer="resolution=merge-duplicates,return=minimal",
                )
                sync.rows_upserted += len(rows_to_upsert)

            if not payload.get("has_more"):
                break
            page = payload.get("next_page")
            if not isinstance(page, str) or not page:
                break

    return {
        "ok": True,
        "date_from": start_date.isoformat(),
        "date_to": end_date.isoformat(),
        "pages_fetched": sync.pages_fetched,
        "buckets_seen": sync.buckets_seen,
        "rows_upserted": sync.rows_upserted,
    }
