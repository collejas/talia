"""Servicio para consultar Google Trends y serializar resultados para la API."""

from __future__ import annotations

import random
import time
import json
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from app.core.logging import get_logger

logger = get_logger("app.services.google_trends")
WORLD_GEOJSON_PATH = Path(__file__).resolve().parent.parent / "data" / "geo" / "world.geojson"

try:
    from pytrends.request import TrendReq
except ImportError:  # pragma: no cover
    TrendReq = None  # type: ignore[assignment]

try:
    from pytrends.exceptions import TooManyRequestsError
except ImportError:  # pragma: no cover
    TooManyRequestsError = Exception  # type: ignore[assignment]


class GoogleTrendsServiceError(RuntimeError):
    """Error controlado para la capa de API."""

    def __init__(self, message: str, *, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


@lru_cache(maxsize=1)
def _load_google_trends_countries() -> list[dict[str, str]]:
    if not WORLD_GEOJSON_PATH.exists():
        raise GoogleTrendsServiceError(
            "google_trends_countries_catalog_not_found",
            status_code=500,
        )
    try:
        with WORLD_GEOJSON_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception as exc:  # pragma: no cover
        raise GoogleTrendsServiceError(
            f"google_trends_countries_catalog_invalid: {exc}",
            status_code=500,
        ) from exc

    features = data.get("features") if isinstance(data, dict) else None
    if not isinstance(features, list):
        raise GoogleTrendsServiceError(
            "google_trends_countries_catalog_invalid",
            status_code=500,
        )

    countries_by_code: dict[str, str] = {}
    for feature in features:
        if not isinstance(feature, dict):
            continue
        props = feature.get("properties")
        if not isinstance(props, dict):
            continue
        code = str(props.get("ISO_A2") or "").strip().upper()
        if len(code) != 2 or code == "-99":
            continue
        name_raw = props.get("NAME_ES") or props.get("NAME") or props.get("NAME_EN") or code
        name = str(name_raw).strip()
        if not name:
            continue
        countries_by_code.setdefault(code, name)

    items = [
        {"code": code, "name": name}
        for code, name in countries_by_code.items()
    ]
    items.sort(key=lambda item: item["name"].casefold())
    if "MX" in countries_by_code:
        mexico = {"code": "MX", "name": countries_by_code["MX"]}
        items = [mexico, *[item for item in items if item["code"] != "MX"]]
    return items


def list_google_trends_countries() -> list[dict[str, str]]:
    return _load_google_trends_countries()


def _wait_between_requests(min_sleep: float, max_sleep: float) -> None:
    if max_sleep <= 0:
        return
    upper = max(min_sleep, max_sleep)
    lower = max(0.0, min(min_sleep, max_sleep))
    time.sleep(random.uniform(lower, upper))


def _serialize_scalar(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    to_python = getattr(value, "item", None)
    if callable(to_python):
        try:
            return to_python()
        except Exception:  # pragma: no cover
            return str(value)
    return value


def _serialize_interest_points(dataframe: Any, keywords: list[str]) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    rows = dataframe.reset_index().to_dict(orient="records")
    for row in rows:
        row_data: dict[str, Any] = {}
        timestamp_value = row.get("date", row.get("index"))
        if timestamp_value is not None:
            row_data["date"] = _serialize_scalar(timestamp_value)
        for keyword in keywords:
            row_data[keyword] = _serialize_scalar(row.get(keyword))
        if "isPartial" in row:
            row_data["isPartial"] = bool(row.get("isPartial"))
        points.append(row_data)
    return points


def _serialize_latest_values(dataframe: Any, keywords: list[str]) -> dict[str, int | float | None]:
    latest: dict[str, int | float | None] = {}
    for keyword in keywords:
        series = dataframe.get(keyword)
        if series is None:
            latest[keyword] = None
            continue
        try:
            cleaned = series.dropna()
            if cleaned.empty:
                latest[keyword] = None
                continue
            latest_value = _serialize_scalar(cleaned.iloc[-1])
            if isinstance(latest_value, bool):
                latest[keyword] = int(latest_value)
            elif isinstance(latest_value, (int, float)):
                latest[keyword] = latest_value
            else:
                latest[keyword] = None
        except Exception:  # pragma: no cover
            latest[keyword] = None
    return latest


def _serialize_by_region(dataframe: Any) -> list[dict[str, Any]]:
    if dataframe is None or dataframe.empty:
        return []
    rows = dataframe.reset_index().to_dict(orient="records")
    serialized: list[dict[str, Any]] = []
    for row in rows:
        parsed_row: dict[str, Any] = {}
        for key, value in row.items():
            normalized_key = "region" if key in {"geoName", "index"} else str(key)
            parsed_row[normalized_key] = _serialize_scalar(value)
        serialized.append(parsed_row)
    return serialized


def _serialize_related_queries(raw: Any) -> dict[str, dict[str, list[dict[str, Any]]]]:
    if not isinstance(raw, dict):
        return {}
    result: dict[str, dict[str, list[dict[str, Any]]]] = {}
    for keyword, sections in raw.items():
        key = str(keyword)
        section_payload: dict[str, list[dict[str, Any]]] = {"top": [], "rising": []}
        if isinstance(sections, dict):
            for section_name in ("top", "rising"):
                dataframe = sections.get(section_name)
                if dataframe is None:
                    continue
                try:
                    rows = dataframe.reset_index().to_dict(orient="records")
                except Exception:  # pragma: no cover
                    rows = []
                parsed_rows: list[dict[str, Any]] = []
                for row in rows:
                    query = row.get("query")
                    value = row.get("value")
                    if query is None:
                        continue
                    parsed_rows.append(
                        {
                            "query": _serialize_scalar(query),
                            "value": _serialize_scalar(value),
                        }
                    )
                section_payload[section_name] = parsed_rows[:10]
        result[key] = section_payload
    return result


def fetch_google_trends(
    *,
    keywords: list[str],
    timeframe: str,
    geo: str,
    hl: str,
    tz: int,
    include_region: bool,
    region_resolution: Literal["COUNTRY", "REGION", "SUBREGION", "DMA", "CITY"],
    inc_low_vol: bool,
    inc_geo_code: bool,
    min_sleep: float,
    max_sleep: float,
) -> dict[str, Any]:
    if TrendReq is None:  # pragma: no cover
        raise GoogleTrendsServiceError(
            "google_trends_not_installed: instala pytrends y pandas en el backend",
            status_code=500,
        )

    # Evita bloqueos indefinidos cuando Google no responde.
    pytrends = TrendReq(
        hl=hl,
        tz=tz,
        timeout=(8, 20),  # (connect_timeout, read_timeout)
    )
    try:
        pytrends.build_payload(keywords, timeframe=timeframe, geo=geo)
        timeline_df = pytrends.interest_over_time()
    except TooManyRequestsError as exc:
        raise GoogleTrendsServiceError(
            "google_trends_rate_limited",
            status_code=429,
        ) from exc
    except Exception as exc:
        if "timed out" in str(exc).lower() or "timeout" in str(exc).lower():
            raise GoogleTrendsServiceError(
                "google_trends_timeout",
                status_code=504,
            ) from exc
        raise GoogleTrendsServiceError(f"google_trends_request_failed: {exc}") from exc

    if timeline_df is None or timeline_df.empty:
        raise GoogleTrendsServiceError(
            "google_trends_empty_response",
            status_code=404,
        )

    _wait_between_requests(min_sleep=min_sleep, max_sleep=max_sleep)

    by_region: list[dict[str, Any]] = []
    if include_region:
        try:
            by_region_df = pytrends.interest_by_region(
                resolution=region_resolution,
                inc_low_vol=inc_low_vol,
                inc_geo_code=inc_geo_code,
            )
        except TooManyRequestsError as exc:
            logger.warning("google_trends.by_region.rate_limited", extra={"error": str(exc)})
        except Exception as exc:  # pragma: no cover
            logger.warning("google_trends.by_region.failed", extra={"error": str(exc)})
        else:
            by_region = _serialize_by_region(by_region_df)

    related_queries: dict[str, dict[str, list[dict[str, Any]]]] = {}
    try:
        related_raw = pytrends.related_queries()
        related_queries = _serialize_related_queries(related_raw)
    except TooManyRequestsError as exc:
        logger.warning("google_trends.related_queries.rate_limited", extra={"error": str(exc)})
    except Exception as exc:  # pragma: no cover
        logger.warning("google_trends.related_queries.failed", extra={"error": str(exc)})

    return {
        "keywords": keywords,
        "timeframe": timeframe,
        "geo": geo,
        "hl": hl,
        "tz": tz,
        "points": _serialize_interest_points(timeline_df, keywords),
        "latest": _serialize_latest_values(timeline_df, keywords),
        "by_region": by_region,
        "related_queries": related_queries,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
