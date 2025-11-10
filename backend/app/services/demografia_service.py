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


async def _call_rpc(
    function: str,
    payload: dict[str, Any] | None = None,
    *,
    jwt: str | None = None,
) -> Any:
    base_url, token = _ensure_supabase_config()
    url = f"{base_url}/rest/v1/rpc/{function}"
    auth_token = jwt or token
    api_key = settings.supabase_anon or token
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {auth_token}",
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
    jwt: str | None,
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

    rows = await _call_rpc("panel_leads_geo_resumen_ext", payload, jwt=jwt)
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
    fallback_leads_payload: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    state_filter = (state_filter or "").strip()
    if state_filter and len(state_filter) == 1:
        state_filter = state_filter.zfill(2)

    leads_rows = leads_payload.get("rows") if isinstance(leads_payload, dict) else []
    fallback_rows = (
        fallback_leads_payload.get("rows") if isinstance(fallback_leads_payload, dict) else []
    )
    visitantes_rows = (
        visitantes_payload.get("items") if isinstance(visitantes_payload, dict) else []
    )

    fallback_stage_totals: dict[str, dict[str, int]] = {}
    fallback_channel_totals: dict[str, dict[str, int]] = {}
    if nivel == "municipio" and isinstance(fallback_rows, list):
        for raw in fallback_rows:
            if not isinstance(raw, dict):
                continue
            state_key = str(raw.get("key") or "").strip()
            if not state_key:
                continue
            total = _to_number(raw.get("total"))
            if total <= 0:
                continue
            stage_code = str(raw.get("etapa_codigo") or "").strip().lower()
            stage_category = str(raw.get("etapa_categoria") or "").strip().lower()
            stage_order = _to_number(raw.get("etapa_orden"))
            captado_threshold = _to_number(raw.get("captado_orden")) or 1
            bucket = None
            if stage_category == "ganada":
                bucket = "ganado"
            elif stage_category == "perdida":
                bucket = "perdido"
            else:
                if stage_order and stage_order <= captado_threshold:
                    bucket = "captado"
                elif stage_order and stage_order == captado_threshold + 1:
                    bucket = "precalificado"
                else:
                    bucket = "negociacion"
            state_totals = fallback_stage_totals.setdefault(
                state_key,
                {
                    "captado": 0,
                    "precalificado": 0,
                    "negociacion": 0,
                    "ganado": 0,
                    "perdido": 0,
                },
            )
            if bucket and bucket in state_totals:
                state_totals[bucket] += total
            canal = str(raw.get("canal") or "").strip().lower() or "desconocido"
            channel_totals = fallback_channel_totals.setdefault(
                state_key,
                {"webchat": 0, "whatsapp": 0, "voz": 0, canal: 0},
            )
            channel_totals[canal] = channel_totals.get(canal, 0) + total

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
        raw_channel = str(row.get("canal") or "desconocido").strip().lower()
        channel_alias = {
            "llamada": "voz",
            "llamadas": "voz",
            "telefono": "voz",
            "teléfono": "voz",
            "phone": "voz",
        }
        canal = channel_alias.get(raw_channel, raw_channel)
        stage_code = str(row.get("etapa_codigo") or "").strip().lower()
        stage_category = str(row.get("etapa_categoria") or "").strip().lower()
        stage_order = _to_number(row.get("etapa_orden"))
        captado_threshold = _to_number(row.get("captado_orden")) or 1

        entry["leads_total"] += total
        entry["leads_totales_por_canal"][canal] = (
            entry["leads_totales_por_canal"].get(canal, 0) + total
        )
        if total > 0:
            entry["has_data"] = True
        stage_bucket = None
        if stage_category == "ganada":
            stage_bucket = "ganado"
        elif stage_category == "perdida":
            stage_bucket = "perdido"
        elif stage_code not in {"visitantes_sin_chat", "sin_conversacion"}:
            if stage_order and stage_order <= captado_threshold:
                stage_bucket = "captado"
            elif stage_order and stage_order == captado_threshold + 1:
                stage_bucket = "precalificado"
            else:
                stage_bucket = "negociacion"
        logger.info(
            "demografia.stage_bucket_resolved",
            extra={
                "location_key": key,
                "location_name": entry["name"],
                "canal": canal,
                "stage_code": stage_code,
                "stage_category": stage_category,
                "stage_order": stage_order,
                "captado_threshold": captado_threshold,
                "bucket": stage_bucket,
                "total": total,
            },
        )
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
        if (
            nivel == "municipio"
            and entry.get("leads_total", 0) <= 0
            and isinstance(entry.get("parent_state"), str)
            and entry["parent_state"] in fallback_stage_totals
        ):
            stage_copy = dict(fallback_stage_totals[entry["parent_state"]])
            entry["etapas_totales"] = stage_copy
            entry["leads_total"] = sum(stage_copy.values())
            channel_copy = fallback_channel_totals.get(entry["parent_state"], {})
            for channel_key, channel_value in channel_copy.items():
                entry["leads_totales_por_canal"][channel_key] = channel_value
        entry["totales_por_canal"] = {
            "webchat": entry["visitantes_total"],
            "whatsapp": entry["leads_totales_por_canal"].get("whatsapp", 0),
            "voz": entry["leads_totales_por_canal"].get("voz", 0),
        }
        entry["conversacion_totales"] = {
            "con_conversacion": entry["visitantes_con_chat"],
            "sin_conversacion": entry["visitantes_sin_chat"],
        }
        entry["total_visitas"] = entry["visitantes_total"] + entry["leads_total"]
        entry["has_data"] = (
            entry["has_data"]
            or entry["visitantes_total"] > 0
            or entry["leads_total"] > 0
            or entry["totales_por_canal"]["whatsapp"] > 0
            or entry["totales_por_canal"]["voz"] > 0
        )
        logger.info(
            "demografia.entry_aggregated",
            extra={
                "location_key": entry["key"],
                "location_name": entry["name"],
                "nivel": entry["nivel"],
                "leads_total": entry["leads_total"],
                "visitantes_total": entry["visitantes_total"],
                "etapas_totales": entry["etapas_totales"],
                "totales_por_canal": entry["totales_por_canal"],
                "conversacion_totales": entry["conversacion_totales"],
                "has_data": entry["has_data"],
            },
        )
        if entry["key"] in {"", "UNK"}:
            entry["has_data"] = False
        entry["next_level"] = (
            "estado" if nivel == "pais" else "municipio" if nivel == "estado" else None
        )
        if not entry["has_data"]:
            entry["next_level"] = None
        if entry["total_visitas"] <= 0:
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

    if nivel == "pais":
        unknown_entries = [item for item in result if item["key"] == "UNK"]
        if unknown_entries:
            target = next(
                (item for item in result if item["key"] != "UNK" and item["has_data"]), None
            )
            if target:
                for unknown in unknown_entries:
                    for key, value in unknown["etapas_totales"].items():
                        target["etapas_totales"][key] = target["etapas_totales"].get(key, 0) + value
                    for key, value in unknown["totales_por_canal"].items():
                        target["totales_por_canal"][key] = (
                            target["totales_por_canal"].get(key, 0) + value
                        )
                    for key, value in unknown["conversacion_totales"].items():
                        target["conversacion_totales"][key] = (
                            target["conversacion_totales"].get(key, 0) + value
                        )
                    target["leads_total"] += unknown["leads_total"]
                    target["visitantes_total"] += unknown["visitantes_total"]
                    target["visitantes_con_chat"] += unknown["visitantes_con_chat"]
                    target["visitantes_sin_chat"] += unknown["visitantes_sin_chat"]
                    target["total_visitas"] += unknown["total_visitas"]
                target["has_data"] = True
            result = [item for item in result if item["key"] != "UNK"]

    result.sort(key=lambda item: item["total_visitas"], reverse=True)
    return result
