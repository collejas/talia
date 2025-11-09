"""Servicios para métricas demográficas omnicanal."""

from __future__ import annotations

from collections import defaultdict
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


def build_map_dataset(
    *,
    nivel: str,
    leads_payload: dict[str, Any],
    visitantes_payload: dict[str, Any],
    state_filter: str | None = None,
) -> list[dict[str, Any]]:
    state_filter = (state_filter or "").strip()
    if state_filter and len(state_filter) == 1:
        state_filter = state_filter.zfill(2)

    leads_items = leads_payload.get("items") if isinstance(leads_payload, dict) else []
    visitantes_items = (
        visitantes_payload.get("items") if isinstance(visitantes_payload, dict) else []
    )

    combined: dict[str, dict[str, Any]] = {}

    def _should_include(key: str) -> bool:
        if nivel != "municipio" or not state_filter:
            return True
        return key.startswith(state_filter)

    for item in leads_items or []:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key") or "UNK")
        if not _should_include(key):
            continue
        entry = combined.setdefault(
            key,
            {
                "key": key,
                "name": str(item.get("name") or "Desconocido"),
                "leads_total": 0,
                "leads_por_canal": defaultdict(int),
                "leads_por_etapa": defaultdict(int),
                "visitantes_total": 0,
                "visitantes_con_chat": 0,
                "visitantes_sin_chat": 0,
            },
        )
        entry["leads_total"] += _to_number(item.get("total"))
        entry["leads_por_canal"][item.get("canal") or "desconocido"] += _to_number(
            item.get("total")
        )
        entry["leads_por_etapa"]["abiertas"] += _to_number(item.get("abiertas"))
        entry["leads_por_etapa"]["ganadas"] += _to_number(item.get("ganadas"))
        entry["leads_por_etapa"]["perdidas"] += _to_number(item.get("perdidas"))

    for item in visitantes_items or []:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key") or "UNK")
        if not _should_include(key):
            continue
        entry = combined.setdefault(
            key,
            {
                "key": key,
                "name": str(item.get("name") or "Desconocido"),
                "leads_total": 0,
                "leads_por_canal": defaultdict(int),
                "leads_por_etapa": defaultdict(int),
                "visitantes_total": 0,
                "visitantes_con_chat": 0,
                "visitantes_sin_chat": 0,
            },
        )
        entry["visitantes_total"] += _to_number(item.get("total"))
        entry["visitantes_con_chat"] += _to_number(item.get("con_chat"))
        entry["visitantes_sin_chat"] += _to_number(item.get("sin_chat"))

    result = []
    for entry in combined.values():
        normalized_entry = {
            "key": entry["key"],
            "name": entry["name"],
            "leads_total": entry["leads_total"],
            "leads_por_canal": dict(entry["leads_por_canal"]),
            "leads_por_etapa": dict(entry["leads_por_etapa"]),
            "visitantes_total": entry["visitantes_total"],
            "visitantes_con_chat": entry["visitantes_con_chat"],
            "visitantes_sin_chat": entry["visitantes_sin_chat"],
        }
        result.append(normalized_entry)

    result.sort(key=lambda item: (item["leads_total"], item["visitantes_total"]), reverse=True)
    return result
