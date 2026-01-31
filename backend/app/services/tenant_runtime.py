"""Lectura de configuración/secretos por tenant para uso en runtime (no admin UI).

Este módulo permite que el backend use:
- `public.organizaciones.config` (JSONB) para valores no secretos, y
- `public.secretos` (cifrado) para tokens/keys por tenant,

con fallback a valores globales de `.env` mientras migramos.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.core.secrets_crypto import SecretsCryptoError, decrypt_secret

logger = get_logger("app.services.tenant_runtime")

MASTER_ORGANIZACION_ID = UUID("00000000-0000-0000-0000-000000000001")

_CONFIG_CACHE: dict[str, Any] = {}
_CONFIG_CACHE_EXPIRES: dict[str, datetime] = {}
_SECRET_CACHE: dict[str, Any] = {}
_SECRET_CACHE_EXPIRES: dict[str, datetime] = {}

CONFIG_TTL_SECONDS = 60
SECRET_TTL_SECONDS = 60


class TenantRuntimeError(RuntimeError):
    """Errores al resolver configuración de tenant."""


@dataclass(slots=True)
class WebchatRuntimeSettings:
    openai_api_key: str | None
    assistant_id: str | None
    prompt_version: str | None
    inactivity_hours: int | None


def _as_dict(value: Any) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def _get_nested(config: dict[str, Any], dotted: str) -> Any:
    current: Any = config
    for part in dotted.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _tier_from_label(etiqueta: str | None) -> str:
    if not etiqueta:
        return "A"
    text = etiqueta.lower()
    if "tier:b" in text or "tier=b" in text or "tier b" in text:
        return "B"
    return "A"


def _require_supabase() -> tuple[str, str]:
    if not settings.supabase_url or not settings.supabase_service_role:
        raise TenantRuntimeError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE).")
    return settings.supabase_url.rstrip("/"), settings.supabase_service_role


async def _supabase_get(path: str, *, params: dict[str, str]) -> Any:
    base_url, service_role = _require_supabase()
    url = f"{base_url}{path}"
    headers = {
        "Accept": "application/json",
        "apikey": service_role,
        "Authorization": f"Bearer {service_role}",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, params=params, headers=headers)
    if resp.status_code >= 400:
        raise TenantRuntimeError(f"supabase_error:{resp.status_code}:{path}")
    return resp.json()


async def get_org_config(*, organizacion_id: UUID) -> dict[str, Any]:
    cache_key = str(organizacion_id)
    now = datetime.now(timezone.utc)
    expires = _CONFIG_CACHE_EXPIRES.get(cache_key)
    if expires and expires > now:
        cached = _CONFIG_CACHE.get(cache_key)
        if isinstance(cached, dict):
            return cached

    data = await _supabase_get(
        "/rest/v1/organizaciones",
        params={"select": "config", "id": f"eq.{organizacion_id}", "limit": "1"},
    )
    config: dict[str, Any] = {}
    if isinstance(data, list) and data and isinstance(data[0], dict):
        config = _as_dict(data[0].get("config")) or {}

    _CONFIG_CACHE[cache_key] = config
    _CONFIG_CACHE_EXPIRES[cache_key] = now + timedelta(seconds=CONFIG_TTL_SECONDS)
    return config


async def get_secret_plaintext(*, organizacion_id: UUID, clave: str) -> str | None:
    key = clave.strip().lower()
    cache_key = f"{organizacion_id}:{key}"
    now = datetime.now(timezone.utc)
    expires = _SECRET_CACHE_EXPIRES.get(cache_key)
    if expires and expires > now:
        cached = _SECRET_CACHE.get(cache_key)
        return cached if isinstance(cached, str) else None

    data = await _supabase_get(
        "/rest/v1/secretos",
        params={
            "select": "nonce,valor_cifrado,etiqueta",
            "organizacion_id": f"eq.{organizacion_id}",
            "clave": f"eq.{key}",
            "limit": "1",
        },
    )
    if not isinstance(data, list) or not data or not isinstance(data[0], dict):
        _SECRET_CACHE[cache_key] = None
        _SECRET_CACHE_EXPIRES[cache_key] = now + timedelta(seconds=SECRET_TTL_SECONDS)
        return None

    row = data[0]
    nonce = row.get("nonce")
    ciphertext = row.get("valor_cifrado")
    etiqueta = row.get("etiqueta")
    if not isinstance(nonce, str) or not isinstance(ciphertext, str):
        return None

    tier = _tier_from_label(etiqueta if isinstance(etiqueta, str) else None)
    master_key = settings.secrets_master_key_high if tier == "B" else settings.secrets_master_key
    if not master_key:
        logger.warning(
            "tenant_secret_master_key_missing",
            extra={"organizacion_id": str(organizacion_id), "clave": key, "tier": tier},
        )
        return None

    aad = f"org:{organizacion_id}:key:{key}:tier:{tier}"
    try:
        plaintext = decrypt_secret(
            nonce_b64=nonce,
            ciphertext_b64=ciphertext,
            master_key=master_key,
            aad=aad,
        )
    except SecretsCryptoError as exc:
        logger.warning(
            "tenant_secret_decrypt_failed",
            extra={"organizacion_id": str(organizacion_id), "clave": key, "tier": tier, "error": str(exc)},
        )
        return None

    _SECRET_CACHE[cache_key] = plaintext
    _SECRET_CACHE_EXPIRES[cache_key] = now + timedelta(seconds=SECRET_TTL_SECONDS)
    return plaintext


async def get_webchat_runtime_settings(*, organizacion_id: UUID) -> WebchatRuntimeSettings:
    config = await get_org_config(organizacion_id=organizacion_id)
    webchat = _as_dict(config.get("webchat")) or {}
    assistant_id = webchat.get("assistant_id") if isinstance(webchat.get("assistant_id"), str) else None
    prompt_version = webchat.get("prompt_version") if isinstance(webchat.get("prompt_version"), str) else None

    inactivity_hours_raw = webchat.get("inactivity_hours")
    inactivity_hours = None
    if isinstance(inactivity_hours_raw, int):
        inactivity_hours = inactivity_hours_raw
    elif isinstance(inactivity_hours_raw, float):
        inactivity_hours = int(inactivity_hours_raw)

    openai_api_key = await get_secret_plaintext(organizacion_id=organizacion_id, clave="openai.api_key")
    if not openai_api_key:
        openai_api_key = settings.openai_api_key  # fallback legacy

    return WebchatRuntimeSettings(
        openai_api_key=openai_api_key,
        assistant_id=assistant_id,
        prompt_version=prompt_version,
        inactivity_hours=inactivity_hours,
    )


@dataclass(slots=True)
class CalendarRuntimeSettings:
    resource_id: str | None
    timezone: str
    default_days: int
    hold_minutes: int


def _coerce_int(value: Any, default: int) -> int:
    if isinstance(value, int):
        return value
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_timezone(value: Any, fallback: str) -> str:
    if isinstance(value, str):
        candidate = value.strip()
        if candidate:
            return candidate
    return fallback


async def get_calendar_runtime_settings(
    *,
    organizacion_id: UUID | None = None,
) -> CalendarRuntimeSettings:
    default_timezone = settings.webchat_calendar_timezone
    default_days = settings.webchat_calendar_default_days
    default_hold = settings.webchat_calendar_hold_minutes

    settings_payload = CalendarRuntimeSettings(
        resource_id=settings.webchat_calendar_resource_id,
        timezone=default_timezone,
        default_days=default_days,
        hold_minutes=default_hold,
    )

    if organizacion_id is None:
        return settings_payload

    config = await get_org_config(organizacion_id=organizacion_id)
    webchat = _as_dict(config.get("webchat")) or {}
    calendar = _as_dict(webchat.get("calendar")) or {}

    resource_id = calendar.get("resource_id")
    if isinstance(resource_id, str) and resource_id.strip():
        settings_payload.resource_id = resource_id.strip()

    timezone = calendar.get("timezone")
    settings_payload.timezone = _normalize_timezone(timezone, settings_payload.timezone)

    settings_payload.default_days = _coerce_int(calendar.get("default_days"), settings_payload.default_days)
    settings_payload.hold_minutes = _coerce_int(calendar.get("hold_minutes"), settings_payload.hold_minutes)

    if not settings_payload.resource_id:
        settings_payload.resource_id = settings.webchat_calendar_resource_id

    return settings_payload


async def get_primary_webchat_alias(*, organizacion_id: UUID) -> str | None:
    """Devuelve el alias principal (primera ruta activa) para webchat."""
    data = await _supabase_get(
        "/rest/v1/organizacion_rutas_canal",
        params={
            "select": "clave,activo,creado_en",
            "organizacion_id": f"eq.{organizacion_id}",
            "canal": "eq.webchat",
            "activo": "eq.true",
            "order": "creado_en.asc",
            "limit": "1",
        },
    )
    if not isinstance(data, list) or not data or not isinstance(data[0], dict):
        return None
    clave = data[0].get("clave")
    return clave.strip() if isinstance(clave, str) and clave.strip() else None
