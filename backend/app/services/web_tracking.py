"""Validaciones puras para el collector público de tracking web."""

from __future__ import annotations

import re
from urllib.parse import urlparse


PUBLIC_SITE_ID_PATTERN = re.compile(r"^talia_site_[a-z0-9][a-z0-9_-]{5,127}$")


def normalize_public_site_id(value: str | None) -> str | None:
    candidate = str(value or "").strip().lower()
    if not candidate or not PUBLIC_SITE_ID_PATTERN.fullmatch(candidate):
        return None
    return candidate


def normalize_tracking_domain(value: str | None) -> str | None:
    """Normaliza un hostname de Origin/Referer, sin aceptar rutas ni credenciales."""

    raw = str(value or "").strip()
    if not raw:
        return None

    candidate = raw
    if "://" not in candidate:
        candidate = f"https://{candidate}"
    try:
        parsed = urlparse(candidate)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or parsed.username or parsed.password:
        return None

    hostname = (parsed.hostname or "").strip().rstrip(".").lower()
    if not hostname:
        return None
    try:
        hostname = hostname.encode("idna").decode("ascii")
    except UnicodeError:
        return None
    if len(hostname) > 253 or "." not in hostname:
        return None
    if any(
        part == ""
        or len(part) > 63
        or part.startswith("-")
        or part.endswith("-")
        for part in hostname.split(".")
    ):
        return None
    if not re.fullmatch(r"[a-z0-9.-]+", hostname):
        return None
    return hostname


def request_tracking_domain(*, origin: str | None, referer: str | None) -> str | None:
    """Obtiene el sitio que originó el evento; Origin tiene precedencia."""

    return normalize_tracking_domain(origin) or normalize_tracking_domain(referer)
