"""Helper para resolver qué tenant usa cada page_id de Messenger."""

from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.services.channel_routing import resolve_organizacion_id


def _safe_str_value(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    try:
        text = str(value).strip()
    except Exception:
        return None
    return text or None


def _normalize_page_key(value: str | None) -> str | None:
    if not value:
        return None
    candidate = value.strip()
    return candidate or None


def _configured_page_map() -> dict[str, str]:
    configured = getattr(settings, "messenger_page_organizacion_map", {}) or {}
    normalized: dict[str, str] = {}
    for page_value, org_value in configured.items():
        page_key = _normalize_page_key(page_value)
        org_key = _safe_str_value(org_value)
        if page_key and org_key:
            normalized[page_key.lower()] = org_key
    return normalized


async def resolve_messenger_organizacion(*, page_id: str | None = None) -> str | None:
    """Devuelve el organizacion_id que maneja la página de Messenger (si existe)."""
    page_key = _normalize_page_key(page_id)
    if not page_key:
        return _safe_str_value(settings.messenger_default_organizacion_id)

    configured = _configured_page_map()
    normalized = page_key.lower()
    if normalized in configured:
        return configured[normalized]

    resolved = await resolve_organizacion_id(canal="messenger", clave=normalized)
    if resolved:
        return resolved
    return _safe_str_value(settings.messenger_default_organizacion_id)
