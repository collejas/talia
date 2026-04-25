"""Cliente para consultar la API DENUE del INEGI."""

from __future__ import annotations

import json
import random
import asyncio
from typing import Any, Literal
from urllib.parse import quote

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.data.geo.locations import list_municipalities_for_state
from app.services.result_identity import build_result_dedupe_key

logger = get_logger(__name__)
search_logger = get_logger("app.prospeccion.busquedas")

_ALLOWED_DENUE_RADII = [250, 500, 1000, 5000]
_DENUE_MIN_SPLIT_WINDOW = 25

_DENUE_HTTP_TIMEOUT = httpx.Timeout(connect=20.0, read=30.0, write=20.0, pool=30.0)
_DENUE_HTTP_LIMITS = httpx.Limits(max_keepalive_connections=20, max_connections=50, keepalive_expiry=30.0)
_DENUE_HTTP_CLIENT: httpx.AsyncClient | None = None


def _get_denue_http_client(timeout: float) -> httpx.AsyncClient:
    global _DENUE_HTTP_CLIENT  # noqa: PLW0603
    if _DENUE_HTTP_CLIENT is None:
        _DENUE_HTTP_CLIENT = httpx.AsyncClient(
            timeout=_DENUE_HTTP_TIMEOUT,
            limits=_DENUE_HTTP_LIMITS,
            follow_redirects=True,
            headers={"User-Agent": "talia/denue"},
        )
    # Si el caller pide un timeout más estricto, no lo aplicamos al singleton.
    # El timeout base ya es razonable y evita recrear clientes por request.
    _ = timeout
    return _DENUE_HTTP_CLIENT


def _invalidate_denue_http_client(client: httpx.AsyncClient | None = None) -> None:
    """Descarta el cliente compartido cuando el pool queda en un estado inválido."""
    global _DENUE_HTTP_CLIENT  # noqa: PLW0603
    if client is not None and client is not _DENUE_HTTP_CLIENT:
        return
    _DENUE_HTTP_CLIENT = None


def expand_state_to_municipalities(state_code: str | None) -> list[tuple[str | None, str | None]]:
    """Expande un estado en sus municipios para búsquedas DENUE más robustas."""
    state = str(state_code or "").strip().zfill(2)
    if not state or state == "00":
        return []
    municipalities = list_municipalities_for_state(state)
    if not municipalities:
        return []
    return [(state, municipio.get("code")) for municipio in municipalities if municipio.get("code")]


def expand_targets_for_area_act(
    targets: list[tuple[str | None, str | None]],
) -> list[tuple[str | None, str | None]]:
    """Expande solo los estados problemáticos a nivel de municipio antes de consultar DENUE."""
    expanded: list[tuple[str | None, str | None]] = []
    for state, municipality in targets:
        normalized_state = str(state or "").strip().zfill(2)
        if normalized_state == "01" and municipality is None:
            fallback = expand_state_to_municipalities(normalized_state)
            if fallback:
                expanded.extend(fallback)
                continue
        expanded.append((state, municipality))
    seen: set[tuple[str | None, str | None]] = set()
    unique: list[tuple[str | None, str | None]] = []
    for pair in expanded:
        if pair in seen:
            continue
        seen.add(pair)
        unique.append(pair)
    return unique


