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
    stages: list[str] | None,
    date_from: datetime | None,
    date_to: datetime | None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"p_nivel": nivel}
    if channels:
        joined_channels = ",".join(sorted({c.strip().lower() for c in channels if c}))
        if joined_channels:
            payload["p_canales"] = joined_channels
    if stages:
        stage_payload = ",".join(sorted({value.strip().lower() for value in stages if value}))
        if stage_payload:
            payload["p_etapas"] = stage_payload
    if date_from:
        payload["p_from"] = date_from.isoformat()
    if date_to:
        payload["p_to"] = date_to.isoformat()

    rows = await _call_rpc("panel_leads_geo_resumen_ext", payload)
    if not isinstance(rows, list):
        raise DemografiaServiceError(
            f"Respuesta inesperada de panel_leads_geo_resumen_ext: {rows!r}"
        )

    normalized_rows: list[dict[str, Any]] = []
    captado_order: int | None = None
    totals_global: dict[str, int] = {
        "total": 0,
        "abiertas": 0,
        "ganadas": 0,
        "perdidas": 0,
        "webchat_sin_conversacion": 0,
        "webchat_captado": 0,
        "webchat_post_captado": 0,
    }
    totals_by_channel: dict[str, dict[str, Any]] = {}

    def resolve_webchat_bucket(stage_code: str, stage_order: int, threshold: int) -> str | None:
        if stage_code == "visitantes_sin_chat":
            return "sin_conversacion"
        if stage_code == "captado":
            return "captado"
        if stage_order > threshold:
            return "post_captado"
        return None

    for raw in rows:
        if not isinstance(raw, dict):
            continue

        canal = str(raw.get("canal") or "desconocido").strip().lower()
        level = str(raw.get("location_level") or nivel)
        key = str(raw.get("location_key") or "UNK")
        name = str(raw.get("location_name") or "Desconocido")
        stage_code = str(raw.get("etapa_codigo") or "").strip().lower()
        stage_category = str(raw.get("etapa_categoria") or "").strip().lower()
        stage_order = _to_number(raw.get("etapa_orden"))
        stage_threshold = _to_number(raw.get("captado_orden")) or 1
        total = _to_number(raw.get("total"))

        if total <= 0:
            continue

        if captado_order is None or (stage_threshold and stage_threshold < captado_order):
            captado_order = stage_threshold or captado_order

        webchat_bucket = None
        if canal == "webchat":
            webchat_bucket = resolve_webchat_bucket(stage_code, stage_order, stage_threshold or 1)

        normalized_rows.append(
            {
                "level": level,
                "key": key,
                "name": name,
                "canal": canal,
                "total": total,
                "etapa_codigo": stage_code,
                "etapa_categoria": stage_category or "desconocida",
                "etapa_orden": stage_order,
                "captado_orden": stage_threshold or 1,
                "webchat_bucket": webchat_bucket,
            }
        )

        totals_global["total"] += total
        if stage_category == "ganada":
            totals_global["ganadas"] += total
        elif stage_category == "perdida":
            totals_global["perdidas"] += total
        else:
            totals_global["abiertas"] += total

        channel_totals = totals_by_channel.setdefault(
            canal,
            {
                "total": 0,
                "abiertas": 0,
                "ganadas": 0,
                "perdidas": 0,
            },
        )
        channel_totals["total"] += total
        if stage_category == "ganada":
            channel_totals["ganadas"] += total
        elif stage_category == "perdida":
            channel_totals["perdidas"] += total
        else:
            channel_totals["abiertas"] += total

        if canal == "webchat":
            bucket_totals = channel_totals.setdefault(
                "webchat_breakdown",
                {"sin_conversacion": 0, "captado": 0, "post_captado": 0},
            )
            if webchat_bucket and webchat_bucket in bucket_totals:
                bucket_totals[webchat_bucket] += total
                key_name = f"webchat_{webchat_bucket}"
                if key_name in totals_global:
                    totals_global[key_name] += total

    return {
        "rows": normalized_rows,
        "captado_orden": captado_order or 1,
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

    rows = await _call_rpc("panel_visitantes_geo_resumen_ext", payload)
    if not isinstance(rows, list):
        raise DemografiaServiceError(
            f"Respuesta inesperada de panel_visitantes_geo_resumen_ext: {rows!r}"
        )

    items: list[dict[str, Any]] = []
    totals = {
        "total": 0,
        "con_chat": 0,
        "sin_chat": 0,
        "webchat_con_chat": 0,
        "webchat_sin_chat": 0,
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
            "webchat_total": _to_number(row.get("webchat_total")),
            "webchat_con_chat": _to_number(row.get("webchat_con_chat")),
            "webchat_sin_chat": _to_number(row.get("webchat_sin_chat")),
            "whatsapp_total": _to_number(row.get("whatsapp_total")),
            "voz_total": _to_number(row.get("voz_total")),
            "has_data": bool(row.get("has_data")),
        }
        items.append(item)
        totals["total"] += item["total"]
        totals["con_chat"] += item["con_chat"]
        totals["sin_chat"] += item["sin_chat"]
        totals["webchat_con_chat"] += item["webchat_con_chat"]
        totals["webchat_sin_chat"] += item["webchat_sin_chat"]

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

    stage_code_map: dict[str, str] = {
        "captado": "captado",
        "precalificado": "precalificado",
        "negociacion": "negociacion",
        "ganado": "ganado",
        "perdido": "perdido",
    }
    stage_category_map: dict[str, str] = {
        "ganada": "ganado",
        "perdida": "perdido",
    }

    leads_rows = leads_payload.get("rows") if isinstance(leads_payload, dict) else []
    visitantes_rows = (
        visitantes_payload.get("items") if isinstance(visitantes_payload, dict) else []
    )

    combined: dict[str, dict[str, Any]] = {}

    def _should_include(key: str) -> bool:
        if nivel != "municipio" or not state_filter:
            return True
        return key.startswith(state_filter)

    def _ensure_entry(key: str, name: str) -> dict[str, Any]:
        entry = combined.get(key)
        if entry is None:
            entry = {
                "key": key,
                "name": name or "Desconocido",
                "nivel": nivel,
                "leads_total": 0,
                "leads_totales_por_canal": {"webchat": 0, "whatsapp": 0, "voz": 0},
                "totales_por_canal": {"webchat": 0, "whatsapp": 0, "voz": 0},
                "etapas_totales": {
                    "captado": 0,
                    "precalificado": 0,
                    "negociacion": 0,
                    "ganado": 0,
                    "perdido": 0,
                },
                "visitantes_total": 0,
                "visitantes_con_chat": 0,
                "visitantes_sin_chat": 0,
                "total_visitas": 0,
                "has_data": False,
                "parent_state": key[:2] if nivel == "municipio" else None,
            }
            combined[key] = entry
        elif entry["name"] == "Desconocido" and name:
            entry["name"] = name
        return entry

    for row in leads_rows or []:
        if not isinstance(row, dict):
            continue
        key = str(row.get("key") or "UNK")
        if not _should_include(key):
            continue
        entry = _ensure_entry(key, str(row.get("name") or "Desconocido"))
        total = _to_number(row.get("total"))
        if total <= 0:
            continue
        canal = str(row.get("canal") or "desconocido")
        stage_code = str(row.get("etapa_codigo") or "").strip().lower()
        stage_category = str(row.get("etapa_categoria") or "").strip().lower()

        entry["leads_total"] += total
        entry["leads_totales_por_canal"][canal] = (
            entry["leads_totales_por_canal"].get(canal, 0) + total
        )
        stage_bucket = stage_code_map.get(stage_code) or stage_category_map.get(stage_category)
        if stage_bucket:
            entry["etapas_totales"][stage_bucket] = (
                entry["etapas_totales"].get(stage_bucket, 0) + total
            )

    for row in visitantes_rows or []:
        if not isinstance(row, dict):
            continue
        key = str(row.get("key") or "UNK")
        if not _should_include(key):
            continue
        entry = _ensure_entry(key, str(row.get("name") or "Desconocido"))
        entry["visitantes_total"] += _to_number(row.get("total"))
        entry["visitantes_con_chat"] += _to_number(row.get("con_chat"))
        entry["visitantes_sin_chat"] += _to_number(row.get("sin_chat"))
        if _to_number(row.get("total")) > 0:
            entry["has_data"] = True

    result = []
    for entry in combined.values():
        entry["leads_totales_por_canal"] = dict(entry["leads_totales_por_canal"])
        entry["etapas_totales"] = {
            "captado": entry["etapas_totales"].get("captado", 0),
            "precalificado": entry["etapas_totales"].get("precalificado", 0),
            "negociacion": entry["etapas_totales"].get("negociacion", 0),
            "ganado": entry["etapas_totales"].get("ganado", 0),
            "perdido": entry["etapas_totales"].get("perdido", 0),
        }
        entry["totales_por_canal"] = {
            "webchat": entry["visitantes_total"],
            "whatsapp": entry["leads_totales_por_canal"].get("whatsapp", 0),
            "voz": entry["leads_totales_por_canal"].get("voz", 0),
        }
        entry["conversacion_totales"] = {
            "con_conversacion": entry["visitantes_con_chat"],
            "sin_conversacion": entry["visitantes_sin_chat"],
        }
        entry["total_visitas"] = (
            entry["totales_por_canal"]["webchat"]
            + entry["totales_por_canal"]["whatsapp"]
            + entry["totales_por_canal"]["voz"]
        )
        entry["has_data"] = entry["has_data"] or entry["visitantes_total"] > 0
        if entry["key"] in {"", "UNK"}:
            entry["has_data"] = False
        entry["next_level"] = (
            "estado" if nivel == "pais" else "municipio" if nivel == "estado" else None
        )
        if not entry["has_data"]:
            entry["next_level"] = None
        if entry["visitantes_total"] <= 0:
            continue

        normalized_entry = {
            "key": entry["key"],
            "name": entry["name"],
            "nivel": entry["nivel"],
            "leads_total": entry["leads_total"],
            "totales_por_canal": entry["totales_por_canal"],
            "etapas_totales": entry["etapas_totales"],
            "conversacion_totales": entry["conversacion_totales"],
            "visitantes_total": entry["visitantes_total"],
            "visitantes_con_chat": entry["visitantes_con_chat"],
            "visitantes_sin_chat": entry["visitantes_sin_chat"],
            "total_visitas": entry["total_visitas"],
            "has_data": entry["has_data"],
            "next_level": entry["next_level"],
            "parent_state": entry["parent_state"],
        }
        result.append(normalized_entry)

    result.sort(key=lambda item: item["total_visitas"], reverse=True)
    return result
