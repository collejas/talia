"""Cliente para consultar la API DENUE del INEGI."""

from __future__ import annotations

import json
from typing import Any, Literal
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

    async def search_by_entidad(
        self,
        *,
        condicion: str,
        entidad: str | None = None,
        registro_inicial: int = 1,
        registro_final: int = 15,
    ) -> list[dict[str, Any]]:
        cleaned = (condicion or "").strip() or "todos"
        entidad_code = self._normalize_geo_segment(entidad, 2, default="00")
        segments = [
            quote(cleaned, safe=""),
            entidad_code,
            str(registro_inicial),
            str(max(registro_final, registro_inicial)),
        ]
        return await self._request_list("BuscarEntidad", segments)

    async def search_area_act(
        self,
        *,
        entidad: str | None = None,
        municipio: str | None = None,
        localidad: str | None = None,
        ageb: str | None = None,
        manzana: str | None = None,
        actividad_codigo: str | None = None,
        texto: str | None = None,
        registro_inicial: int = 1,
        registro_final: int = 15,
    ) -> list[dict[str, Any]]:
        segments = self._build_area_segments(
            entidad=entidad,
            municipio=municipio,
            localidad=localidad,
            ageb=ageb,
            manzana=manzana,
            actividad_codigo=actividad_codigo,
            texto=texto,
            registro_inicial=registro_inicial,
            registro_final=registro_final,
            tipo="BuscarAreaAct",
        )
        return await self._request_list("BuscarAreaAct", segments)

    async def search_area_act_estr(
        self,
        *,
        entidad: str | None = None,
        municipio: str | None = None,
        localidad: str | None = None,
        ageb: str | None = None,
        manzana: str | None = None,
        actividad_codigo: str | None = None,
        texto: str | None = None,
        registro_inicial: int = 1,
        registro_final: int = 15,
        estrato: str | None = None,
    ) -> list[dict[str, Any]]:
        segments = self._build_area_segments(
            entidad=entidad,
            municipio=municipio,
            localidad=localidad,
            ageb=ageb,
            manzana=manzana,
            actividad_codigo=actividad_codigo,
            texto=texto,
            registro_inicial=registro_inicial,
            registro_final=registro_final,
            tipo="BuscarAreaActEstr",
            estrato=estrato,
        )
        return await self._request_list("BuscarAreaActEstr", segments)

    async def _request_list(self, method: str, segments: list[str]) -> list[dict[str, Any]]:
        path = f"{self.base_url}/consulta/{method}/{'/'.join(segments)}/{self.token}/?type=json"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(path)
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
    def _normalize_geo_segment(value: str | None, length: int, default: str = "0") -> str:
        if not value:
            return default
        normalized = "".join(ch for ch in value if ch.isdigit())
        if not normalized:
            return default
        return normalized.zfill(length)[:length]

    @staticmethod
    def _build_activity_segments(codigo: str | None) -> tuple[str, str, str, str, str]:
        if not codigo:
            return ("00", "000", "0000", "00000", "000000")
        only_digits = "".join(ch for ch in codigo if ch.isdigit())
        return (
            only_digits[:2].ljust(2, "0"),
            only_digits[:3].ljust(3, "0"),
            only_digits[:4].ljust(4, "0"),
            only_digits[:5].ljust(5, "0"),
            only_digits[:6].ljust(6, "0"),
        )

    def _build_area_segments(
        self,
        *,
        entidad: str | None,
        municipio: str | None,
        localidad: str | None,
        ageb: str | None,
        manzana: str | None,
        actividad_codigo: str | None,
        texto: str | None,
        registro_inicial: int,
        registro_final: int,
        tipo: Literal["BuscarAreaAct", "BuscarAreaActEstr"],
        estrato: str | None = None,
    ) -> list[str]:
        entidad_code = self._normalize_geo_segment(entidad, 2, default="00")
        municipio_code = self._normalize_geo_segment(municipio, 3, default="000")
        localidad_code = self._normalize_geo_segment(localidad, 4, default="0000")
        ageb_code = self._normalize_geo_segment(ageb, 4, default="0000")
        manzana_code = self._normalize_geo_segment(manzana, 3, default="000")
        segmento_sector, segmento_subsector, segmento_rama, segmento_subrama, segmento_clase = self._build_activity_segments(
            actividad_codigo,
        )
        nombre = (texto or "").strip() or "0"
        segments = [
            entidad_code,
            municipio_code,
            localidad_code,
            ageb_code,
            manzana_code,
            segmento_sector,
            segmento_subsector,
            segmento_rama,
            segmento_subrama,
            segmento_clase,
            quote(nombre, safe=""),
            str(registro_inicial),
            str(max(registro_final, registro_inicial)),
            "0",
        ]
        if tipo == "BuscarAreaActEstr":
            estrato_code = (estrato or "").strip() or "0"
            segments.append(estrato_code)
        return segments


def normalize_denue_place(place: dict[str, Any]) -> dict[str, Any]:
    """Normaliza un registro crudo de DENUE a la estructura esperada en resultados."""
    external_id = place.get("Id") or place.get("id")
    address = _build_denue_address(place)
    actividad = _clean_text(place.get("Clase_actividad"))
    estrato_raw = _clean_text(place.get("Estrato"))
    estrato_label = _classify_estrato(estrato_raw)
    phone = _clean_text(place.get("Telefono"))
    email = _clean_text(place.get("Correo_e"))
    website = _clean_text(place.get("Sitio_internet"))

    return {
        "external_id": str(external_id) if external_id is not None else None,
        "clee": None,
        "name": _clean_text(place.get("Nombre")),
        "razon_social": _clean_text(place.get("Razon_social")),
        "actividad": actividad,
        "estrato": estrato_label,
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


def _classify_estrato(raw: str | None) -> str | None:
    """Convierte el valor crudo de estrato en una etiqueta estándar."""
    if raw is None:
        return None
    normalized = raw.strip().lower()
    if not normalized:
        return None
    # Intentar detectar directamente por palabras clave.
    if "micro" in normalized:
        return "Micro (0-10 personas)"
    if "peque" in normalized:
        return "Pequeña (11-50 personas)"
    if "mediana" in normalized:
        return "Mediana (51-250 personas)"
    if "grande" in normalized or "251" in normalized:
        return "Grande (250+ personas)"
    # Algunos catálogos usan dígitos 1-7.
    digit = None
    if normalized.isdigit():
        digit = int(normalized)
    else:
        # Busca números dentro del texto.
        for ch in normalized:
            if ch.isdigit():
                digit = int(ch)
                break
    if digit is not None:
        if digit <= 2:
            return "Micro (0-10 personas)"
        if digit == 3 or digit == 4:
            return "Pequeña (11-50 personas)"
        if digit == 5 or digit == 6:
            return "Mediana (51-250 personas)"
        return "Grande (250+ personas)"
    return raw


__all__ = ["DenueClient", "DenueError", "normalize_denue_place"]