def expand_denue_activity_codes(codes: list[str] | None) -> list[str]:
    """Expande códigos SCIAN compuestos a códigos consultables por DENUE."""
    if not codes:
        return []

    expanded: list[str] = []
    for raw_code in codes:
        code = str(raw_code or "").strip()
        if not code:
            continue
        if code == "0":
            return ["0"]

        parts = [part.strip() for part in code.split("-") if part.strip()]
        if (
            len(parts) == 2
            and all(part.isdigit() and len(part) == 2 for part in parts)
        ):
            start = int(parts[0])
            end = int(parts[1])
            if start <= end:
                expanded.extend([f"{value:02d}" for value in range(start, end + 1)])
                continue

        expanded.append(code)

    return list(dict.fromkeys(expanded))


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

    async def _get(self, url: str, *, method: str, segments: list[str] | None = None) -> httpx.Response:
        max_attempts = 3
        for attempt in range(1, max_attempts + 1):
            client = _get_denue_http_client(self.timeout)
            try:
                return await client.get(url)
            except httpx.ConnectTimeout as exc:
                search_logger.warning(
                    "denue.connect_timeout",
                    extra={
                        "attempt": attempt,
                        "max_attempts": max_attempts,
                        "method": method,
                        "segments": segments,
                        "url": url,
                    },
                )
                if attempt >= max_attempts:
                    raise DenueError("denue_connect_timeout") from exc
            except httpx.ReadTimeout as exc:
                search_logger.warning(
                    "denue.read_timeout",
                    extra={
                        "attempt": attempt,
                        "max_attempts": max_attempts,
                        "method": method,
                        "segments": segments,
                        "url": url,
                    },
                )
                if attempt >= max_attempts:
                    raise DenueError("denue_read_timeout") from exc
            except httpx.RemoteProtocolError as exc:
                logger.exception("denue.request_error", extra={"error": str(exc)})
                search_logger.exception(
                    "denue.request_error",
                    extra={"error": str(exc), "method": method, "segments": segments, "url": url},
                )
                _invalidate_denue_http_client(client)
                if attempt >= max_attempts:
                    raise DenueError("denue_remote_protocol_error") from exc
            except httpx.RequestError as exc:  # pragma: no cover - depende de red
                logger.exception("denue.request_error", extra={"error": str(exc)})
                search_logger.exception(
                    "denue.request_error",
                    extra={"error": str(exc), "method": method, "segments": segments, "url": url},
                )
                if attempt >= max_attempts:
                    raise DenueError("denue_request_failed") from exc
            # backoff con jitter
            delay = min(8.0, 0.7 * (2 ** (attempt - 1)) + random.random() * 0.4)
            await asyncio.sleep(delay)
        raise DenueError("denue_request_failed")

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
            f"{lat},{lng}/{radius}/{self.token}"
        )
        search_logger.info(
            "denue.request_path",
            extra={
                "method": "Buscar",
                "query": query,
                "lat": lat,
                "lng": lng,
                "radius": radius,
                "url": url,
            },
        )
        resp = await self._get(url, method="Buscar")
        if resp.status_code >= 400:
            detail = await self._safe_text(resp)
            logger.error(
                "denue.http_error",
                extra={"status": resp.status_code, "detail": detail},
            )
            search_logger.error(
                "denue.http_error",
                extra={"status": resp.status_code, "detail": detail, "url": url},
            )
            raise DenueError(f"denue_http_{resp.status_code}")
        try:
            data = resp.json()
        except ValueError:
            detail = await self._safe_text(resp)
            text = detail.strip()
            if not text:
                logger.warning("denue.empty_response")
                search_logger.warning("denue.empty_response", extra={"url": url})
                return []
            try:
                data = json.loads(text)
            except ValueError as exc:
                logger.exception("denue.invalid_json", extra={"detail": text[:500]})
                search_logger.exception("denue.invalid_json", extra={"detail": text[:500], "url": url})
                raise DenueError("denue_invalid_response") from exc
        return self._coerce_rows(data, method="Buscar", url=url)

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
        path = f"{self.base_url}/consulta/{method}/{'/'.join(segments)}/{self.token}"
        search_logger.info(
            "denue.request_path",
            extra={"method": method, "segments": segments, "url": path},
        )
        try:
            resp = await self._get(path, method=method, segments=segments)
        except DenueError as exc:
            if self._should_treat_remote_protocol_error_as_empty(method, segments, exc):
                search_logger.info(
                    "denue.empty_result",
                    extra={"method": method, "segments": segments, "url": path, "reason": "remote_protocol_empty"},
                )
                return []
            split_results = await self._retry_request_list_with_split(method, segments, exc)
            if split_results is not None:
                return split_results
            raise
        if resp.status_code >= 400:
            detail = await self._safe_text(resp)
            logger.error(
                "denue.http_error",
                extra={"status": resp.status_code, "detail": detail},
            )
            search_logger.error(
                "denue.http_error",
                extra={"status": resp.status_code, "detail": detail, "method": method, "url": path},
            )
            raise DenueError(f"denue_http_{resp.status_code}")
        try:
            data = resp.json()
        except ValueError:
            detail = await self._safe_text(resp)
            text = detail.strip()
            if not text:
                logger.warning("denue.empty_response")
                search_logger.warning(
                    "denue.empty_response",
                    extra={"method": method, "segments": segments, "url": path},
                )
                return []
            try:
                data = json.loads(text)
            except ValueError as exc:
                logger.exception("denue.invalid_json", extra={"detail": text[:500]})
                search_logger.exception(
                    "denue.invalid_json",
                    extra={"detail": text[:500], "method": method, "segments": segments, "url": path},
                )
                raise DenueError("denue_invalid_response") from exc
        return self._coerce_rows(data, method=method, url=path)

    @staticmethod
    def _coerce_rows(data: Any, *, method: str, url: str) -> list[dict[str, Any]]:
        if isinstance(data, list):
            return data
        if not isinstance(data, dict):
            raise DenueError("denue_invalid_response")

        message = data.get("error") or data.get("message")
        if message:
            raise DenueError(str(message))

        row_keys = (
            "rows",
            "results",
            "registros",
            "items",
            "data",
        )
        for key in row_keys:
            rows = data.get(key)
            if isinstance(rows, list):
                return rows

        count_keys = (
            "total",
            "count",
            "total_count",
            "num_registros",
            "registro_total",
        )
        for key in count_keys:
            value = data.get(key)
            if value is None:
                continue
            try:
                if int(value) == 0:
                    search_logger.info(
                        "denue.empty_result",
                        extra={"method": method, "url": url, "key": key},
                    )
                    return []
            except (TypeError, ValueError):
                continue

        if not data:
            search_logger.info("denue.empty_result", extra={"method": method, "url": url, "reason": "empty_dict"})
            return []

        empty_values = (None, "", 0, 0.0, False)
        if all(value in empty_values or value == [] for value in data.values()):
            search_logger.info("denue.empty_result", extra={"method": method, "url": url, "reason": "empty_values"})
            return []

        raise DenueError("denue_invalid_response")

    async def _retry_request_list_with_split(
        self,
        method: str,
        segments: list[str],
        exc: DenueError,
    ) -> list[dict[str, Any]] | None:
        if str(exc) not in {
            "denue_request_failed",
            "denue_connect_timeout",
            "denue_read_timeout",
            "denue_remote_protocol_error",
        }:
            return None
        window = self._extract_batch_window(method, segments)
        if window is None:
            return None
        start_idx, end_idx = window
        try:
            start = int(segments[start_idx])
            end = int(segments[end_idx])
        except (TypeError, ValueError):
            return None
        if end <= start:
            return None
        size = end - start + 1
        if size <= _DENUE_MIN_SPLIT_WINDOW:
            return None

        mid = start + (size // 2) - 1
        left = list(segments)
        right = list(segments)
        left[end_idx] = str(mid)
        right[start_idx] = str(mid + 1)

        search_logger.warning(
            "denue.request_split_retry",
            extra={
                "method": method,
                "segments": segments,
                "window": {"start": start, "end": end, "size": size},
                "split_at": mid,
            },
        )
        left_rows = await self._request_list(method, left)
        right_rows = await self._request_list(method, right)
        return self._merge_rows(left_rows, right_rows)

    @staticmethod
    def _extract_batch_window(method: str, segments: list[str]) -> tuple[int, int] | None:
        if method == "BuscarEntidad" and len(segments) >= 4:
            return (2, 3)
        if method in {"BuscarAreaAct", "BuscarAreaActEstr"} and len(segments) >= 13:
            return (10, 11)
        return None

    @staticmethod
    def _should_treat_remote_protocol_error_as_empty(method: str, segments: list[str], exc: DenueError) -> bool:
        if str(exc) != "denue_remote_protocol_error":
            return False
        if method not in {"BuscarAreaAct", "BuscarAreaActEstr"}:
            return False
        window = DenueClient._extract_batch_window(method, segments)
        if window is None:
            return False
        start_idx, end_idx = window
        try:
            start = int(segments[start_idx])
            end = int(segments[end_idx])
        except (TypeError, ValueError, IndexError):
            return False
        return (end - start + 1) <= _DENUE_MIN_SPLIT_WINDOW

    @staticmethod
    def _merge_rows(*groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
        merged: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for group in groups:
            for row in group:
                if not isinstance(row, dict):
                    continue
                external_id = row.get("Id") or row.get("id")
                key = str(external_id) if external_id is not None else None
                if key and key in seen_ids:
                    continue
                if key:
                    seen_ids.add(key)
                merged.append(row)
        return merged

    @staticmethod
    def _normalize_geo_segment(value: str | None, length: int, default: str = "0") -> str:
        if not value:
            return default
        normalized = "".join(ch for ch in value if ch.isdigit())
        if not normalized:
            return default
        return normalized.zfill(length)[:length]

    @staticmethod
    def _build_activity_segments(codigo: str | None) -> tuple[str, str, str, str]:
        """
        DENUE (BuscarAreaAct*) usa 4 segmentos de actividad económica.

        Ejemplos:
        - "46"      -> ("46", "0", "0", "0")
        - "464"     -> ("46", "464", "0", "0")
        - "4641"    -> ("46", "464", "4641", "0")
        - "46411"   -> ("46", "464", "4641", "46411")
        - "464112"  -> ("46", "464", "4641", "464112")
        - None/"0"  -> ("0", "0", "0", "0")  (todas las actividades)
        """

        if not codigo:
            return ("0", "0", "0", "0")
        only_digits = "".join(ch for ch in codigo if ch.isdigit()).strip()
        if not only_digits or only_digits == "0":
            return ("0", "0", "0", "0")
        segmento_clase = "0"
        if len(only_digits) >= 6:
            segmento_clase = only_digits[:6]
        elif len(only_digits) >= 5:
            segmento_clase = only_digits[:5]
        return (
            only_digits[:2] if len(only_digits) >= 2 else "0",
            only_digits[:3] if len(only_digits) >= 3 else "0",
            only_digits[:4] if len(only_digits) >= 4 else "0",
            segmento_clase,
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
        municipio_code = self._normalize_geo_segment(municipio, 3, default="0")
        localidad_code = self._normalize_geo_segment(localidad, 4, default="0")
        ageb_code = self._normalize_geo_segment(ageb, 4, default="0")
        manzana_code = self._normalize_geo_segment(manzana, 3, default="0")
        segmento_sector, segmento_subsector, segmento_rama, segmento_clase = self._build_activity_segments(
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
    dedupe_key = build_result_dedupe_key(
        "denue",
        external_id=external_id,
        name=place.get("Nombre"),
        razon_social=place.get("Razon_social"),
        address=address,
        phone=phone,
        email=email,
        website=website,
        actividad=actividad,
        estrato=estrato_label,
    )

    return {
        "external_id": str(external_id) if external_id is not None else None,
        "clee": None,
        "dedupe_key": dedupe_key,
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


__all__ = [
    "DenueClient",
    "DenueError",
    "expand_denue_activity_codes",
    "expand_state_to_municipalities",
    "expand_targets_for_area_act",
    "normalize_denue_place",
]
