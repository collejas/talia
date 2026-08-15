"""Herramientas para ubicar leads por LADA y exponer catálogos geográficos."""

from __future__ import annotations

import json
import asyncio
import unicodedata
from time import monotonic
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Iterable, Sequence

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.data import data_path

logger = get_logger(__name__)
_GEO_DB_CACHE_TTL_SECONDS = 3600.0
_GEO_COUNTRIES_CACHE: tuple[float, dict[str, Any]] | None = None
_GEO_STATES_CACHE: tuple[float, dict[str, Any]] | None = None
_GEO_MUNICIPALITIES_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_GEO_INFLIGHT: dict[str, asyncio.Task[dict[str, Any]]] = {}


async def _coalesce_geo_load(
    key: str,
    loader: Any,
) -> dict[str, Any]:
    """Comparte una carga fría entre requests concurrentes del mismo catálogo."""
    loop = asyncio.get_running_loop()
    current = _GEO_INFLIGHT.get(key)
    if current is not None and not current.done() and current.get_loop() is loop:
        return await current
    task = loop.create_task(loader())
    _GEO_INFLIGHT[key] = task
    try:
        return await task
    finally:
        if _GEO_INFLIGHT.get(key) is task:
            _GEO_INFLIGHT.pop(key, None)

try:  # pragma: no cover - dependemos del entorno de ejecución
    import phonenumbers
    from phonenumbers.phonenumberutil import NumberParseException
except Exception:  # pragma: no cover
    phonenumbers = None
    NumberParseException = Exception  # type: ignore[assignment]


def _normalize_key(text: str | None) -> str:
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", text)
    stripped = "".join(ch for ch in normalized if ch.isalnum())
    return stripped.lower()


def _digits_only(value: str | None) -> str:
    if not value:
        return ""
    return "".join(ch for ch in str(value) if ch.isdigit())


def _cache_get(entry: tuple[float, dict[str, Any]] | None) -> dict[str, Any] | None:
    if not entry:
        return None
    ts, payload = entry
    if monotonic() - ts > _GEO_DB_CACHE_TTL_SECONDS:
        return None
    return payload


def _cache_set(payload: dict[str, Any]) -> tuple[float, dict[str, Any]]:
    return (monotonic(), payload)


def _as_geojson_dict(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, dict):
            return parsed
    return None


def _feature_collection_from_rows(rows: list[Any]) -> dict[str, Any]:
    features: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        geometry = _as_geojson_dict(row.get("geom"))
        if not geometry:
            continue
        props = {k: v for k, v in row.items() if k != "geom"}
        features.append(
            {
                "type": "Feature",
                "geometry": geometry,
                "properties": props,
            }
        )
    return {"type": "FeatureCollection", "features": features}


def _normalize_countries_feature_collection(payload: dict[str, Any]) -> dict[str, Any]:
    features = payload.get("features")
    if not isinstance(features, list):
        return payload
    normalized: list[dict[str, Any]] = []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            properties = {}
        iso2 = str(properties.get("codigo_iso2") or "").strip().upper()
        iso3 = str(properties.get("codigo_iso3") or "").strip().upper()
        nombre = str(properties.get("nombre") or "").strip()
        properties["ISO_A2"] = iso2 or properties.get("ISO_A2")
        properties["ISO_A3"] = iso3 or properties.get("ISO_A3")
        properties["NAME"] = nombre or properties.get("NAME")
        properties["ADMIN"] = (
            str(properties.get("nombre_largo") or "").strip()
            or nombre
            or properties.get("ADMIN")
        )
        normalized.append({**feature, "properties": properties})
    return {"type": "FeatureCollection", "features": normalized}


def _normalize_states_feature_collection(payload: dict[str, Any]) -> dict[str, Any]:
    features = payload.get("features")
    if not isinstance(features, list):
        return payload
    normalized: list[dict[str, Any]] = []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            properties = {}
        state_code = str(properties.get("clave_entidad") or "").strip().zfill(2)
        state_name = str(properties.get("nombre") or "").strip()
        properties["cve_ent"] = state_code or properties.get("cve_ent")
        properties["cve_entidad"] = state_code or properties.get("cve_entidad")
        properties["nom_ent"] = state_name or properties.get("nom_ent")
        normalized.append({**feature, "properties": properties})
    return {"type": "FeatureCollection", "features": normalized}


