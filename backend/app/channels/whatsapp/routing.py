"""Helper para determinar el tenant asociado al canal WhatsApp."""

from __future__ import annotations

from typing import Any

from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError
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


def _normalize_phone_key(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().replace(" ", "")
    if normalized and not normalized.startswith("+") and normalized.replace("+", "").isdigit():
        return f"+{normalized}"
    if normalized:
        return normalized
    return None


def _whatsapp_phone_map() -> dict[str, str]:
    configured = getattr(settings, "whatsapp_phone_org_map", {}) or {}
    normalized: dict[str, str] = {}
    for phone, org in configured.items():
        key = _normalize_phone_key(phone)
        org_value = _safe_str_value(org)
        if key and org_value:
            normalized[key] = org_value
    default_org = _safe_str_value(settings.whatsapp_default_organizacion_id)
    default_phone = _normalize_phone_key(settings.twilio_phone_number)
    if default_org and default_phone and default_phone not in normalized:
        normalized[default_phone] = default_org
    return normalized


async def resolve_whatsapp_organizacion(
    *,
    to_number: str | None = None,
    contact: dict[str, Any] | None = None,
) -> str | None:
    """Devuelve la organización asociada a un número o contacto."""
    if contact and isinstance(contact, dict):
        contact_org = _safe_str_value(contact.get("organizacion_id"))
        if contact_org:
            return contact_org

    phone_key = _normalize_phone_key(to_number)
    if phone_key:
        resolved = await resolve_organizacion_id(canal="whatsapp", clave=phone_key)
        if resolved:
            return resolved

    phone_map = _whatsapp_phone_map()
    if phone_key and phone_key in phone_map:
        return phone_map[phone_key]
    return _safe_str_value(settings.whatsapp_default_organizacion_id)


async def resolve_whatsapp_organizacion_by_phone_number_id(
    *, phone_number_id: str | None
) -> str | None:
    """Resuelve la organización desde el `phone_number_id` de Meta."""
    phone_key = _safe_str_value(phone_number_id)
    if not phone_key:
        return None
    try:
        repo = PlatformRepository()
        resolved = await repo.resolve_org_for_meta_phone_number_id(phone_number_id=phone_key)
    except PlatformRepositoryError:
        return None
    return _safe_str_value(resolved)
