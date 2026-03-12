"""Herramientas para ubicar leads por LADA y exponer catálogos geográficos."""

from __future__ import annotations

import json
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Iterable, Sequence

from app.core.logging import get_logger
from app.data import data_path

logger = get_logger(__name__)

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
    catalog = _load_json("ladas/ladas_by_lada.json")
    mapping: dict[str, dict[str, str]] = {}
    if isinstance(catalog, dict):
        for lada, rows in catalog.items():
            lada_key = str(lada)
            states: dict[str, str] = {}
            if isinstance(rows, Iterable):
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    cve_ent = str(row.get("cve_ent") or "").zfill(2)
                    nom_ent = row.get("nom_ent")
                    if cve_ent and nom_ent:
                        states[cve_ent] = str(nom_ent)
            if states:
                mapping[lada_key] = states
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
    catalog = _load_json("ladas/ladas_clean.json")
    mapping: dict[str, list[dict[str, Any]]] = {}
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
