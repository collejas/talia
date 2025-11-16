"""Cliente para consultar la API DENUE del INEGI."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import quote

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_ALLOWED_DENUE_RADII = [250, 500, 1000, 5000]


class DenueError(RuntimeError):
    """Error al interactuar con DENUE."""


class DenueClient:
    def __init__(
        self,
        *,
        token: str | None = None,
        base_url: str | None = None,
        timeout: float = 20.0,
        pause_between_pages: float = 0.4,
    ) -> None:
        self.token = token or settings.denue_token
        self.base_url = (base_url or settings.denue_base_url).rstrip("/")
        self.timeout = timeout
        self.pause_between_pages = pause_between_pages

    @staticmethod
    def _normalize_radius(radius_m: int) -> int:
        radius = max(250, min(radius_m, 5000))
        closest = min(_ALLOWED_DENUE_RADII, key=lambda value: abs(value - radius))
        return closest

    async def search(
        self,
        *,
        query: str,
        latitude: float,
        longitude: float,
        radius_m: int,
    ) -> list[dict[str, Any]]:
        if not self.token:
            raise DenueError("denue_token_missing")
        if not query or not query.strip():
            raise DenueError("denue_query_required")
        radius = self._normalize_radius(radius_m)
        encoded_query = quote(query.strip(), safe="")
        lat = f"{float(latitude):.6f}"
        lng = f"{float(longitude):.6f}"
        url = (
            f"{self.base_url}/consulta/Buscar/{encoded_query}/"
            f"{lat},{lng}/{radius}/{self.token}/?type=json"
        )
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url)
        except httpx.RequestError as exc:  # pragma: no cover - depende de red
            logger.exception("denue.request_error", extra={"error": str(exc)})
            raise DenueError("denue_request_failed") from exc
        if resp.status_code >= 400:
            detail = await self._safe_text(resp)
            logger.error(
                "denue.http_error",
                extra={"status": resp.status_code, "detail": detail},
            )
            raise DenueError(f"denue_http_{resp.status_code}")
        try:
            data = resp.json()
        except ValueError:
            detail = await self._safe_text(resp)
            text = detail.strip()
            if not text:
                logger.warning("denue.empty_response")
                return []
            try:
                data = json.loads(text)
            except ValueError as exc:
                logger.exception("denue.invalid_json", extra={"detail": text[:500]})
                raise DenueError("denue_invalid_response") from exc
        if isinstance(data, dict) and data.get("error"):
            message = data.get("error") or data.get("message") or "denue_error"
            raise DenueError(message)
        if not isinstance(data, list):
            return []
        return data

    @staticmethod
    async def _safe_text(resp: httpx.Response) -> str:
        try:
            return resp.text
        except Exception:  # pragma: no cover - acceso improbable
            return ""


def normalize_denue_place(place: dict[str, Any]) -> dict[str, Any]:
    """Normaliza un registro crudo de DENUE a la estructura esperada en resultados."""
    external_id = place.get("Id") or place.get("id")
    address = _build_denue_address(place)
    actividad = _clean_text(place.get("Clase_actividad"))
    estrato = _clean_text(place.get("Estrato"))
    phone = _clean_text(place.get("Telefono"))
    email = _clean_text(place.get("Correo_e"))
    website = _clean_text(place.get("Sitio_internet"))

    return {
        "external_id": str(external_id) if external_id is not None else None,
        "clee": None,
        "name": _clean_text(place.get("Nombre")),
        "razon_social": _clean_text(place.get("Razon_social")),
        "actividad": actividad,
        "estrato": estrato,
        "phone": phone,
        "email": email,
        "website": website,
        "address": address,
        "lat": _to_float(place.get("Latitud")),
        "lng": _to_float(place.get("Longitud")),
        "rating": None,
        "reviews": None,
        "maps_url": _clean_text(place.get("Ubicacion")),
        "raw": place,
    }


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return str(value)


def _build_denue_address(place: dict[str, Any]) -> str | None:
    components: list[str] = []
    vialidad = " ".join(
        filter(
            None,
            [
                _clean_text(place.get("Tipo_vialidad")),
                _clean_text(place.get("Nombre_vialidad")),
            ],
        )
    ).strip()
    if vialidad:
        components.append(vialidad)
    numero = " ".join(
        filter(
            None,
            [
                _clean_text(place.get("Numero_exterior")),
                _clean_text(place.get("Numero_interior")),
            ],
        )
    ).strip()
    if numero:
        components.append(numero)
    for key in ["Colonia", "CP", "Municipio", "Entidad"]:
        value = _clean_text(place.get(key))
        if value:
            components.append(value)
    ubicacion = _clean_text(place.get("Ubicacion"))
    if ubicacion:
        components.append(ubicacion)
    if not components:
        return None
    return ", ".join(dict.fromkeys(filter(None, components)))


def _to_float(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


__all__ = ["DenueClient", "DenueError", "normalize_denue_place"]
