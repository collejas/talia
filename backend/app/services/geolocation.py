"""Servicio auxiliar para enriquecer conversaciones con datos geográficos aproximados."""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_LOOPBACKS = {"127.0.0.1", "::1", ""}
_DEFAULT_ENDPOINT = "https://ipapi.co/{ip}/json/"


async def lookup_ip(ip: str | None) -> dict[str, Any] | None:
    """Obtiene metadata geográfica aproximada para la dirección IP recibida.

    Retorna `None` si la IP es inválida o si la consulta falla.
    """

    if not ip or ip in _LOOPBACKS:
        return None

    endpoint_template = settings.geolocation_api_url or _DEFAULT_ENDPOINT
    url = endpoint_template.format(ip=ip)

    headers: dict[str, str] = {}
    token = settings.geolocation_api_token
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            response = await client.get(url, headers=headers)
    except httpx.RequestError as exc:  # pragma: no cover - depende de red externa
        logger.warning("No se pudo resolver geolocalización", exc_info=exc)
        return None

    if response.status_code >= 400:
        logger.warning(
            "Geolocalización respondió con error", extra={"status": response.status_code}
        )
        return None

    try:
        data = response.json()
    except ValueError:  # pragma: no cover - best effort
        return None

    if not isinstance(data, dict):
        return None

    # Normalizamos campos más comunes de distintos proveedores.
    normalized = {
        "ip": ip,
        "city": data.get("city") or data.get("town"),
        "region": data.get("region") or data.get("regionName"),
        "country": data.get("country") or data.get("country_name") or data.get("countryCode"),
        "latitude": data.get("latitude") or data.get("lat"),
        "longitude": data.get("longitude") or data.get("lon") or data.get("lng"),
        "timezone": data.get("timezone"),
        "asn": data.get("asn") or data.get("asn_org") or data.get("org"),
    }

    # Removemos claves con valores None para evitar ruido.
    return {key: value for key, value in normalized.items() if value is not None}
