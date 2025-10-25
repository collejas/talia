"""Herramientas para ubicar leads por LADA y exponer catálogos geográficos."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Iterable

from app.core.logging import get_logger
from app.data import data_path

logger = get_logger(__name__)


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


@lru_cache(maxsize=None)
def load_states_geojson() -> dict[str, Any]:
    """GeoJSON compacto de estados."""
    return _load_json("geo/mexico_states_mini.geojson")


@lru_cache(maxsize=None)
def load_full_states_geojson() -> dict[str, Any]:
    """GeoJSON completo de estados (mayor detalle)."""
    return _load_json("geo/mexico_states.geojson")


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


@dataclass(slots=True)
class ContactLocation:
    """Ubicación inferida para un contacto."""

    contacto_id: str
    lada: str | None = None
    estado_clave: str | None = None
    estado_nombre: str | None = None
    municipio_clave: str | None = None
    municipio_nombre: str | None = None
    municipio_cvegeo: str | None = None


def infer_contact_location(contacto_id: str, data: dict[str, Any]) -> ContactLocation:
    """Construye la ubicación conocida (si la hay) para un contacto."""
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
            catalog = _lada_states()
            states = catalog.get(lada)
            if states and len(states) == 1:
                estado, estado_nombre = next(iter(states.items()))
            else:
                estado = None
                estado_nombre = None

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
        lada=str(lada) if lada else None,
        estado_clave=estado,
        estado_nombre=estado_nombre,
        municipio_clave=municipio,
        municipio_nombre=municipio_nombre,
        municipio_cvegeo=cvegeo,
    )
