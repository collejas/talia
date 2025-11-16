"""Cliente ligero para consumir Google Places API (búsqueda y normalización)."""

from __future__ import annotations

import asyncio
from math import cos, radians
from typing import Any, Literal, Sequence

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

GoogleSearchStrategy = Literal["nearby", "text"]


class GooglePlacesError(RuntimeError):
    """Error base al interactuar con Google Places."""


class GooglePlacesClient:
    """Encapsula llamadas a Google Places API."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        nearby_url: str | None = None,
        text_url: str | None = None,
        field_mask: str | None = None,
        default_language: str | None = None,
        default_region: str | None = None,
        timeout: float = 15.0,
        pause_between_pages: float = 2.0,
    ) -> None:
        self.api_key = api_key or settings.google_places_api_key
        self.nearby_url = nearby_url or settings.google_places_nearby_url
        self.text_url = text_url or settings.google_places_text_url
        raw_field_mask = field_mask or settings.google_places_field_mask
        self.field_mask = _sanitize_field_mask(raw_field_mask)
        self.default_language = default_language or settings.google_places_language_code
        self.default_region = default_region or settings.google_places_region_code
        self.timeout = timeout
        self.pause_between_pages = pause_between_pages

    async def search_places(
        self,
        *,
        query: str | None,
        latitude: float,
        longitude: float,
        radius_m: int,
        included_types: Sequence[str] | None = None,
        max_results: int = 20,
        strategy: GoogleSearchStrategy = "nearby",
        language_code: str | None = None,
        region_code: str | None = None,
        allow_text_fallback: bool = True,
    ) -> list[dict[str, Any]]:
        """Consulta Places API y regresa la lista cruda de lugares."""
        if not self.api_key:
            raise GooglePlacesError("google_places_api_key_missing")
        if strategy == "nearby" and not included_types:
            raise GooglePlacesError("included_types_required_for_nearby")
        if strategy == "text" and not query:
            raise GooglePlacesError("text_query_required")

        normalized_radius = max(50, min(radius_m, 50_000))
        remaining = max(1, min(max_results, 120))
        results: list[dict[str, Any]] = []
        page_token: str | None = None

        while remaining > 0:
            if page_token:
                payload: dict[str, Any] = {"pageToken": page_token}
            else:
                payload = self._build_payload(
                    strategy=strategy,
                    query=query,
                    latitude=latitude,
                    longitude=longitude,
                    radius_m=normalized_radius,
                    included_types=included_types,
                    max_result_count=min(remaining, 20),
                    language_code=language_code,
                    region_code=region_code,
                )

            data = await self._post(
                url=self._resolve_url(strategy),
                payload=payload,
            )
            places = data.get("places") or []
            logger.debug(
                "google.places_page_received",
                extra={
                    "strategy": strategy,
                    "received": len(places),
                    "remaining_before": remaining,
                    "has_next_token": bool(data.get("nextPageToken")),
                },
            )
            if not isinstance(places, list):
                logger.warning("google.places_unexpected_payload", extra={"payload": data})
                break
            results.extend(places)
            remaining = max_results - len(results)
            page_token = data.get("nextPageToken")
            if not page_token or remaining <= 0:
                if remaining > 0 and not page_token:
                    logger.debug(
                        "google.places_no_next_page",
                        extra={"strategy": strategy, "total_collected": len(results)},
                    )
                break
            await asyncio.sleep(self.pause_between_pages)

        if (
            strategy == "nearby"
            and allow_text_fallback
            and included_types
            and len(results) < max_results
        ):
            fallback_required = max_results - len(results)
            existing_ids = {place.get("id") for place in results if place.get("id")}
            extra_nearby = await self._search_nearby_additional_centers(
                included_types=included_types,
                fallback_required=fallback_required,
                latitude=latitude,
                longitude=longitude,
                radius_m=radius_m,
                language_code=language_code,
                region_code=region_code,
                existing_ids=existing_ids,
            )
            results.extend(extra_nearby)
            fallback_required = max_results - len(results)
        if (
            strategy == "nearby"
            and allow_text_fallback
            and included_types
            and len(results) < max_results
        ):
            fallback_required = max_results - len(results)
            fallback_results = await self._search_text_fallback(
                included_types=included_types,
                fallback_required=fallback_required,
                query=query,
                latitude=latitude,
                longitude=longitude,
                radius_m=radius_m,
                language_code=language_code,
                region_code=region_code,
            )
            if fallback_results:
                dedup_ids = {place.get("id") for place in results if place.get("id")}
                for place in fallback_results:
                    place_id = place.get("id")
                    if place_id and place_id in dedup_ids:
                        continue
                    results.append(place)
                    if place_id:
                        dedup_ids.add(place_id)
                    if len(results) >= max_results:
                        break

        return results[:max_results]

    async def _post(self, *, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key or "",
        }
        if self.field_mask:
            headers["X-Goog-FieldMask"] = self.field_mask
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, headers=headers, json=payload)
        except httpx.RequestError as exc:  # pragma: no cover - depende de red
            logger.exception("google.places_request_error", extra={"error": str(exc)})
            raise GooglePlacesError("google_places_request_failed") from exc

        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except ValueError:
                detail = resp.text
            logger.error(
                "google.places_http_error",
                extra={"status": resp.status_code, "detail": detail},
            )
            raise GooglePlacesError(f"google_places_http_{resp.status_code}")
        try:
            return resp.json()
        except ValueError as exc:
            logger.exception("google.places_invalid_json")
            raise GooglePlacesError("google_places_invalid_response") from exc

    def _resolve_url(self, strategy: GoogleSearchStrategy) -> str:
        if strategy == "nearby":
            if not self.nearby_url:
                raise GooglePlacesError("google_places_nearby_url_missing")
            return self.nearby_url
        if strategy == "text":
            if not self.text_url:
                raise GooglePlacesError("google_places_text_url_missing")
            return self.text_url
        raise GooglePlacesError("google_places_unknown_strategy")

    def _build_payload(
        self,
        *,
        strategy: GoogleSearchStrategy,
        query: str | None,
        latitude: float,
        longitude: float,
        radius_m: int,
        included_types: Sequence[str] | None,
        max_result_count: int,
        language_code: str | None,
        region_code: str | None,
    ) -> dict[str, Any]:
        base: dict[str, Any] = {
            "maxResultCount": max(1, min(max_result_count, 20)),
        }
        language = language_code or self.default_language
        region = region_code or self.default_region
        if language:
            base["languageCode"] = language
        if region:
            base["regionCode"] = region

        circle_payload = {
            "circle": {
                "center": {"latitude": latitude, "longitude": longitude},
                "radius": float(radius_m),
            }
        }

        if strategy == "nearby":
            base["locationRestriction"] = circle_payload
            if included_types:
                base["includedTypes"] = list(dict.fromkeys(t for t in included_types if t))
        else:
            base["textQuery"] = query
            base["locationBias"] = circle_payload
        return base

    async def _search_text_fallback(
        self,
        *,
        included_types: Sequence[str],
        fallback_required: int,
        query: str | None,
        latitude: float,
        longitude: float,
        radius_m: int,
        language_code: str | None,
        region_code: str | None,
    ) -> list[dict[str, Any]]:
        """Cuando Nearby no expone nextPageToken, complementar con búsquedas textuales."""
        unique_types = [t for t in dict.fromkeys(t for t in included_types if t)]
        if not unique_types:
            return []
        collected: list[dict[str, Any]] = []
        filters = {t.lower() for t in unique_types}
        for place_type in unique_types:
            if len(collected) >= fallback_required:
                break
            fallback_query = query or place_type.replace("_", " ").replace("-", " ")
            try:
                results = await self.search_places(
                    query=fallback_query,
                    latitude=latitude,
                    longitude=longitude,
                    radius_m=radius_m,
                    included_types=None,
                    max_results=fallback_required - len(collected),
                    strategy="text",
                    language_code=language_code,
                    region_code=region_code,
                    allow_text_fallback=False,
                )
            except GooglePlacesError:
                continue
            for place in results:
                place_types = {t.lower() for t in (place.get("types") or []) if isinstance(t, str)}
                if filters.isdisjoint(place_types):
                    continue
                collected.append(place)
                if len(collected) >= fallback_required:
                    break
        return collected

    async def _search_nearby_additional_centers(
        self,
        *,
        included_types: Sequence[str],
        fallback_required: int,
        latitude: float,
        longitude: float,
        radius_m: int,
        language_code: str | None,
        region_code: str | None,
        existing_ids: set[str],
    ) -> list[dict[str, Any]]:
        if fallback_required <= 0:
            return []
        centers = self._generate_additional_centers(latitude, longitude, radius_m)
        collected: list[dict[str, Any]] = []
        for lat_new, lng_new in centers:
            remaining = fallback_required - len(collected)
            if remaining <= 0:
                break
            payload = self._build_payload(
                strategy="nearby",
                query=None,
                latitude=lat_new,
                longitude=lng_new,
                radius_m=radius_m,
                included_types=included_types,
                max_result_count=min(remaining, 20),
                language_code=language_code,
                region_code=region_code,
            )
            try:
                data = await self._post(url=self._resolve_url("nearby"), payload=payload)
            except GooglePlacesError:
                continue
            places = data.get("places") or []
            for place in places:
                place_id = place.get("id")
                if place_id and place_id in existing_ids:
                    continue
                collected.append(place)
                if place_id:
                    existing_ids.add(place_id)
                if len(collected) >= fallback_required:
                    return collected
        return collected

    def _generate_additional_centers(
        self,
        latitude: float,
        longitude: float,
        radius_m: int,
    ) -> list[tuple[float, float]]:
        """Crea centros adicionales alrededor del punto original para cubrir más área."""
        offsets = [
            (radius_m * 0.6, 0),
            (-radius_m * 0.6, 0),
            (0, radius_m * 0.6),
            (0, -radius_m * 0.6),
            (radius_m * 0.45, radius_m * 0.45),
            (radius_m * 0.45, -radius_m * 0.45),
            (-radius_m * 0.45, radius_m * 0.45),
            (-radius_m * 0.45, -radius_m * 0.45),
        ]
        centers: list[tuple[float, float]] = []
        for dx, dy in offsets:
            lat_new, lng_new = _offset_coordinates(latitude, longitude, dx, dy)
            centers.append((lat_new, lng_new))
        return centers


def normalize_place_for_result(place: dict[str, Any]) -> dict[str, Any]:
    """Convierte un payload crudo de Places en el formato esperado por la función SQL."""
    location = place.get("location") or {}
    display_name = place.get("displayName") or {}
    primary_display = place.get("primaryTypeDisplayName") or ""
    actividad = primary_display or place.get("primaryType") or ""
    phone = place.get("internationalPhoneNumber") or place.get("nationalPhoneNumber") or None
    website = place.get("websiteUri") or place.get("googleMapsUri")

    return {
        "external_id": place.get("id"),
        "clee": None,
        "name": display_name.get("text") if isinstance(display_name, dict) else None,
        "razon_social": None,
        "actividad": actividad,
        "estrato": None,
        "phone": phone,
        "email": place.get("email"),
        "website": website,
        "address": place.get("formattedAddress"),
        "lat": _to_float(location.get("latitude")),
        "lng": _to_float(location.get("longitude")),
        "rating": _to_float(place.get("rating")),
        "reviews": _to_int(place.get("userRatingCount")),
        "maps_url": place.get("googleMapsUri"),
        "raw": place,
    }


def _sanitize_field_mask(field_mask: str | None) -> str | None:
    if not field_mask:
        return None
    parts = [segment.strip() for segment in field_mask.split(",") if segment.strip()]
    sanitized = [segment for segment in parts if segment.lower() != "nextpagetoken"]
    if not sanitized:
        return None
    if len(sanitized) != len(parts):
        logger.warning(
            "google.places_field_mask_sanitized",
            extra={"original": field_mask, "sanitized": ",".join(sanitized)},
        )
    return ",".join(sanitized)


def _offset_coordinates(lat: float, lng: float, dx_m: float, dy_m: float) -> tuple[float, float]:
    meters_per_deg_lat = 111_320.0
    meters_per_deg_lng = max(1e-6, 111_320.0 * cos(radians(lat)))
    delta_lat = dy_m / meters_per_deg_lat
    delta_lng = dx_m / meters_per_deg_lng
    return lat + delta_lat, lng + delta_lng


def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None
