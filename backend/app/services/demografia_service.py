"""Servicios para métricas demográficas omnicanal."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)
COUNTRY_NAME_MAP: dict[str, str] = {}
COUNTRY_CODE_ALIAS_MAP: dict[str, str] = {}


def _load_country_geo_maps() -> tuple[dict[str, str], dict[str, str]]:
    # DB-first: catálogo ya migrado a geo_paises.
    if settings.supabase_url and settings.supabase_service_role:
        try:
            url = f"{settings.supabase_url.rstrip('/')}/rest/v1/geo_paises"
            headers = {
                "apikey": settings.supabase_service_role,
                "Authorization": f"Bearer {settings.supabase_service_role}",
                "Accept": "application/json",
            }
            params = {
                "select": "codigo_iso2,codigo_iso3,nombre,nombre_largo",
                "activo": "eq.true",
                "order": "nombre.asc",
                "limit": "400",
            }
            with httpx.Client(timeout=20.0) as client:
                resp = client.get(url, headers=headers, params=params)
            if resp.status_code < 400:
                payload = resp.json()
                if isinstance(payload, list):
                    name_mapping: dict[str, str] = {}
                    alias_mapping: dict[str, str] = {}
                    for row in payload:
                        if not isinstance(row, dict):
                            continue
                        name = str(row.get("nombre_largo") or row.get("nombre") or "").strip()
                        iso2 = str(row.get("codigo_iso2") or "").strip().upper()
                        iso3 = str(row.get("codigo_iso3") or "").strip().upper()
                        if len(iso2) == 2:
                            if name:
                                name_mapping[iso2] = name
                            alias_mapping[iso2] = iso2
                        if len(iso3) == 3:
                            if name:
                                name_mapping[iso3] = name
                            if len(iso2) == 2:
                                alias_mapping[iso3] = iso2
                    if name_mapping:
                        return name_mapping, alias_mapping
        except Exception as exc:
            logger.warning("demografia.country_map_db_fallback_file", extra={"error": str(exc)})

    # Fallback a archivo local.
    try:
        from app.data import data_path

        with data_path("geo", "world.geojson").open("r", encoding="utf-8") as file:
            payload = json.load(file)
    except Exception:
        return {}, {}

    mapping: dict[str, str] = {}
    alias_mapping: dict[str, str] = {}
    features = payload.get("features")
    if not isinstance(features, list):
        return mapping, alias_mapping

    for feature in features:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            continue
        name = properties.get("ADMIN") or properties.get("NAME_LONG") or properties.get("NAME")
        if not isinstance(name, str) or not name.strip():
            continue
        codes = {
            properties.get("ISO_A2"),
            properties.get("ISO_A3"),
            properties.get("ADM0_A3"),
            properties.get("WB_A2"),
            properties.get("WB_A3"),
        }
        iso2 = str(properties.get("ISO_A2") or "").strip().upper()
        iso3 = str(properties.get("ISO_A3") or "").strip().upper()
        if len(iso2) == 2:
            alias_mapping[iso2] = iso2
            if len(iso3) == 3:
                alias_mapping[iso3] = iso2
        for code in codes:
            if isinstance(code, str) and code and code != "-99":
                mapping[code.upper()] = name
    return mapping, alias_mapping


COUNTRY_NAME_MAP, COUNTRY_CODE_ALIAS_MAP = _load_country_geo_maps()


def _canonical_country_code(value: str | None) -> str:
    raw = str(value or "").strip().upper()
    if not raw:
        return "UNK"
    return COUNTRY_CODE_ALIAS_MAP.get(raw, raw)


def _aggregate_top_sources(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    totals: dict[str, int] = {}
    for item in items:
        key = str(item.get("source") or "").strip().lower()
        if not key:
            continue
        totals[key] = totals.get(key, 0) + _to_number(item.get("total"))
    return [
        {"source": source, "total": total}
        for source, total in sorted(totals.items(), key=lambda kv: (-kv[1], kv[0]))[:5]
    ]


def _aggregate_top_utm(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    totals: dict[tuple[str, str, str], int] = {}
    for item in items:
        utm_source = str(item.get("utm_source") or "(none)").strip().lower() or "(none)"
        utm_medium = str(item.get("utm_medium") or "(none)").strip().lower() or "(none)"
        utm_campaign = str(item.get("utm_campaign") or "(none)").strip().lower() or "(none)"
        key = (utm_source, utm_medium, utm_campaign)
        totals[key] = totals.get(key, 0) + _to_number(item.get("total"))
    return [
        {
            "utm_source": source,
            "utm_medium": medium,
            "utm_campaign": campaign,
            "total": total,
        }
        for (source, medium, campaign), total in sorted(
            totals.items(),
            key=lambda kv: (-kv[1], kv[0][0], kv[0][1], kv[0][2]),
        )[:5]
    ]


def _aggregate_top_wa(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    totals: dict[tuple[str, str], int] = {}
    for item in items:
        canal = str(item.get("canal_publicitario") or "sin_canal").strip().lower() or "sin_canal"
        campana = (
            str(item.get("campana_publicitaria") or "sin_campana").strip().lower() or "sin_campana"
        )
        key = (canal, campana)
        totals[key] = totals.get(key, 0) + _to_number(item.get("total"))
    return [
        {
            "canal_publicitario": canal,
            "campana_publicitaria": campana,
            "total": total,
        }
        for (canal, campana), total in sorted(totals.items(), key=lambda kv: (-kv[1], kv[0][0], kv[0][1]))[:5]
    ]


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
        if level == "pais":
            key = _canonical_country_code(key)
            name = COUNTRY_NAME_MAP.get(key) or COUNTRY_NAME_MAP.get(str(raw.get("location_key") or "").upper()) or name
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
    jwt: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"p_nivel": nivel}
    if date_from:
        payload["p_from"] = date_from.isoformat()
    if date_to:
        payload["p_to"] = date_to.isoformat()

    rows = await _call_rpc("panel_visitantes_geo_resumen_ext", payload, jwt=jwt)
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
        "whatsapp_total": 0,
        "voz_total": 0,
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
        totals["whatsapp_total"] += item["whatsapp_total"]
        totals["voz_total"] += item["voz_total"]

    return {
        "items": items,
        "totals": totals,
    }


async def fetch_visitantes_resumen_v2(
    *,
    nivel: str,
    date_from: datetime | None,
    date_to: datetime | None,
    state_code: str | None = None,
    source_class: str | None = None,
    utm_source: str | None = None,
    utm_medium: str | None = None,
    utm_campaign: str | None = None,
    campaign_id: str | None = None,
    template_id: str | None = None,
    campaign_type: str | None = None,
    wa_canal_publicitario: str | None = None,
    wa_campana_publicitaria: str | None = None,
    wa_regla_id: str | None = None,
    jwt: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"p_nivel": nivel}
    if date_from:
        payload["p_from"] = date_from.isoformat()
    if date_to:
        payload["p_to"] = date_to.isoformat()
    if state_code:
        payload["p_estado"] = state_code
    if source_class:
        payload["p_source_class"] = source_class
    if utm_source:
        payload["p_utm_source"] = utm_source
    if utm_medium:
        payload["p_utm_medium"] = utm_medium
    if utm_campaign:
        payload["p_utm_campaign"] = utm_campaign
    if campaign_id:
        payload["p_cid"] = campaign_id
    if template_id:
        payload["p_tid"] = template_id
    if campaign_type:
        payload["p_campaign_type"] = campaign_type
    if wa_canal_publicitario:
        payload["p_wa_canal_publicitario"] = wa_canal_publicitario
    if wa_campana_publicitaria:
        payload["p_wa_campana_publicitaria"] = wa_campana_publicitaria
    if wa_regla_id:
        payload["p_wa_regla_id"] = wa_regla_id

    # v3 agrega fallback de webchat cuando falta trafico web; para mapa de conversion
    # mantenemos separacion estricta entre landing (web_sessions) y webchat.
    rows = await _call_rpc("panel_visitantes_geo_resumen_v2", payload, jwt=jwt)
    if not isinstance(rows, list):
        raise DemografiaServiceError(
            f"Respuesta inesperada de panel_visitantes_geo_resumen_v2: {rows!r}"
        )

    items: list[dict[str, Any]] = []
    grouped_by_key: dict[str, dict[str, Any]] = {}
    totals = {
        "total": 0,
        "con_chat": 0,
        "sin_chat": 0,
        "webchat_con_chat": 0,
        "webchat_sin_chat": 0,
        "whatsapp_total": 0,
        "voz_total": 0,
        "correo_total": 0,
        "sesiones_web_total": 0,
        "sesiones_webchat_total": 0,
        "conversaciones_whatsapp": 0,
        "conversaciones_voz": 0,
        "conversaciones_correo": 0,
    }

    for row in rows:
        if not isinstance(row, dict):
            continue
        sesiones_web_total = _to_number(row.get("sesiones_web_total"))
        sesiones_webchat_total = _to_number(row.get("sesiones_webchat_total"))
        sesiones_con_chat_webchat = _to_number(row.get("sesiones_con_chat_webchat"))
        sesiones_sin_chat_webchat = _to_number(row.get("sesiones_sin_chat_webchat"))
        conversaciones_whatsapp = _to_number(row.get("conversaciones_whatsapp"))
        conversaciones_voz = _to_number(row.get("conversaciones_voz"))
        conversaciones_correo = _to_number(row.get("conversaciones_correo"))
        wa_atribucion_total = _to_number(row.get("wa_atribucion_total"))

        fuentes_top = row.get("fuentes_top")
        if not isinstance(fuentes_top, list):
            fuentes_top = []
        utm_top = row.get("utm_top")
        if not isinstance(utm_top, list):
            utm_top = []
        wa_atribucion_top = row.get("wa_atribucion_top")
        if not isinstance(wa_atribucion_top, list):
            wa_atribucion_top = []

        item = {
            "level": str(row.get("location_level") or nivel),
            "key": str(row.get("location_key") or "UNK"),
            "name": str(row.get("location_name") or "Desconocido"),
            "total": sesiones_web_total,
            "con_chat": _to_number(row.get("visitas_con_chat")),
            "sin_chat": _to_number(row.get("visitas_sin_chat")),
            "webchat_total": _to_number(row.get("webchat_total")),
            "webchat_con_chat": _to_number(row.get("webchat_con_chat")),
            "webchat_sin_chat": _to_number(row.get("webchat_sin_chat")),
            "whatsapp_total": _to_number(row.get("whatsapp_total")),
            "voz_total": _to_number(row.get("voz_total")),
            "correo_total": _to_number(row.get("correo_total")),
            "sesiones_web_total": sesiones_web_total,
            "sesiones_webchat_total": sesiones_webchat_total,
            "sesiones_con_chat_webchat": sesiones_con_chat_webchat,
            "sesiones_sin_chat_webchat": sesiones_sin_chat_webchat,
            "conversaciones_whatsapp": conversaciones_whatsapp,
            "conversaciones_voz": conversaciones_voz,
            "conversaciones_correo": conversaciones_correo,
            "fuentes_top": fuentes_top,
            "utm_top": utm_top,
            "wa_atribucion_top": wa_atribucion_top,
            "wa_atribucion_total": wa_atribucion_total,
            "has_data": bool(row.get("has_data")),
        }

        if item["level"] == "pais":
            original_key = item["key"]
            canonical_key = _canonical_country_code(original_key)
            item["key"] = canonical_key
            item["name"] = COUNTRY_NAME_MAP.get(canonical_key) or COUNTRY_NAME_MAP.get(str(original_key).upper()) or item["name"]

            existing = grouped_by_key.get(canonical_key)
            if existing is None:
                grouped_by_key[canonical_key] = {
                    **item,
                    "_fuentes_buffer": list(item["fuentes_top"]),
                    "_utm_buffer": list(item["utm_top"]),
                    "_wa_buffer": list(item["wa_atribucion_top"]),
                }
            else:
                for field in (
                    "total",
                    "con_chat",
                    "sin_chat",
                    "webchat_total",
                    "webchat_con_chat",
                    "webchat_sin_chat",
                    "whatsapp_total",
                    "voz_total",
                    "correo_total",
                    "sesiones_web_total",
                    "sesiones_webchat_total",
                    "sesiones_con_chat_webchat",
                    "sesiones_sin_chat_webchat",
                    "conversaciones_whatsapp",
                    "conversaciones_voz",
                    "conversaciones_correo",
                    "wa_atribucion_total",
                ):
                    existing[field] = _to_number(existing.get(field)) + _to_number(item.get(field))
                existing["has_data"] = bool(existing.get("has_data") or item.get("has_data"))
                existing["_fuentes_buffer"].extend(item["fuentes_top"])
                existing["_utm_buffer"].extend(item["utm_top"])
                existing["_wa_buffer"].extend(item["wa_atribucion_top"])
        else:
            items.append(item)

        totals["total"] += sesiones_web_total
        totals["con_chat"] += item["con_chat"]
        totals["sin_chat"] += item["sin_chat"]
        totals["webchat_con_chat"] += item["webchat_con_chat"]
        totals["webchat_sin_chat"] += item["webchat_sin_chat"]
        totals["whatsapp_total"] += item["whatsapp_total"]
        totals["voz_total"] += item["voz_total"]
        totals["correo_total"] = totals.get("correo_total", 0) + item["correo_total"]
        totals["sesiones_web_total"] += sesiones_web_total
        totals["sesiones_webchat_total"] += sesiones_webchat_total
        totals["conversaciones_whatsapp"] += conversaciones_whatsapp
        totals["conversaciones_voz"] += conversaciones_voz
        totals["conversaciones_correo"] += conversaciones_correo
        totals["wa_atribucion_total"] = totals.get("wa_atribucion_total", 0) + wa_atribucion_total

    if grouped_by_key:
        for grouped in grouped_by_key.values():
            grouped["fuentes_top"] = _aggregate_top_sources(grouped.pop("_fuentes_buffer", []))
            grouped["utm_top"] = _aggregate_top_utm(grouped.pop("_utm_buffer", []))
            grouped["wa_atribucion_top"] = _aggregate_top_wa(grouped.pop("_wa_buffer", []))
            items.append(grouped)
        items.sort(key=lambda row: (_to_number(row.get("total")), str(row.get("name") or "")), reverse=True)

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
            if stage_code == "demo":
                bucket = "demo"
            elif stage_category == "ganada" or stage_code in {"cerrado_ganado", "ganado"}:
                bucket = "ganado"
            elif stage_category == "perdida" or stage_code in {"cerrado_perdido", "perdido"}:
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
                    "demo": 0,
                    "negociacion": 0,
                    "ganado": 0,
                    "perdido": 0,
                },
            )
            if bucket and bucket in state_totals:
                state_totals[bucket] += total
            canal = str(raw.get("canal") or "").strip().lower() or "desconocido"
            channel_totals = fallback_channel_totals.setdefault(state_key, {})
            channel_totals[canal] = channel_totals.get(canal, 0) + total

    combined: dict[str, dict[str, Any]] = {}

    def _should_include(key: str, *, allow_unknown: bool = False) -> bool:
        if nivel != "municipio" or not state_filter:
            return True
        if allow_unknown and key == "UNK":
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
                "leads_totales_por_canal": {},
                "visitantes_totales_por_canal": {},
                "totales_por_canal": {},
                "etapas_totales": {
                    "captado": 0,
                    "precalificado": 0,
                    "demo": 0,
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
        if stage_code == "demo":
            stage_bucket = "demo"
        elif stage_category == "ganada" or stage_code in {"cerrado_ganado", "ganado"}:
            stage_bucket = "ganado"
        elif stage_category == "perdida" or stage_code in {"cerrado_perdido", "perdido"}:
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
        if not _should_include(key, allow_unknown=True):
            continue
        entry = _ensure_entry(key, str(row.get("name") or "Desconocido"))
        # "total" llega desde fetch_visitantes_resumen_v2 como visitas al sitio (web_sessions).
        total_visitas = _to_number(row.get("total"))
        webchat_total = _to_number(row.get("webchat_total"))
        whatsapp_total = _to_number(row.get("whatsapp_total"))
        voz_total = _to_number(row.get("voz_total"))
        correo_total = _to_number(row.get("correo_total"))

        entry["visitantes_total"] += total_visitas
        entry["visitantes_con_chat"] += _to_number(row.get("con_chat"))
        entry["visitantes_sin_chat"] += _to_number(row.get("sin_chat"))
        if total_visitas > 0:
            entry["has_data"] = True

        visitantes_channels = entry["visitantes_totales_por_canal"]
        if total_visitas > 0:
            visitantes_channels["web"] = visitantes_channels.get("web", 0) + total_visitas
        if webchat_total > 0:
            visitantes_channels["webchat"] = visitantes_channels.get("webchat", 0) + webchat_total
        if whatsapp_total > 0:
            visitantes_channels["whatsapp"] = (
                visitantes_channels.get("whatsapp", 0) + whatsapp_total
            )
        if voz_total > 0:
            visitantes_channels["voz"] = visitantes_channels.get("voz", 0) + voz_total
        if correo_total > 0:
            visitantes_channels["correo"] = (
                visitantes_channels.get("correo", 0) + correo_total
            )
        if webchat_total > 0 or whatsapp_total > 0 or voz_total > 0 or correo_total > 0:
            entry["has_data"] = True

    result = []
    for entry in combined.values():
        entry["etapas_totales"] = {
            "captado": entry["etapas_totales"].get("captado", 0),
            "precalificado": entry["etapas_totales"].get("precalificado", 0),
            "demo": entry["etapas_totales"].get("demo", 0),
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
                entry["leads_totales_por_canal"][channel_key] = (
                    entry["leads_totales_por_canal"].get(channel_key, 0) + channel_value
                )

        leads_channels_sorted = dict(
            sorted(entry["leads_totales_por_canal"].items(), key=lambda item: item[0])
        )
        entry["leads_totales_por_canal"] = leads_channels_sorted

        visitantes_channels = entry["visitantes_totales_por_canal"]

        entry["totales_por_canal"] = {
            channel: value for channel, value in visitantes_channels.items() if value > 0
        }

        entry["conversacion_totales"] = {
            "con_conversacion": entry["visitantes_con_chat"],
            "sin_conversacion": entry["visitantes_sin_chat"],
        }
        entry["total_visitas"] = visitantes_channels.get("web", 0)
        entry["has_data"] = (
            entry["has_data"]
            or entry["total_visitas"] > 0
            or entry["leads_total"] > 0
            or any(value > 0 for value in visitantes_channels.values())
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
        if nivel == "pais":
            entry["next_level"] = "estado" if entry["key"] == "MX" else None
        elif nivel == "estado":
            entry["next_level"] = "municipio"
        else:
            entry["next_level"] = None
        if not entry["has_data"]:
            entry["next_level"] = None
        if (
            entry["total_visitas"] <= 0
            and entry["leads_total"] <= 0
            and not any(value > 0 for value in entry["visitantes_totales_por_canal"].values())
        ):
            continue

        normalized_entry = {
            "key": entry["key"],
            "name": entry["name"],
            "nivel": entry["nivel"],
            "leads_total": entry["leads_total"],
            "leads_totales_por_canal": entry["leads_totales_por_canal"],
            "totales_por_canal": entry["totales_por_canal"],
            "etapas_totales": entry["etapas_totales"],
            "conversacion_totales": entry["conversacion_totales"],
            "visitantes_total": entry["visitantes_total"],
            "visitantes_con_chat": entry["visitantes_con_chat"],
            "visitantes_sin_chat": entry["visitantes_sin_chat"],
            "visitantes_totales_por_canal": entry["visitantes_totales_por_canal"],
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
                    for key, value in unknown["leads_totales_por_canal"].items():
                        target["leads_totales_por_canal"][key] = (
                            target["leads_totales_por_canal"].get(key, 0) + value
                        )
                    for key, value in unknown["visitantes_totales_por_canal"].items():
                        target["visitantes_totales_por_canal"][key] = (
                            target["visitantes_totales_por_canal"].get(key, 0) + value
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
        for entry in result:
            code = str(entry.get("key") or "").upper()
            friendly = COUNTRY_NAME_MAP.get(code)
            if friendly:
                entry["name"] = friendly

    result.sort(key=lambda item: item["total_visitas"], reverse=True)
    return result
