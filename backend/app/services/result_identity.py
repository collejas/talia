"""Helpers para identidad y deduplicacion de resultados de prospeccion."""

from __future__ import annotations

import re
import unicodedata
from typing import Any


def _normalize_token(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip().lower()
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", text)
    without_marks = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    collapsed = re.sub(r"[^a-z0-9]+", " ", without_marks)
    return re.sub(r"\s+", " ", collapsed).strip()


def _normalize_source(value: Any) -> str:
    source = str(value or "").strip().lower()
    if not source:
        return "unknown"
    normalized = unicodedata.normalize("NFKD", source)
    without_marks = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    compact = re.sub(r"[^a-z0-9_]+", "_", without_marks)
    compact = re.sub(r"_+", "_", compact).strip("_")
    return compact or "unknown"


def _normalize_external_id(value: Any) -> str:
    token = _normalize_token(value)
    return token.replace(" ", "")


def build_result_dedupe_key(
    fuente: str,
    *,
    external_id: Any = None,
    name: Any = None,
    razon_social: Any = None,
    address: Any = None,
    phone: Any = None,
    email: Any = None,
    website: Any = None,
    actividad: Any = None,
    estrato: Any = None,
) -> str:
    """Genera una clave estable para agrupar resultados equivalentes."""

    source = _normalize_source(fuente)
    ext = _normalize_external_id(external_id)
    if ext:
        return f"{source}:ext:{ext}"

    tokens = [
        _normalize_token(name),
        _normalize_token(razon_social),
        _normalize_token(address),
        _normalize_token(phone),
        _normalize_token(email),
        _normalize_token(website),
        _normalize_token(actividad),
        _normalize_token(estrato),
    ]
    payload = "|".join(token for token in tokens if token)
    import hashlib

    digest = hashlib.md5(payload.encode("utf-8")).hexdigest()
    return f"{source}:md5:{digest}"
