"""Servicio auxiliar para enriquecer conversaciones con datos geográficos aproximados."""

from __future__ import annotations

import time
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_LOOPBACKS = {"127.0.0.1", "::1", ""}
_DEFAULT_ENDPOINT = "https://ipapi.co/{ip}/json/"
_FALLBACK_ENDPOINTS = (
    "https://ipwho.is/{ip}",
    "https://ip-api.com/json/{ip}",
)
_CACHE: dict[str, tuple[float, dict[str, Any] | None]] = {}
_NEGATIVE_TTL = 5 * 60  # TTL más corto para resultados fallidos


def _normalize_response(ip: str, data: dict[str, Any]) -> dict[str, Any]:
    country_code = (
        data.get("country_code")
        or data.get("countryCode")
        or data.get("country")
        or data.get("country_iso_code")
    )
    country_name = data.get("country_name") or data.get("countryName")
    if isinstance(country_code, str) and len(country_code.strip()) > 2 and not country_name:
        country_name = country_code
        country_code = None
    normalized = {
        "ip": ip,
        "city": data.get("city") or data.get("town"),
        "region": data.get("region") or data.get("regionName") or data.get("state"),
        "country_code": str(country_code).upper() if isinstance(country_code, str) else None,
        "country_name": country_name,
        "country": str(country_code).upper() if isinstance(country_code, str) else country_name,
        "latitude": data.get("latitude") or data.get("lat"),
        "longitude": data.get("longitude") or data.get("lon") or data.get("lng"),
        "timezone": data.get("timezone"),
        "asn": data.get("asn") or data.get("asn_org") or data.get("org"),
    }
    return {key: value for key, value in normalized.items() if value is not None}


async def lookup_ip(ip: str | None) -> dict[str, Any] | None:
    """Obtiene metadata geográfica aproximada para la dirección IP recibida.

    Retorna `None` si la IP es inválida o si la consulta falla.
    """

    if not ip or ip in _LOOPBACKS:
        return None

    ttl = max(int(settings.geolocation_cache_ttl_seconds or 0), 0)
    now = time.monotonic()
    cached = _CACHE.get(ip)
    if cached:
        timestamp, stored = cached
        # TTL dinámico: si el valor es None usamos TTL reducido
        effective_ttl = _NEGATIVE_TTL if stored is None and ttl else ttl
        if effective_ttl and now - timestamp < effective_ttl:
            return stored

    endpoint_template = settings.geolocation_api_url or _DEFAULT_ENDPOINT
    endpoints = [endpoint_template, *_FALLBACK_ENDPOINTS]

    headers: dict[str, str] = {}
    token = settings.geolocation_api_token
    if token:
        headers["Authorization"] = f"Bearer {token}"

    async with httpx.AsyncClient(timeout=5.0) as client:
        for position, template in enumerate(endpoints):
            url = template.format(ip=ip)
            request_headers = headers if position == 0 else {}
            try:
                response = await client.get(url, headers=request_headers)
            except httpx.RequestError as exc:  # pragma: no cover - depende de red externa
                logger.warning(
                    "No se pudo resolver geolocalización",
                    extra={"provider": template},
                    exc_info=exc,
                )
                continue

            if response.status_code >= 400:
                logger.warning(
                    "Geolocalización respondió con error",
                    extra={"status": response.status_code, "provider": template},
                )
                continue

            try:
                data = response.json()
            except ValueError:  # pragma: no cover - best effort
                continue

            if not isinstance(data, dict):
                continue

            result = _normalize_response(ip, data)
            if result:
                if ttl:
                    _CACHE[ip] = (now, result)
                return result

    if ttl:
        _CACHE[ip] = (now, None)
    return None