def _normalize_municipalities_feature_collection(payload: dict[str, Any]) -> dict[str, Any]:
    features = payload.get("features")
    if not isinstance(features, list):
        return payload
    normalized: list[dict[str, Any]] = []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            properties = {}
        ent = str(properties.get("clave_entidad") or "").strip().zfill(2)
        mun = str(properties.get("clave_municipio") or "").strip().zfill(3)
        cvegeo = str(properties.get("cvegeo") or "").strip() or f"{ent}{mun}"
        name = str(properties.get("nombre") or "").strip()
        properties["cve_ent"] = ent or properties.get("cve_ent")
        properties["cve_entidad"] = ent or properties.get("cve_entidad")
        properties["cve_mun"] = mun or properties.get("cve_mun")
        properties["nom_mun"] = name or properties.get("nom_mun")
        properties["cvegeo"] = cvegeo or properties.get("cvegeo")
        normalized.append({**feature, "properties": properties})
    return {"type": "FeatureCollection", "features": normalized}


async def _fetch_geojson_collection(
    *,
    table: str,
    select: str,
    filters: dict[str, str],
    order: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    if not settings.supabase_url or not settings.supabase_service_role:
        raise RuntimeError("supabase_not_configured")
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}"
    params = dict(filters)
    params["select"] = select
    if order:
        params["order"] = order
    if limit is not None:
        params["limit"] = str(limit)
    token = settings.supabase_service_role
    headers = {
        "apikey": token,
        "Authorization": f"Bearer {token}",
        "Accept": "application/geo+json",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(url, params=params, headers=headers)
    if resp.status_code >= 400:
        raise RuntimeError(f"supabase_geo_error:{resp.status_code}:{table}")
    try:
        payload = resp.json()
    except ValueError as exc:
        raise RuntimeError(f"supabase_geo_invalid_json:{table}") from exc
    if isinstance(payload, list):
        return _feature_collection_from_rows(payload)
    if isinstance(payload, dict) and payload.get("type") == "FeatureCollection":
        return payload
    raise RuntimeError(f"supabase_geo_unexpected_payload:{table}")


@lru_cache(maxsize=1)
def _load_ladas_from_db() -> list[dict[str, Any]]:
    if not settings.supabase_url or not settings.supabase_service_role:
        raise RuntimeError("supabase_not_configured")
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/geo_ladas_mexico"
    headers = {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Accept": "application/json",
    }
    params = {
        "select": "lada,clave_entidad,entidad,localidad",
        "activo": "eq.true",
        "order": "lada.asc,clave_entidad.asc,localidad.asc",
        "limit": "50000",
    }
    with httpx.Client(timeout=20.0) as client:
        resp = client.get(url, headers=headers, params=params)
    if resp.status_code >= 400:
        raise RuntimeError(f"supabase_ladas_error:{resp.status_code}")
    payload = resp.json()
    if not isinstance(payload, list):
        raise RuntimeError("supabase_ladas_invalid_payload")
    return [row for row in payload if isinstance(row, dict)]


@lru_cache(maxsize=None)
def _load_json(relative_path: str) -> Any:
    """Carga un archivo JSON ubicado en `backend/app/data`."""
    path = data_path(*relative_path.split("/"))
    try:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError:  # pragma: no cover - depende del despliegue
        logger.error("catalog.json_missing", extra={"path": str(path)})
        raise
    except json.JSONDecodeError as exc:  # pragma: no cover - best effort
        logger.error("catalog.json_invalid", extra={"path": str(path), "error": str(exc)})
        raise


@lru_cache(maxsize=1)
def _lada_states() -> dict[str, dict[str, str]]:
    """Retorna mapping de LADA → {cve_ent: nombre}."""
    mapping: dict[str, dict[str, str]] = {}
    source_rows: list[Any] = []
    try:
        source_rows.extend(_load_ladas_from_db())
    except Exception as exc:
        logger.warning("leads_geo.ladas_states_db_fallback_file", extra={"error": str(exc)})

    catalog = _load_json("ladas/ladas_by_lada.json")
    if isinstance(catalog, dict):
        for lada, rows in catalog.items():
            if isinstance(rows, list):
                source_rows.extend(
                    [
                        {
                            "lada": lada,
                            "clave_entidad": row.get("cve_ent"),
                            "entidad": row.get("nom_ent"),
                        }
                        for row in rows
                        if isinstance(row, dict)
                    ]
                )
            elif isinstance(rows, dict):
                source_rows.append(
                    {
                        "lada": lada,
                        "clave_entidad": rows.get("cve_ent"),
                        "entidad": rows.get("nom_ent"),
                    }
                )

    for row in source_rows:
        if not isinstance(row, dict):
            continue
        lada_key = str(row.get("lada") or "").strip()
        cve_ent = str(row.get("clave_entidad") or "").zfill(2)
        nom_ent = str(row.get("entidad") or "").strip()
        if not lada_key or not cve_ent or not nom_ent:
            continue
        mapping.setdefault(lada_key, {})[cve_ent] = nom_ent
    return mapping


@lru_cache(maxsize=1)
def _municipios_manifest() -> dict[str, dict[str, str]]:
    manifest = _load_json("geo/municipios/manifest.json")
    if isinstance(manifest, dict):
        return {str(k).zfill(2): v for k, v in manifest.items() if isinstance(v, dict)}
    return {}


@lru_cache(maxsize=1)
def _state_name_index() -> dict[str, str]:
    manifest = _municipios_manifest()
    index: dict[str, str] = {}
    for code, entry in manifest.items():
        name = entry.get("name")
        if not name:
            continue
        index[_normalize_key(str(name))] = code
    return index


def _state_code_from_name(name: str | None) -> tuple[str | None, str | None]:
    if not name:
        return None, None
    normalized = _normalize_key(name)
    index = _state_name_index()
    code = index.get(normalized)
    if not code and normalized.startswith("estadode"):
        code = index.get(normalized[len("estadode") :])
    if code:
        return code, state_display_name(code)
    aliases = {
        "mexicocity": "09",
        "ciudaddemexico": "09",
        "cdmx": "09",
    }
    code = aliases.get(normalized)
    if code:
        return code, state_display_name(code)
    return None, None


@lru_cache(maxsize=None)
def _municipality_name_index(cve_ent: str) -> dict[str, tuple[str, str]]:
    geojson = load_state_municipalities_geojson(cve_ent)
    mapping: dict[str, tuple[str, str]] = {}
    for feature in geojson.get("features", []):
        props = feature.get("properties") or {}
        cve_mun = str(props.get("cve_mun") or "").zfill(3)
        nombre = props.get("nom_mun")
        if not cve_mun or not nombre:
            continue
        mapping[_normalize_key(str(nombre))] = (cve_mun, str(nombre))
    return mapping


def _clean_city_name(name: str | None) -> str | None:
    if not name:
        return None
    lowered = name.strip()
    for suffix in (" city", " City", " municipio", " Municipio"):
        if lowered.endswith(suffix):
            lowered = lowered[: -len(suffix)]
    return lowered.strip() or name


# Alias de localidad/ciudad hacia municipio INEGI por estado.
# Se usa cuando el proveedor de geo regresa nombres de ciudad que no coinciden
# con `nom_mun` del catálogo de municipios (ej. "La Cañada" en Querétaro).
_MUNICIPALITY_CITY_ALIASES: dict[str, dict[str, str]] = {
    # Querétaro
    # "La Cañada" (cabecera/localidad) pertenece a El Marqués (cve_mun 011).
    "22": {
        "lacanada": "011",
        "lacanadaqueretaro": "011",
    },
}


@lru_cache(maxsize=None)
def load_states_geojson() -> dict[str, Any]:
    """GeoJSON compacto de estados."""
    return _load_json("geo/mexico_states_mini.geojson")


@lru_cache(maxsize=None)
def load_full_states_geojson() -> dict[str, Any]:
    """GeoJSON de estados con claves INEGI (usamos versión compacta)."""
    return _load_json("geo/mexico_states_mini.geojson")


@lru_cache(maxsize=None)
def load_world_countries_geojson() -> dict[str, Any]:
    """GeoJSON simplificado de países."""
    return _load_json("geo/world.geojson")


@lru_cache(maxsize=None)
def load_state_municipalities_geojson(cve_ent: str) -> dict[str, Any]:
    """Retorna el GeoJSON de municipios para la `cve_ent` recibida."""
    manifest = _municipios_manifest()
    state_code = str(cve_ent).zfill(2)
    entry = manifest.get(state_code)
    if not entry:
        raise KeyError(state_code)
    path = entry.get("path")
    if not path:
        raise KeyError(state_code)
    return _load_json(f"geo/municipios/{path}")


async def load_world_countries_geojson_db_first() -> dict[str, Any]:
    global _GEO_COUNTRIES_CACHE
    cached = _cache_get(_GEO_COUNTRIES_CACHE)
    if cached is not None:
        return cached

    async def _load() -> dict[str, Any]:
        global _GEO_COUNTRIES_CACHE
        try:
            payload = await _fetch_geojson_collection(
                table="geo_paises",
                select="codigo_iso2,codigo_iso3,nombre,nombre_largo,geom",
                filters={"activo": "eq.true", "geom": "not.is.null"},
                order="nombre.asc",
                limit=400,
            )
            payload = _normalize_countries_feature_collection(payload)
            if isinstance(payload.get("features"), list) and payload["features"]:
                _GEO_COUNTRIES_CACHE = _cache_set(payload)
                return payload
        except Exception as exc:
            logger.warning("leads_geo.countries_db_fallback_file", extra={"error": str(exc)})
        fallback = load_world_countries_geojson()
        _GEO_COUNTRIES_CACHE = _cache_set(fallback)
        return fallback

    return await _coalesce_geo_load("countries", _load)


async def load_full_states_geojson_db_first() -> dict[str, Any]:
    global _GEO_STATES_CACHE
    cached = _cache_get(_GEO_STATES_CACHE)
    if cached is not None:
        return cached

    async def _load() -> dict[str, Any]:
        global _GEO_STATES_CACHE
        try:
            payload = await _fetch_geojson_collection(
                table="geo_estados_mexico",
                select="clave_entidad,nombre,pais_codigo,geom",
                filters={"activo": "eq.true", "pais_codigo": "eq.MX", "geom": "not.is.null"},
                order="clave_entidad.asc",
                limit=64,
            )
            payload = _normalize_states_feature_collection(payload)
            if isinstance(payload.get("features"), list) and payload["features"]:
                _GEO_STATES_CACHE = _cache_set(payload)
                return payload
        except Exception as exc:
            logger.warning("leads_geo.states_db_fallback_file", extra={"error": str(exc)})
        fallback = load_full_states_geojson()
        _GEO_STATES_CACHE = _cache_set(fallback)
        return fallback

    return await _coalesce_geo_load("states", _load)


async def load_states_geojson_db_first() -> dict[str, Any]:
    return await load_full_states_geojson_db_first()


async def load_state_municipalities_geojson_db_first(cve_ent: str) -> dict[str, Any]:
    state_code = str(cve_ent).zfill(2)
    cached = _cache_get(_GEO_MUNICIPALITIES_CACHE.get(state_code))
    if cached is not None:
        return cached

    async def _load() -> dict[str, Any]:
        try:
            payload = await _fetch_geojson_collection(
                table="geo_municipios_mexico",
                select="clave_entidad,clave_municipio,cvegeo,nombre,geom",
                filters={
                    "activo": "eq.true",
                    "clave_entidad": f"eq.{state_code}",
                    "geom": "not.is.null",
                },
                order="clave_municipio.asc",
                limit=3000,
            )
            payload = _normalize_municipalities_feature_collection(payload)
            if isinstance(payload.get("features"), list) and payload["features"]:
                _GEO_MUNICIPALITIES_CACHE[state_code] = _cache_set(payload)
                return payload
            raise KeyError(state_code)
        except KeyError:
            raise
        except Exception as exc:
            logger.warning(
                "leads_geo.municipalities_db_fallback_file",
                extra={"state_code": state_code, "error": str(exc)},
            )
        fallback = load_state_municipalities_geojson(state_code)
        _GEO_MUNICIPALITIES_CACHE[state_code] = _cache_set(fallback)
        return fallback

    return await _coalesce_geo_load(f"municipalities:{state_code}", _load)


def state_display_name(cve_ent: str) -> str | None:
    manifest = _municipios_manifest()
    entry = manifest.get(str(cve_ent).zfill(2))
    if not entry:
        return None
    name = entry.get("name")
    return str(name) if name else None


@lru_cache(maxsize=1)
def _country_name_index() -> dict[str, str]:
    data = load_world_countries_geojson()
    mapping: dict[str, str] = {}
    for feature in data.get("features", []):
        props = feature.get("properties") or {}
        iso = str(props.get("ISO_A2") or props.get("WB_A2") or "").upper()
        name = props.get("NAME") or props.get("ADMIN") or props.get("FORMAL_EN")
        if iso and name:
            mapping[iso] = str(name)
    mapping.setdefault("MX", "México")
    return mapping


def country_display_name(iso_code: str | None) -> str | None:
    if not iso_code:
        return None
    return _country_name_index().get(str(iso_code).upper())


def _normalized_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return parsed
    return {}


def _mexico_national_number(phone_e164: str | None) -> str | None:
    if not phone_e164:
        return None
    digits = "".join(ch for ch in str(phone_e164) if ch.isdigit())
    if not digits.startswith("52"):
        return None
    national = digits[2:]
    if national.startswith("1") and len(national) >= 11:
        national = national[1:]
    return national or None


def _lada_from_phone(phone_e164: str | None) -> str | None:
    national = _mexico_national_number(phone_e164)
    if not national:
        return None
    catalog = _lada_states()
    for length in (3, 2):
        candidate = national[:length]
        if candidate in catalog:
            return candidate
    return None


@lru_cache(maxsize=1)
def _lada_localities() -> dict[str, list[dict[str, Any]]]:
    mapping: dict[str, list[dict[str, Any]]] = {}
    try:
        rows = _load_ladas_from_db()
        for row in rows:
            lada = str(row.get("lada") or "").strip()
            if not lada:
                continue
            mapped_row = {
                "lada": lada,
                "cve_ent": str(row.get("clave_entidad") or "").zfill(2),
                "nom_ent": str(row.get("entidad") or "").strip(),
                "localidad": str(row.get("localidad") or "").strip(),
            }
            mapping.setdefault(lada, []).append(mapped_row)
    except Exception as exc:
        logger.warning("leads_geo.ladas_localities_db_fallback_file", extra={"error": str(exc)})

    catalog = _load_json("ladas/ladas_clean.json")
    if isinstance(catalog, list):
        for row in catalog:
            if not isinstance(row, dict):
                continue
            lada = str(row.get("lada") or "").strip()
            if not lada:
                continue
            mapping.setdefault(lada, []).append(row)
    return mapping


def _state_from_lada(lada: str | None) -> tuple[str | None, str | None]:
    """Resuelve estado por LADA incluso cuando existe más de una entidad."""
    if not lada:
        return None, None
    lada_key = str(lada).strip()
    if not lada_key:
        return None, None

    states = _lada_states().get(lada_key) or {}
    if len(states) == 1:
        code, name = next(iter(states.items()))
        return str(code).zfill(2), str(name)
    if not states:
        return None, None

    counts: dict[str, int] = {}
    for entry in _lada_localities().get(lada_key) or []:
        if not isinstance(entry, dict):
            continue
        raw_code = entry.get("cve_ent")
        if raw_code in (None, ""):
            continue
        code = str(raw_code).zfill(2)
        counts[code] = counts.get(code, 0) + 1

    if not counts:
        return None, None

    ordered = sorted(counts.items(), key=lambda item: item[1], reverse=True)
    top_code, top_count = ordered[0]
    is_tie = any(count == top_count and code != top_code for code, count in ordered[1:])
    if is_tie:
        return None, None

    return top_code, states.get(top_code) or state_display_name(top_code)


def _country_from_phone(phone_e164: str | None) -> tuple[str | None, str | None]:
    if not phone_e164:
        return None, None
    if phonenumbers:
        try:
            parsed = phonenumbers.parse(phone_e164, None)
        except NumberParseException:
            parsed = None
        if parsed:
            region = phonenumbers.region_code_for_number(parsed)
            if region:
                return region, country_display_name(region)
    digits = _digits_only(phone_e164)
    if digits.startswith("52"):
        return "MX", country_display_name("MX")
    return None, None


def _location_from_metadata(
    metadata: dict[str, Any],
) -> tuple[str | None, str | None, str | None, str | None]:
    """Intenta resolver estado/municipio a partir de metadatos de identidad."""
    geo = _normalized_dict(metadata.get("geo"))
    if not geo:
        return None, None, None, None
    country = str(geo.get("country") or "").upper()
    if country and country not in {"MX", "MEX", "MEXICO"}:
        return None, None, None, None
    state_name = geo.get("nom_ent") or geo.get("state") or geo.get("region")
    estado, estado_nombre = _state_code_from_name(state_name)
    municipio = None
    municipio_nombre = None
    if estado:
        city_raw = geo.get("nom_mun") or geo.get("city")
        city_clean = _clean_city_name(city_raw)
        if city_clean:
            muni_mapping = _municipality_name_index(estado)
            muni_key = _normalize_key(city_clean)
            result = muni_mapping.get(muni_key)
            if not result:
                state_aliases = _MUNICIPALITY_CITY_ALIASES.get(str(estado).zfill(2), {})
                alias_code = state_aliases.get(muni_key)
                if alias_code:
                    for _, candidate in muni_mapping.items():
                        if candidate[0] == str(alias_code).zfill(3):
                            result = candidate
                            break
            if result:
                municipio, municipio_nombre = result
    return estado, estado_nombre, municipio, municipio_nombre


@dataclass(slots=True)
class ContactLocation:
    """Ubicación inferida para un contacto."""

    contacto_id: str
    channels: tuple[str, ...]
    lada: str | None = None
    estado_clave: str | None = None
    estado_nombre: str | None = None
    municipio_clave: str | None = None
    municipio_nombre: str | None = None
    municipio_cvegeo: str | None = None


@dataclass(slots=True)
class PhoneLocationSummary:
    """Resumen de ubicación inferida solo a partir del teléfono."""

    phone_e164: str | None
    country_code: str | None
    country_name: str | None
    lada: str | None = None
    estado_clave: str | None = None
    estado_nombre: str | None = None
    municipio_nombre: str | None = None


def infer_contact_location(
    contacto_id: str,
    data: dict[str, Any],
    *,
    channels: Iterable[str],
    identities: Sequence[dict[str, Any]] | None = None,
) -> ContactLocation:
    """Construye la ubicación conocida (si la hay) para un contacto."""

    channels_tuple = tuple(sorted({str(ch) for ch in channels if ch}))

    meta = _normalized_dict(data.get("contacto_datos"))
    location_meta = _normalized_dict(meta.get("ubicacion")) or _normalized_dict(meta.get("lada"))
    estado = location_meta.get("cve_ent") or meta.get("cve_ent")
    estado_nombre = location_meta.get("nom_ent") or meta.get("nom_ent")
    municipio = location_meta.get("cve_mun") or meta.get("cve_mun")
    municipio_nombre = location_meta.get("nom_mun") or meta.get("nom_mun")
    cvegeo = location_meta.get("cvegeo") or meta.get("cvegeo")

    lada = None
    if "lada" in location_meta and isinstance(location_meta.get("lada"), (str, int)):
        lada = str(location_meta.get("lada"))
    elif "lada" in meta and isinstance(meta.get("lada"), (str, int)):
        lada = str(meta.get("lada"))

    if not estado:
        lada = lada or _lada_from_phone(data.get("telefono_e164"))
        if lada:
            estado, estado_nombre = _state_from_lada(lada)

    if estado and not municipio and lada:
        municipio_candidates: dict[str, str] = {}
        localities = _lada_localities().get(lada) or []
        if localities:
            muni_index = _municipality_name_index(str(estado).zfill(2))
            for entry in localities:
                loc_name = str(entry.get("localidad") or "").strip()
                if not loc_name:
                    continue
                normalized = _normalize_key(loc_name)
                candidate = muni_index.get(normalized)
                if candidate:
                    code, name = candidate
                    municipio_candidates[code] = name
            if len(municipio_candidates) == 1:
                municipio, municipio_nombre = next(iter(municipio_candidates.items()))
            elif len(municipio_candidates) > 1:
                target_name = state_display_name(str(estado).zfill(2)) or estado_nombre
                if target_name:
                    normalized_target = _normalize_key(target_name)
                    for code, name in municipio_candidates.items():
                        if _normalize_key(name) == normalized_target:
                            municipio = code
                            municipio_nombre = name
                            break

    if not estado and identities:
        for raw_meta in identities:
            identity_meta = _normalized_dict(raw_meta)
            estado, estado_nombre, municipio, municipio_nombre = _location_from_metadata(
                identity_meta
            )
            if estado:
                break

    if estado:
        estado = str(estado).zfill(2)
        if not estado_nombre:
            estado_nombre = state_display_name(estado)
        if municipio:
            municipio = str(municipio).zfill(3)
            if not cvegeo:
                cvegeo = f"{estado}{municipio}"
    else:
        estado = None
        estado_nombre = None
        municipio = None
        municipio_nombre = None
        cvegeo = None

    return ContactLocation(
        contacto_id=str(contacto_id),
        channels=channels_tuple,
        lada=str(lada) if lada else None,
        estado_clave=estado,
        estado_nombre=estado_nombre,
        municipio_clave=municipio,
        municipio_nombre=municipio_nombre,
        municipio_cvegeo=cvegeo,
    )


def phone_location_from_number(phone_e164: str | None) -> PhoneLocationSummary:
    country_code, country_name = _country_from_phone(phone_e164)
    lada = estado = estado_nombre = municipio_nombre = None

    if country_code == "MX":
        lada = _lada_from_phone(phone_e164)
        if lada:
            estado, estado_nombre = _state_from_lada(lada)
            entries = _lada_localities().get(lada) or []
            if not estado:
                estados = {
                    str(item.get("cve_ent")).zfill(2) for item in entries if item.get("cve_ent")
                }
                if len(estados) == 1:
                    estado = estados.pop()
                    estado_nombre = state_display_name(estado) or estado_nombre
            localidades = {
                str(item.get("localidad") or "").strip()
                for item in entries
                if item.get("localidad")
            }
            if len(localidades) == 1:
                municipio_nombre = next(iter(localidades))

        if estado:
            estado = str(estado).zfill(2)
            estado_nombre = estado_nombre or state_display_name(estado)

    return PhoneLocationSummary(
        phone_e164=phone_e164,
        country_code=country_code,
        country_name=country_name,
        lada=lada,
        estado_clave=estado,
        estado_nombre=estado_nombre,
        municipio_nombre=municipio_nombre,
    )


def location_from_geo_metadata(
    geo: dict[str, Any] | None,
) -> tuple[str | None, str | None, str | None, str | None, str | None]:
    """Resuelve claves/nombres de estado y municipio a partir de metadata `geo`."""
    if not isinstance(geo, dict) or not geo:
        return None, None, None, None, None

    estado, estado_nombre, municipio, municipio_nombre = _location_from_metadata({"geo": geo})
    estado_clave = str(estado).zfill(2) if estado else None
    municipio_clave = str(municipio).zfill(3) if municipio else None
    cvegeo = f"{estado_clave}{municipio_clave}" if estado_clave and municipio_clave else None

    return estado_clave, estado_nombre, municipio_clave, municipio_nombre, cvegeo
