"""Cliente liviano para consultar tipos de cambio de Banxico."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_BANXICO_HTTP_TIMEOUT = httpx.Timeout(connect=10.0, read=15.0, write=10.0, pool=15.0)
_BANXICO_HTTP_LIMITS = httpx.Limits(max_keepalive_connections=10, max_connections=20, keepalive_expiry=30.0)
_BANXICO_HTTP_CLIENT: httpx.AsyncClient | None = None
_BANXICO_CACHE_TTL_SECONDS = 60 * 60 * 6
_BANXICO_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}

_BANXICO_SERIES_BY_CURRENCY: dict[str, tuple[str, str]] = {
    "USD": ("SF43718", "Pesos por dólar. FIX"),
    "EUR": ("SF46410", "Euro"),
    "JPY": ("SF46406", "Yen japonés"),
    "GBP": ("SF46407", "Libra esterlina"),
    "CAD": ("SF60632", "Dólar canadiense"),
}


class BanxicoError(RuntimeError):
    """Error al consultar el servicio de Banxico."""


@dataclass(slots=True)
class BanxicoTipoCambio:
    moneda: str
    serie: str
    descripcion: str
    tipo_cambio: float
    fecha: date | None
    fuente: str
    fuente_url: str
    actualizado_en: datetime


def _get_banxico_http_client() -> httpx.AsyncClient:
    global _BANXICO_HTTP_CLIENT  # noqa: PLW0603
    if _BANXICO_HTTP_CLIENT is None:
        _BANXICO_HTTP_CLIENT = httpx.AsyncClient(
            timeout=_BANXICO_HTTP_TIMEOUT,
            limits=_BANXICO_HTTP_LIMITS,
            follow_redirects=True,
            headers={"User-Agent": "talia/banxico"},
        )
    return _BANXICO_HTTP_CLIENT


def _normalize_currency(moneda: str) -> str:
    return str(moneda or "").strip().upper()


def _normalize_decimal(value: Any) -> Decimal:
    text = str(value or "").strip().replace(",", "")
    if not text:
        raise InvalidOperation
    return Decimal(text)


def _extract_series_point(payload: Any) -> tuple[str, str] | None:
    if isinstance(payload, dict):
        normalized = {str(key).split(":", 1)[-1].lower(): value for key, value in payload.items()}
        dato = normalized.get("dato")
        fecha = normalized.get("fecha")
        if dato is not None and fecha is not None:
            dato_text = str(dato).strip()
            fecha_text = str(fecha).strip()
            if dato_text and fecha_text:
                return dato_text, fecha_text
        for value in payload.values():
            found = _extract_series_point(value)
            if found:
                return found
    elif isinstance(payload, list):
        for item in payload:
            found = _extract_series_point(item)
            if found:
                return found
    return None


def _extract_series_point_from_xml(text: str) -> tuple[str, str] | None:
    dato_match = re.search(r"<(?:[^:>]+:)?dato\b[^>]*>\s*([^<]+?)\s*</(?:[^:>]+:)?dato>", text, re.IGNORECASE)
    fecha_match = re.search(r"<(?:[^:>]+:)?fecha\b[^>]*>\s*([^<]+?)\s*</(?:[^:]+:)?fecha>", text, re.IGNORECASE)
    if not dato_match or not fecha_match:
        return None
    dato = dato_match.group(1).strip()
    fecha = fecha_match.group(1).strip()
    if not dato or not fecha:
        return None
    return dato, fecha


def _parse_banxico_point(payload: Any) -> tuple[Decimal, date]:
    found: tuple[str, str] | None = None
    if isinstance(payload, (dict, list)):
        found = _extract_series_point(payload)
    if not found:
        text = str(payload or "")
        found = _extract_series_point_from_xml(text)
    if not found:
        raise BanxicoError("banxico_response_without_series_point")

    dato_text, fecha_text = found
    try:
        tipo_cambio = _normalize_decimal(dato_text)
    except InvalidOperation as exc:  # pragma: no cover - depende del proveedor
        raise BanxicoError("banxico_invalid_rate") from exc

    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            fecha = datetime.strptime(fecha_text, fmt).date()
            return tipo_cambio, fecha
        except ValueError:
            continue
    raise BanxicoError("banxico_invalid_date")


async def fetch_banxico_tipo_cambio(moneda: str) -> BanxicoTipoCambio:
    normalized_currency = _normalize_currency(moneda)
    if not normalized_currency:
        raise BanxicoError("banxico_currency_required")
    if normalized_currency == "MXN":
        now = datetime.now(timezone.utc)
        return BanxicoTipoCambio(
            moneda="MXN",
            serie="MXN",
            descripcion="Peso mexicano",
            tipo_cambio=1.0,
            fecha=now.date(),
            fuente="Interno",
            fuente_url="",
            actualizado_en=now,
        )

    series_info = _BANXICO_SERIES_BY_CURRENCY.get(normalized_currency)
    if series_info is None:
        raise BanxicoError("moneda_no_soportada_en_banxico")

    token = str(settings.banxico_token or "").strip()
    if not token:
        raise BanxicoError("banxico_token_missing")

    cached = _BANXICO_CACHE.get(normalized_currency)
    now_ts = datetime.now(timezone.utc).timestamp()
    if cached and now_ts - cached[0] <= _BANXICO_CACHE_TTL_SECONDS:
        cached_payload = cached[1]
        return BanxicoTipoCambio(
            moneda=str(cached_payload["moneda"]),
            serie=str(cached_payload["serie"]),
            descripcion=str(cached_payload["descripcion"]),
            tipo_cambio=float(cached_payload["tipo_cambio"]),
            fecha=date.fromisoformat(cached_payload["fecha"]) if cached_payload.get("fecha") else None,
            fuente=str(cached_payload["fuente"]),
            fuente_url=str(cached_payload["fuente_url"]),
            actualizado_en=datetime.fromisoformat(cached_payload["actualizado_en"]),
        )

    serie, descripcion = series_info
    url = f"{settings.banxico_base_url.rstrip('/')}/{serie}/datos/oportuno"
    client = _get_banxico_http_client()
    try:
        response = await client.get(
            url,
            headers={
                "Accept": "application/json, text/plain, */*",
                "Bmx-Token": token,
            },
        )
    except httpx.RequestError as exc:  # pragma: no cover - depende de red
        raise BanxicoError("banxico_request_failed") from exc

    if response.status_code >= 400:
        logger.warning(
            "banxico.http_error",
            extra={
                "status_code": response.status_code,
                "url": url,
                "moneda": normalized_currency,
            },
        )
        raise BanxicoError(f"banxico_http_{response.status_code}")

    payload: Any
    try:
        payload = response.json()
    except ValueError:
        payload = response.text

    tipo_cambio_decimal, fecha = _parse_banxico_point(payload)
    resultado = BanxicoTipoCambio(
        moneda=normalized_currency,
        serie=serie,
        descripcion=descripcion,
        tipo_cambio=float(tipo_cambio_decimal),
        fecha=fecha,
        fuente="Banxico SIE",
        fuente_url=url,
        actualizado_en=datetime.now(timezone.utc),
    )
    _BANXICO_CACHE[normalized_currency] = (
        resultado.actualizado_en.timestamp(),
        {
            "moneda": resultado.moneda,
            "serie": resultado.serie,
            "descripcion": resultado.descripcion,
            "tipo_cambio": resultado.tipo_cambio,
            "fecha": resultado.fecha.isoformat() if resultado.fecha else None,
            "fuente": resultado.fuente,
            "fuente_url": resultado.fuente_url,
            "actualizado_en": resultado.actualizado_en.isoformat(),
        },
    )
    return resultado
