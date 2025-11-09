"""Servicios para métricas demográficas omnicanal."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class DemografiaServiceError(RuntimeError):
    """Error al consultar datos demográficos."""


def _ensure_supabase_config() -> tuple[str, str]:
    if not settings.supabase_url or not settings.supabase_service_role:
        raise DemografiaServiceError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")
    base_url = settings.supabase_url.rstrip("/")
    token = settings.supabase_service_role
    return base_url, token


async def _call_rpc(function: str, payload: dict[str, Any] | None = None) -> Any:
    base_url, token = _ensure_supabase_config()
    url = f"{base_url}/rest/v1/rpc/{function}"
    headers = {
        "apikey": token,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload or None)
    except httpx.RequestError as exc:
        raise DemografiaServiceError(f"Error de red consultando {function}: {exc}") from exc

    if response.status_code >= 400:
        raise DemografiaServiceError(
            f"Supabase respondió error en {function} (status={response.status_code}, body={response.text!r})"
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise DemografiaServiceError(f"Respuesta inválida de {function}: {exc}") from exc

    return data


def _to_number(value: Any) -> int:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return int(value)
    if isinstance(value, str):
        value = value.strip()
        if value:
            try:
                return int(float(value))
            except ValueError:
                return 0
    return 0


async def fetch_leads_resumen(
    *,
    nivel: str,
    channels: list[str] | None,
    date_from: datetime | None,
    date_to: datetime | None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"p_nivel": nivel}
    if channels:
        payload["p_canales"] = ",".join(sorted({c for c in channels if c}))
    if date_from:
        payload["p_from"] = date_from.isoformat()
    if date_to:
        payload["p_to"] = date_to.isoformat()

    rows = await _call_rpc("panel_leads_geo_resumen", payload)
    if not isinstance(rows, list):
        raise DemografiaServiceError(f"Respuesta inesperada de panel_leads_geo_resumen: {rows!r}")

    items: list[dict[str, Any]] = []
    totals_global = {
        "total": 0,
        "abiertas": 0,
        "ganadas": 0,
        "perdidas": 0,
    }
    totals_by_channel: dict[str, dict[str, int]] = {}

    for row in rows:
        if not isinstance(row, dict):
            continue
        canal = str(row.get("canal") or "desconocido").lower()
        item = {
            "level": str(row.get("location_level") or nivel),
            "key": str(row.get("location_key") or "UNK"),
            "name": str(row.get("location_name") or "Desconocido"),
            "canal": canal,
            "total": _to_number(row.get("total")),
            "abiertas": _to_number(row.get("abiertas")),
            "ganadas": _to_number(row.get("ganadas")),
            "perdidas": _to_number(row.get("perdidas")),
        }
        items.append(item)

        totals_global["total"] += item["total"]
        totals_global["abiertas"] += item["abiertas"]
        totals_global["ganadas"] += item["ganadas"]
        totals_global["perdidas"] += item["perdidas"]

        channel_totals = totals_by_channel.setdefault(
            canal, {"total": 0, "abiertas": 0, "ganadas": 0, "perdidas": 0}
        )
        channel_totals["total"] += item["total"]
        channel_totals["abiertas"] += item["abiertas"]
        channel_totals["ganadas"] += item["ganadas"]
        channel_totals["perdidas"] += item["perdidas"]

    return {
        "items": items,
        "totals": totals_global,
        "totals_by_channel": totals_by_channel,
    }


async def fetch_visitantes_resumen(
    *,
    nivel: str,
    date_from: datetime | None,
    date_to: datetime | None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"p_nivel": nivel}
    if date_from:
        payload["p_from"] = date_from.isoformat()
    if date_to:
        payload["p_to"] = date_to.isoformat()

    rows = await _call_rpc("panel_visitantes_geo_resumen", payload)
    if not isinstance(rows, list):
        raise DemografiaServiceError(
            f"Respuesta inesperada de panel_visitantes_geo_resumen: {rows!r}"
        )

    items: list[dict[str, Any]] = []
    totals = {
        "total": 0,
        "con_chat": 0,
        "sin_chat": 0,
    }

    for row in rows:
        if not isinstance(row, dict):
            continue
        item = {
            "level": str(row.get("location_level") or nivel),
            "key": str(row.get("location_key") or "UNK"),
            "name": str(row.get("location_name") or "Desconocido"),
            "total": _to_number(row.get("total_visitas")),
            "con_chat": _to_number(row.get("visitas_con_chat")),
            "sin_chat": _to_number(row.get("visitas_sin_chat")),
        }
        items.append(item)
        totals["total"] += item["total"]
        totals["con_chat"] += item["con_chat"]
        totals["sin_chat"] += item["sin_chat"]

    return {
        "items": items,
        "totals": totals,
    }
