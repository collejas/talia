"""Helper para resolver nombres de estados y municipios mexicanos."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Mapping

BASE_DIR = Path(__file__).resolve().parent
MUNICIPIOS_DIR = BASE_DIR / "municipios"
MANIFEST_PATH = MUNICIPIOS_DIR / "manifest.json"

try:
    _MANIFEST: Mapping[str, Mapping[str, str]] | None
    with MANIFEST_PATH.open(encoding="utf-8") as handle:
        _MANIFEST = json.load(handle)
except Exception:  # pragma: no cover - debe existir el manifiesto
    _MANIFEST = {}


def _normalize_state_code(value: str | None) -> str:
    if not value:
        return ""
    return str(value).strip().zfill(2)


def _normalize_municipality_code(value: str | None) -> str:
    if not value:
        return ""
    return str(value).strip().zfill(3)


def get_state_name(state_code: str | None) -> str | None:
    code = _normalize_state_code(state_code)
    if not code or not _MANIFEST:
        return None
    entry = _MANIFEST.get(code)
    return entry.get("name") if entry else None


@lru_cache(maxsize=None)
def _load_municipalities_for_state(state_code: str) -> Mapping[str, str]:
    if not _MANIFEST:
        return {}
    entry = _MANIFEST.get(state_code)
    if not entry:
        return {}
    path = MUNICIPIOS_DIR / entry.get("path", "")
    if not path.exists():
        return {}
    try:
        with path.open(encoding="utf-8") as handle:
            data = json.load(handle)
    except Exception:
        return {}
    features = data.get("features") or []
    municipios: dict[str, str] = {}
    for feature in features:
        props = feature.get("properties") or {}
        code = _normalize_municipality_code(props.get("cve_mun"))
        name = props.get("nom_mun")
        if code and name:
            municipios[code] = name
    return municipios


def get_municipality_name(state_code: str | None, municipality_code: str | None) -> str | None:
    state = _normalize_state_code(state_code)
    muni = _normalize_municipality_code(municipality_code)
    if not state or not muni:
        return None
    municipios = _load_municipalities_for_state(state)
    return municipios.get(muni)
