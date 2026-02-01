"""Cliente ligero para consumir Google Places API (búsqueda y normalización)."""

from __future__ import annotations

import asyncio
from math import asin, ceil, cos, radians, sin, sqrt
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
        details_field_mask: str | None = None,
        default_language: str | None = None,
        default_region: str | None = None,
        timeout: float = 15.0,
        pause_between_pages: float = 2.0,
        grid_max_tile_radius_m: int = 1200,
        details_concurrency: int = 20,
    ) -> None:
        self.api_key = api_key or settings.google_places_api_key
        self.nearby_url = nearby_url or settings.google_places_nearby_url
        self.text_url = text_url or settings.google_places_text_url
        raw_field_mask = field_mask or settings.google_places_field_mask
        self.field_mask = _sanitize_field_mask(raw_field_mask)
        self.details_field_mask = _sanitize_field_mask(
            details_field_mask or settings.google_places_details_field_mask
        )
        self.default_language = default_language or settings.google_places_language_code
        self.default_region = default_region or settings.google_places_region_code
        self.timeout = timeout
        self.pause_between_pages = pause_between_pages
        self.details_url = getattr(
            settings, "google_places_details_url", "https://places.googleapis.com/v1/places"
        )
        self._details_cache: dict[str, dict[str, Any]] = {}
        self.grid_max_tile_radius_m = max(200, grid_max_tile_radius_m)
        self.details_concurrency = max(5, min(details_concurrency, 50))

    async def search_places(
        self,
        *,
        query: str | None,
        latitude: float,
        longitude: float,
        radius_m: int,
        included_types: Sequence[str] | None = None,
        max_results: int | None = None,
        strategy: GoogleSearchStrategy = "nearby",
        language_code: str | None = None,
        region_code: str | None = None,
        allow_text_fallback: bool = True,
        enrich_details: bool = False,
    ) -> list[dict[str, Any]]:
        """Consulta Places API y regresa la lista cruda de lugares."""
        if not self.api_key:
            raise GooglePlacesError("google_places_api_key_missing")
        if strategy == "nearby" and not included_types:
            raise GooglePlacesError("included_types_required_for_nearby")
        if strategy == "text" and not query:
            raise GooglePlacesError("text_query_required")

        normalized_radius = max(50, min(radius_m, 50_000))
        grid = self._select_grid_config(normalized_radius)
        limit = max_results if max_results and max_results > 0 else None
        if strategy == "text" and query:
            results = await self._search_text_tiles(
                query=query,
                latitude=latitude,
                longitude=longitude,
                radius_m=normalized_radius,
                grid_config=grid,
                language_code=language_code,
                region_code=region_code,
                max_results=limit,
            )
        else:
            results = await self._collect_pages_for_strategy(
                strategy=strategy,
                query=query,
                latitude=latitude,
                longitude=longitude,
                radius_m=normalized_radius,
                included_types=included_types,
                max_results=limit,
                language_code=language_code,
                region_code=region_code,
            )
            if (
                strategy == "nearby"
                and allow_text_fallback
                and included_types
                and (limit is None or len(results) < limit)
            ):
                remaining_limit = None if limit is None else max(limit - len(results), 0)
                existing_ids = {place.get("id") for place in results if place.get("id")}
                extra_nearby = await self._search_nearby_additional_centers(
                    included_types=included_types,
                    remaining_limit=remaining_limit,
                    latitude=latitude,
                    longitude=longitude,
                    radius_m=normalized_radius,
                    grid_config=grid,
                    language_code=language_code,
                    region_code=region_code,
                    existing_ids=existing_ids,
                )
                results.extend(extra_nearby)
            if (
                strategy == "nearby"
                and allow_text_fallback
                and included_types
                and (limit is None or len(results) < limit)
            ):
                remaining_limit = None if limit is None else max(limit - len(results), 0)
                fallback_results = await self._search_text_fallback(
                    included_types=included_types,
                    remaining_limit=remaining_limit,
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
                        if limit is not None and len(results) >= limit:
                            break

        filtered = self._filter_results_by_radius(
            results=results,
            center_lat=latitude,
            center_lng=longitude,
            radius_m=radius_m,
        )
        if enrich_details and filtered:
            enriched = await self._enrich_with_details(
                places=filtered if limit is None else filtered[:limit],
                language_code=language_code,
            )
        else:
            enriched = filtered
        if limit is not None:
            return enriched[:limit]
        return enriched

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

    async def _collect_pages_for_strategy(
        self,
        *,
        strategy: GoogleSearchStrategy,
        query: str | None,
        latitude: float,
        longitude: float,
        radius_m: int,
        included_types: Sequence[str] | None,
        max_results: int | None,
        language_code: str | None,
        region_code: str | None,
    ) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        page_token: str | None = None
        limit = max_results if max_results and max_results > 0 else None
        base_payload = self._build_payload(
            strategy=strategy,
            query=query,
            latitude=latitude,
            longitude=longitude,
            radius_m=radius_m,
            included_types=included_types,
            max_result_count=20,
            language_code=language_code,
            region_code=region_code,
        )

        while True:
            remaining = None if limit is None else max(limit - len(results), 0)
            if limit is not None and remaining <= 0:
                break
            max_result_count = 20 if remaining is None else max(1, min(20, remaining))
            payload = dict(base_payload)
            payload["maxResultCount"] = max(1, min(max_result_count, 20))
            if page_token:
                payload["pageToken"] = page_token
            data = await self._post(url=self._resolve_url(strategy), payload=payload)
            places = data.get("places") or []
            logger.debug(
                "google.places_page_received",
                extra={
                    "strategy": strategy,
                    "received": len(places),
                    "limit": limit,
                    "has_next_token": bool(data.get("nextPageToken")),
                },
            )
            if not isinstance(places, list):
                logger.warning("google.places_unexpected_payload", extra={"payload": data})
                break
            results.extend(places)
            page_token = data.get("nextPageToken")
            if not page_token:
                logger.debug(
                    "google.places_no_next_page",
                    extra={"strategy": strategy, "total_collected": len(results)},
                )
                break
            await asyncio.sleep(self.pause_between_pages)
        if limit is not None:
            return results[:limit]
        return results

    async def _search_text_fallback(
        self,
        *,
        included_types: Sequence[str],
        remaining_limit: int | None,
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
            if remaining_limit is not None and len(collected) >= remaining_limit:
                break
            fallback_query = query or place_type.replace("_", " ").replace("-", " ")
            per_query_limit = (
                None if remaining_limit is None else max(remaining_limit - len(collected), 0)
            )
            try:
                results = await self._collect_pages_for_strategy(
                    strategy="text",
                    query=fallback_query,
                    latitude=latitude,
                    longitude=longitude,
                    radius_m=radius_m,
                    included_types=None,
                    max_results=per_query_limit,
                    language_code=language_code,
                    region_code=region_code,
                )
            except GooglePlacesError:
                continue
            for place in results:
                place_types = {t.lower() for t in (place.get("types") or []) if isinstance(t, str)}
                if filters.isdisjoint(place_types):
                    continue
                collected.append(place)
                if remaining_limit is not None and len(collected) >= remaining_limit:
                    break
        return collected

    def _filter_results_by_radius(
        self,
        *,
        results: list[dict[str, Any]],
        center_lat: float,
        center_lng: float,
        radius_m: int,
    ) -> list[dict[str, Any]]:
        filtered: list[dict[str, Any]] = []
        tolerance = max(25, radius_m * 0.02)
        max_distance = radius_m + tolerance
        for place in results:
            location = place.get("location") or {}
            lat = _to_float(location.get("latitude"))
            lng = _to_float(location.get("longitude"))
            if lat is None or lng is None:
                continue
            if _distance_m(center_lat, center_lng, lat, lng) <= max_distance:
                filtered.append(place)
        return filtered

    async def _enrich_with_details(
        self,
        *,
        places: list[dict[str, Any]],
        language_code: str | None = None,
    ) -> list[dict[str, Any]]:
        place_ids = [place.get("id") for place in places if place.get("id")]
        details_map = await self._fetch_place_details(place_ids, language_code)
        enriched: list[dict[str, Any]] = []
        for place in places:
            place_id = place.get("id")
            detail = details_map.get(place_id)
            if detail:
                merged = dict(place)
                merged.update(detail)
                enriched.append(merged)
            else:
                enriched.append(place)
        return enriched

    async def _fetch_place_details(
        self,
        place_ids: list[str],
        language_code: str | None,
    ) -> dict[str, dict[str, Any]]:
        if not place_ids:
            return {}
        cache = self._details_cache
        result: dict[str, dict[str, Any]] = {}
        ids_to_fetch: list[str] = []
        for place_id in place_ids:
            if place_id in cache:
                result[place_id] = cache[place_id]
            else:
                ids_to_fetch.append(place_id)
        concurrency = min(self.details_concurrency, len(ids_to_fetch) or 1)
        semaphore = asyncio.Semaphore(max(1, concurrency))

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async def _run_detail_fetch(place_id: str) -> tuple[str, dict[str, Any] | None]:
                async with semaphore:
                    detail = await self._get_place_detail(
                        place_id,
                        language_code,
                        client=client,
                    )
                    return place_id, detail

            tasks = [_run_detail_fetch(place_id) for place_id in ids_to_fetch]
            responses = await asyncio.gather(*tasks, return_exceptions=True)

        for entry in responses:
            if isinstance(entry, Exception):
                continue
            place_id, detail = entry
            if not detail:
                continue
            cache[place_id] = detail
            result[place_id] = detail
        return result

    async def _get_place_detail(
        self,
        place_id: str,
        language_code: str | None,
        *,
        client: httpx.AsyncClient,
    ) -> dict[str, Any] | None:
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key or "",
        }
        if self.details_field_mask:
            headers["X-Goog-FieldMask"] = self.details_field_mask
        params: dict[str, str] = {}
        lang = language_code or self.default_language
        if lang:
            params["languageCode"] = lang
        url = f"{self.details_url}/{place_id}"
        try:
            resp = await client.get(url, headers=headers, params=params)
        except httpx.RequestError as exc:
            logger.warning(
                "google.places_details_request_error",
                extra={"place_id": place_id, "error": str(exc)},
            )
            return None
        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except ValueError:
                detail = resp.text
            logger.warning(
                "google.places_details_http_error",
                extra={"place_id": place_id, "status": resp.status_code, "detail": detail},
            )
            return None
        try:
            return resp.json()
        except ValueError:
            return None

    async def _search_nearby_additional_centers(
        self,
        *,
        included_types: Sequence[str],
        remaining_limit: int | None,
        latitude: float,
        longitude: float,
        radius_m: int,
        grid_config: dict[str, int],
        language_code: str | None,
        region_code: str | None,
        existing_ids: set[str],
    ) -> list[dict[str, Any]]:
        if remaining_limit is not None and remaining_limit <= 0:
            return []
        centers = self._generate_grid_centers(
            latitude=latitude,
            longitude=longitude,
            radius_m=radius_m,
            tile_radius_m=grid_config["tile_radius_m"],
            grid_size=grid_config["grid_size"],
        )
        collected: list[dict[str, Any]] = []
        for lat_new, lng_new in centers:
            per_tile_limit = (
                None if remaining_limit is None else max(remaining_limit - len(collected), 0)
            )
            if per_tile_limit is not None and per_tile_limit <= 0:
                break
            try:
                tile_results = await self._collect_pages_for_strategy(
                    strategy="nearby",
                    query=None,
                    latitude=lat_new,
                    longitude=lng_new,
                    radius_m=grid_config["tile_radius_m"],
                    included_types=included_types,
                    max_results=per_tile_limit,
                    language_code=language_code,
                    region_code=region_code,
                )
            except GooglePlacesError:
                continue
            for place in tile_results:
                place_id = place.get("id")
                if place_id and place_id in existing_ids:
                    continue
                collected.append(place)
                if place_id:
                    existing_ids.add(place_id)
                if remaining_limit is not None and len(collected) >= remaining_limit:
                    return collected
        return collected

    async def _search_text_tiles(
        self,
        *,
        query: str,
        latitude: float,
        longitude: float,
        radius_m: int,
        grid_config: dict[str, int],
        language_code: str | None,
        region_code: str | None,
        max_results: int | None,
    ) -> list[dict[str, Any]]:
        centers = [(latitude, longitude)] + self._generate_grid_centers(
            latitude=latitude,
            longitude=longitude,
            radius_m=radius_m,
            tile_radius_m=grid_config["tile_radius_m"],
            grid_size=grid_config["grid_size"],
        )
        collected: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        limit = max_results if max_results and max_results > 0 else None
        for lat_new, lng_new in centers:
            remaining = None if limit is None else max(limit - len(collected), 0)
            if remaining is not None and remaining <= 0:
                break
            per_tile_limit = None if remaining is None else max(remaining, 1)
            try:
                tile_results = await self._collect_pages_for_strategy(
                    strategy="text",
                    query=query,
                    latitude=lat_new,
                    longitude=lng_new,
                    radius_m=grid_config["tile_radius_m"],
                    included_types=None,
                    max_results=per_tile_limit,
                    language_code=language_code,
                    region_code=region_code,
                )
            except GooglePlacesError:
                continue
            for place in tile_results:
                place_id = place.get("id")
                if place_id and place_id in seen_ids:
                    continue
                if place_id:
                    seen_ids.add(place_id)
                collected.append(place)
                if limit is not None and len(collected) >= limit:
                    return collected
        return collected

    def _suggest_tile_radius(self, radius_m: int) -> int:
        if radius_m <= 500:
            return radius_m
        if radius_m <= 2000:
            return max(300, radius_m // 2)
        return min(self.grid_max_tile_radius_m, max(400, radius_m // 3))

    def _select_grid_config(self, radius_m: int) -> dict[str, int]:
        if radius_m <= 500:
            grid_size = 1
            tile_radius = radius_m
        elif radius_m <= 2000:
            grid_size = 3
            tile_radius = max(250, int(radius_m / grid_size * 1.2))
        else:
            grid_size = 5
            tile_radius = min(
                self.grid_max_tile_radius_m, max(350, int(radius_m / grid_size * 1.3))
            )
            steps = max(2, ceil(radius_m / tile_radius))
            dynamic_size = 1 + 2 * steps
            grid_size = min(dynamic_size, 19)
        return {
            "grid_size": grid_size,
            "tile_radius_m": tile_radius,
        }

    def _generate_grid_centers(
        self,
        latitude: float,
        longitude: float,
        radius_m: int,
        tile_radius_m: int,
        grid_size: int,
    ) -> list[tuple[float, float]]:
        if tile_radius_m <= 0 or grid_size <= 1:
            return []
        step = max(200, min(tile_radius_m, int(radius_m / max(1, grid_size - 1)) or tile_radius_m))
        centers: list[tuple[float, float]] = []
        offset_range = range(-(grid_size // 2), grid_size // 2 + 1)
        for ix in offset_range:
            for iy in offset_range:
                if ix == 0 and iy == 0:
                    continue
                dx = ix * step
                dy = iy * step
                if dx * dx + dy * dy > radius_m * radius_m:
                    continue
                lat_new, lng_new = _offset_coordinates(latitude, longitude, dx, dy)
                centers.append((lat_new, lng_new))
        return centers


def normalize_place_for_result(place: dict[str, Any]) -> dict[str, Any]:
    """Convierte un payload crudo de Places en el formato esperado por la función SQL."""
    location = place.get("location") or {}
    display_name = place.get("displayName") or {}
    primary_display = place.get("primaryTypeDisplayName")
    if isinstance(primary_display, dict):
        actividad = primary_display.get("text") or ""
    else:
        actividad = primary_display or ""
    actividad = actividad or place.get("primaryType") or ""
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


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6_371_000.0
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    c = 2 * asin(min(1.0, sqrt(a)))
    return radius * c


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6_371_000.0
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    c = 2 * asin(min(1.0, sqrt(a)))
    return radius * c


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
