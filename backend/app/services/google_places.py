"""Cliente ligero para consumir Google Places API (búsqueda y normalización)."""

from __future__ import annotations

import asyncio
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
        self.field_mask = field_mask or settings.google_places_field_mask
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
            if not isinstance(places, list):
                logger.warning("google.places_unexpected_payload", extra={"payload": data})
                break
            results.extend(places)
            remaining = max_results - len(results)
            page_token = data.get("nextPageToken")
            if not page_token or remaining <= 0:
                break
            await asyncio.sleep(self.pause_between_pages)

        return results[:max_results]

    async def _post(self, *, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key or "",
            "X-Goog-FieldMask": self.field_mask,
        }
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
            if included_types:
                base["includedTypes"] = list(dict.fromkeys(t for t in included_types if t))
        return base


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
