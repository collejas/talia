"""Lectura de configuración/secretos por tenant para uso en runtime (no admin UI).

Este módulo permite que el backend use:
- `public.organizaciones.config` (JSONB) para valores no secretos, y
- `public.secretos` (cifrado) para tokens/keys por tenant,

con fallback a valores globales de `.env` mientras migramos.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

import httpx

from app.core.config import resolve_log_path, settings
from app.core.logging import get_logger
from app.core.secrets_crypto import SecretsCryptoError, decrypt_secret

logger = get_logger("app.services.tenant_runtime")

MASTER_ORGANIZACION_ID = UUID("00000000-0000-0000-0000-000000000001")

_CONFIG_CACHE: dict[str, Any] = {}
_CONFIG_CACHE_EXPIRES: dict[str, datetime] = {}
_SECRET_CACHE: dict[str, Any] = {}
_SECRET_CACHE_EXPIRES: dict[str, datetime] = {}
_PUBLIC_URL_CACHE: dict[str, str | None] = {}
_PUBLIC_URL_CACHE_EXPIRES: dict[str, datetime] = {}

CONFIG_TTL_SECONDS = 60
SECRET_TTL_SECONDS = 60
PUBLIC_URL_TTL_SECONDS = 300
SUPABASE_CONNECTIVITY_LOG_FILE = resolve_log_path("supabase-connectivity.log")
_TRANSIENT_SUPABASE_ERROR_MARKERS = (
    "No address associated with hostname",
    "[Errno -5]",
    "Temporary failure in name resolution",
    "ConnectError",
    "ReadTimeout",
    "PoolTimeout",
)


class TenantRuntimeError(RuntimeError):
    """Errores al resolver configuración de tenant."""


@dataclass(slots=True)
class WebchatRuntimeSettings:
    openai_api_key: str | None
    assistant_id: str | None
    prompt_version: str | None
    inactivity_minutes: int | None
    project_id: str | None


@dataclass(slots=True)
class DenueRuntimeSettings:
    token: str | None
    base_url: str | None


@dataclass(slots=True)
class GooglePlacesRuntimeSettings:
    api_key: str | None
    nearby_url: str
    text_url: str
    details_url: str
    field_mask: str | None
    details_field_mask: str | None
    language_code: str | None
    region_code: str | None
    grid_max_tile_radius_m: int
    pause_between_pages: float
    dense_grid_max_tile_radius_m: int
    dense_pause_between_pages: float
    dense_max_results: int | None


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


def normalize_public_base_url(value: Any) -> str | None:
    text = value.strip() if isinstance(value, str) else (str(value).strip() if value is not None else "")
    if not text:
        return None
    parsed = httpx.URL(text)
    if not parsed.scheme or not parsed.host:
        return None
    path = parsed.path.rstrip("/") if parsed.path not in {"", "/"} else ""
    normalized = f"{parsed.scheme}://{parsed.host}"
    if parsed.port:
        normalized += f":{parsed.port}"
    if path:
        normalized += path
    return normalized


def _has_supabase() -> bool:
    return bool(settings.supabase_url and settings.supabase_service_role)


def _require_supabase() -> tuple[str, str]:
    if not _has_supabase():
        raise TenantRuntimeError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE).")
    return settings.supabase_url.rstrip("/"), settings.supabase_service_role


def _is_transient_supabase_error_message(value: Any) -> bool:
    text = str(value or "")
    return any(marker in text for marker in _TRANSIENT_SUPABASE_ERROR_MARKERS)


def _append_supabase_connectivity_event(entry: dict[str, Any]) -> None:
    try:
        Path(SUPABASE_CONNECTIVITY_LOG_FILE).parent.mkdir(parents=True, exist_ok=True)
        with SUPABASE_CONNECTIVITY_LOG_FILE.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False))
            handle.write("\n")
    except Exception:
        logger.debug("tenant_runtime.supabase_connectivity_log_write_failed", exc_info=True)


def invalidate_runtime_cache(*, organizacion_id: UUID | None = None) -> None:
    """Invalida el cache local de config/secretos para un tenant.

    Se usa después de mutaciones de settings para que el runtime lea la
    versión recién guardada en la siguiente petición, sin esperar al TTL.
    """

    if organizacion_id is None:
        _CONFIG_CACHE.clear()
        _CONFIG_CACHE_EXPIRES.clear()
        _SECRET_CACHE.clear()
        _SECRET_CACHE_EXPIRES.clear()
        return

    cache_prefix = f"{organizacion_id}:"
    _CONFIG_CACHE.pop(str(organizacion_id), None)
    _CONFIG_CACHE_EXPIRES.pop(str(organizacion_id), None)
    for key in list(_SECRET_CACHE.keys()):
        if key.startswith(cache_prefix):
            _SECRET_CACHE.pop(key, None)
            _SECRET_CACHE_EXPIRES.pop(key, None)


async def _supabase_get(path: str, *, params: dict[str, str]) -> Any:
    base_url, service_role = _require_supabase()
    url = f"{base_url}{path}"
    headers = {
        "Accept": "application/json",
        "apikey": service_role,
        "Authorization": f"Bearer {service_role}",
    }
    retries = 2
    retry_delay_seconds = 0.5
    resp: httpx.Response | None = None
    for attempt in range(1, retries + 2):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, params=params, headers=headers)
            if attempt > 1:
                _append_supabase_connectivity_event(
                    {
                        "captured_at": datetime.now(timezone.utc).isoformat(),
                        "event_type": "transient_recovered",
                        "operation": f"tenant_runtime GET {path}",
                        "attempt": attempt,
                        "retries_configured": retries,
                    }
                )
            break
        except httpx.RequestError as exc:
            if attempt < retries + 1 and _is_transient_supabase_error_message(exc):
                _append_supabase_connectivity_event(
                    {
                        "captured_at": datetime.now(timezone.utc).isoformat(),
                        "event_type": "transient_retry_scheduled",
                        "operation": f"tenant_runtime GET {path}",
                        "attempt": attempt,
                        "next_attempt": attempt + 1,
                        "retries_configured": retries,
                        "error": str(exc),
                    }
                )
                await asyncio.sleep(retry_delay_seconds)
                continue
            if _is_transient_supabase_error_message(exc):
                _append_supabase_connectivity_event(
                    {
                        "captured_at": datetime.now(timezone.utc).isoformat(),
                        "event_type": "transient_failure",
                        "operation": f"tenant_runtime GET {path}",
                        "attempt": attempt,
                        "retries_configured": retries,
                        "error": str(exc),
                    }
                )
            raise
    if resp is None:
        raise TenantRuntimeError(f"supabase_error:request_failed:{path}")
    if resp.status_code >= 400:
        body = resp.text
        logger.warning(
            "tenant_runtime.supabase_get_error",
            extra={
                "path": path,
                "params": params,
                "status_code": resp.status_code,
                "body": body[:1024] if isinstance(body, str) else None,
            },
        )
        raise TenantRuntimeError(f"supabase_error:{resp.status_code}:{path}")
    return resp.json()


async def get_org_config(*, organizacion_id: UUID, force_refresh: bool = False) -> dict[str, Any]:
    cache_key = str(organizacion_id)
    now = datetime.now(timezone.utc)
    if not force_refresh:
        expires = _CONFIG_CACHE_EXPIRES.get(cache_key)
        if expires and expires > now:
            cached = _CONFIG_CACHE.get(cache_key)
            if isinstance(cached, dict):
                return cached

    if not _has_supabase():
        return {}

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


async def get_org_public_base_url(*, organizacion_id: UUID, force_refresh: bool = False) -> str | None:
    cache_key = str(organizacion_id)
    now = datetime.now(timezone.utc)
    if not force_refresh:
        expires = _PUBLIC_URL_CACHE_EXPIRES.get(cache_key)
        if expires and expires > now:
            return _PUBLIC_URL_CACHE.get(cache_key)

    if not _has_supabase():
        return None

    data = await _supabase_get(
        "/rest/v1/organizaciones",
        params={
            "select": "sitio_web,dominio_principal",
            "id": f"eq.{organizacion_id}",
            "limit": "1",
        },
    )
    public_base_url: str | None = None
    if isinstance(data, list) and data and isinstance(data[0], dict):
        row = data[0]
        public_base_url = normalize_public_base_url(row.get("dominio_principal")) or normalize_public_base_url(
            row.get("sitio_web")
        )

    _PUBLIC_URL_CACHE[cache_key] = public_base_url
    _PUBLIC_URL_CACHE_EXPIRES[cache_key] = now + timedelta(seconds=PUBLIC_URL_TTL_SECONDS)
    return public_base_url


async def get_secret_plaintext(
    *,
    organizacion_id: UUID | None,
    clave: str,
    force_refresh: bool = False,
) -> str | None:
    if organizacion_id is None:
        return None
    key = clave.strip().lower()
    cache_key = f"{organizacion_id}:{key}"
    now = datetime.now(timezone.utc)
    if not force_refresh:
        expires = _SECRET_CACHE_EXPIRES.get(cache_key)
        if expires and expires > now:
            cached = _SECRET_CACHE.get(cache_key)
            return cached if isinstance(cached, str) else None

    if not _has_supabase():
        _SECRET_CACHE[cache_key] = None
        _SECRET_CACHE_EXPIRES[cache_key] = now + timedelta(seconds=SECRET_TTL_SECONDS)
        return None

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


def _openai_secret_candidates(channel: str | None) -> list[str]:
    if channel == "voice":
        return ["openai.voice.api_key", "openai.general.api_key", "openai.api_key"]
    return ["openai.general.api_key", "openai.api_key"]


async def get_openai_api_key(
    *,
    organizacion_id: UUID | None,
    channel: str | None = None,
    force_refresh: bool = False,
) -> str | None:
    for key in _openai_secret_candidates(channel):
        value = await get_secret_plaintext(
            organizacion_id=organizacion_id,
            clave=key,
            force_refresh=force_refresh,
        )
        if value:
            return value
    return settings.openai_api_key


async def get_openai_project_id(*, organizacion_id: UUID | None) -> str | None:
    if organizacion_id is None:
        return settings.openai_project_id
    config = await get_org_config(organizacion_id=organizacion_id)
    openai_cfg = _as_dict(config.get("openai")) or {}
    general_cfg = _as_dict(openai_cfg.get("general")) or {}
    return _coerce_str_or_none(general_cfg.get("project_id")) or settings.openai_project_id


async def get_webchat_runtime_settings(*, organizacion_id: UUID) -> WebchatRuntimeSettings:
    config = await get_org_config(organizacion_id=organizacion_id)
    webchat = _as_dict(config.get("webchat")) or {}
    openai_cfg = _as_dict(config.get("openai")) or {}
    general_cfg = _as_dict(openai_cfg.get("general")) or {}
    assistant_id = webchat.get("assistant_id") if isinstance(webchat.get("assistant_id"), str) else None
    prompt_version = webchat.get("prompt_version") if isinstance(webchat.get("prompt_version"), str) else None

    inactivity_minutes_raw = webchat.get("inactivity_minutes")
    inactivity_hours_raw = webchat.get("inactivity_hours")
    inactivity_minutes = None
    if isinstance(inactivity_minutes_raw, int):
        inactivity_minutes = inactivity_minutes_raw
    elif isinstance(inactivity_minutes_raw, float):
        inactivity_minutes = int(inactivity_minutes_raw)
    elif isinstance(inactivity_hours_raw, int):
        inactivity_minutes = inactivity_hours_raw * 60
    elif isinstance(inactivity_hours_raw, float):
        inactivity_minutes = int(inactivity_hours_raw * 60)
    if isinstance(inactivity_minutes, int) and inactivity_minutes < 1:
        inactivity_minutes = 1

    openai_api_key = await get_openai_api_key(organizacion_id=organizacion_id)
    project_id = _coerce_str_or_none(general_cfg.get("project_id")) or settings.openai_project_id

    return WebchatRuntimeSettings(
        openai_api_key=openai_api_key,
        assistant_id=assistant_id,
        prompt_version=prompt_version,
        inactivity_minutes=inactivity_minutes,
        project_id=project_id,
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


def _coerce_int_or_none(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _coerce_str(value: Any) -> str | None:
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    if value is None:
        return None
    candidate = str(value).strip()
    return candidate or None


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


@dataclass(slots=True)
class CalendarProviderSettings:
    provider: str | None
    server_url: str | None
    server_url_alternate: str | None
    server_port: int | None
    full_calendar_url: str | None
    full_contact_list_url: str | None

    @staticmethod
    def from_settings() -> "CalendarProviderSettings":
        return CalendarProviderSettings(
            provider=settings.calendar_provider,
            server_url=settings.calendar_server_url,
            server_url_alternate=settings.calendar_server_url_alternate,
            server_port=settings.calendar_server_port,
            full_calendar_url=settings.calendar_full_calendar_url,
            full_contact_list_url=settings.calendar_full_contact_list_url,
        )


async def get_calendar_provider_settings(
    *,
    organizacion_id: UUID | None = None,
) -> CalendarProviderSettings:
    settings_payload = CalendarProviderSettings.from_settings()
    if organizacion_id is None:
        return settings_payload

    config = await get_org_config(organizacion_id=organizacion_id)
    calendar_cfg = _as_dict(config.get("calendar")) or {}
    provider_value = _coerce_str(calendar_cfg.get("provider"))
    if provider_value is not None:
        settings_payload.provider = provider_value
    server_url_value = _coerce_str(calendar_cfg.get("server_url"))
    if server_url_value is not None:
        settings_payload.server_url = server_url_value
    server_url_alt = _coerce_str(calendar_cfg.get("server_url_alternate"))
    if server_url_alt is not None:
        settings_payload.server_url_alternate = server_url_alt
    port_value = _coerce_int_or_none(calendar_cfg.get("server_port"))
    if port_value is not None:
        settings_payload.server_port = port_value
    full_calendar_url_value = _coerce_str(calendar_cfg.get("full_calendar_url"))
    if full_calendar_url_value is not None:
        settings_payload.full_calendar_url = full_calendar_url_value
    contact_list_url_value = _coerce_str(calendar_cfg.get("full_contact_list_url"))
    if contact_list_url_value is not None:
        settings_payload.full_contact_list_url = contact_list_url_value

    return settings_payload


@dataclass(slots=True)
class ZoomRuntimeSettings:
    enabled: bool
    provider: str | None
    host_email: str | None
    default_duration_minutes: int
    auto_create_meeting: bool
    account_id: str | None
    client_id: str | None
    client_secret: str | None
    api_base_url: str


@dataclass(slots=True)
class MailRuntimeSettings:
    username: str | None
    password: str | None
    incoming_server: str | None
    incoming_port_imap: int | None
    outgoing_server: str | None
    outgoing_port_smtp: int | None
    use_ssl: bool
    use_tls: bool
    from_name: str | None
    reply_to: str | None

    @staticmethod
    def from_settings() -> "MailRuntimeSettings":
        return MailRuntimeSettings(
            username=settings.mail_username,
            password=settings.mail_password,
            incoming_server=settings.mail_incoming_server,
            incoming_port_imap=settings.mail_incoming_port_imap,
            outgoing_server=settings.mail_outgoing_server,
            outgoing_port_smtp=settings.mail_outgoing_port_smtp,
            use_ssl=settings.mail_use_ssl,
            use_tls=settings.mail_use_tls,
            from_name=settings.mail_from_name,
            reply_to=None,
        )


def _coerce_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "t", "yes", "y"}:
            return True
        if lowered in {"0", "false", "f", "no", "n"}:
            return False
    return default


async def get_zoom_runtime_settings(
    *,
    organizacion_id: UUID | None = None,
) -> ZoomRuntimeSettings:
    settings_payload = ZoomRuntimeSettings(
        enabled=False,
        provider="zoom",
        host_email=None,
        default_duration_minutes=30,
        auto_create_meeting=True,
        account_id=None,
        client_id=None,
        client_secret=None,
        api_base_url=settings.zoom_api_base_url,
    )
    if organizacion_id is None:
        return settings_payload

    config = await get_org_config(organizacion_id=organizacion_id)
    zoom_cfg = _as_dict(config.get("zoom")) or {}
    provider_value = _coerce_str(zoom_cfg.get("provider"))
    if provider_value is not None:
        settings_payload.provider = provider_value
    enabled_value = zoom_cfg.get("enabled")
    if enabled_value is not None:
        settings_payload.enabled = _coerce_bool(enabled_value, settings_payload.enabled)
    host_email_value = _coerce_str(zoom_cfg.get("host_email"))
    if host_email_value is not None:
        settings_payload.host_email = host_email_value
    duration_value = _coerce_int_or_none(zoom_cfg.get("default_duration_minutes"))
    if duration_value is not None and duration_value > 0:
        settings_payload.default_duration_minutes = min(duration_value, 240)
    auto_create_value = zoom_cfg.get("auto_create_meeting")
    if auto_create_value is not None:
        settings_payload.auto_create_meeting = _coerce_bool(
            auto_create_value, settings_payload.auto_create_meeting
        )
    api_base_value = _coerce_str(zoom_cfg.get("api_base_url"))
    if api_base_value is not None:
        settings_payload.api_base_url = api_base_value

    account_id_secret = await get_secret_plaintext(
        organizacion_id=organizacion_id, clave="zoom.account_id"
    )
    if account_id_secret:
        settings_payload.account_id = account_id_secret
    client_id_secret = await get_secret_plaintext(
        organizacion_id=organizacion_id, clave="zoom.client_id"
    )
    if client_id_secret:
        settings_payload.client_id = client_id_secret
    client_secret_secret = await get_secret_plaintext(
        organizacion_id=organizacion_id, clave="zoom.client_secret"
    )
    if client_secret_secret:
        settings_payload.client_secret = client_secret_secret

    return settings_payload


async def get_mail_runtime_settings(
    *,
    organizacion_id: UUID | None = None,
) -> MailRuntimeSettings:
    settings_payload = MailRuntimeSettings.from_settings()
    if organizacion_id is None:
        return settings_payload

    config = await get_org_config(organizacion_id=organizacion_id)
    mail_cfg = _as_dict(config.get("mail")) or {}
    incoming_server = _coerce_str(mail_cfg.get("incoming_server"))
    if incoming_server is not None:
        settings_payload.incoming_server = incoming_server
    incoming_port = mail_cfg.get("incoming_port_imap")
    if incoming_port is not None:
        settings_payload.incoming_port_imap = _coerce_int(
            incoming_port, settings_payload.incoming_port_imap or 0
        )
    outgoing_server = _coerce_str(mail_cfg.get("outgoing_server"))
    if outgoing_server is not None:
        settings_payload.outgoing_server = outgoing_server
    outgoing_port = mail_cfg.get("outgoing_port_smtp")
    if outgoing_port is not None:
        settings_payload.outgoing_port_smtp = _coerce_int(
            outgoing_port, settings_payload.outgoing_port_smtp or 0
        )
    settings_payload.use_ssl = _coerce_bool(mail_cfg.get("use_ssl"), settings_payload.use_ssl)
    settings_payload.use_tls = _coerce_bool(mail_cfg.get("use_tls"), settings_payload.use_tls)
    from_name = _coerce_str(mail_cfg.get("from_name"))
    if from_name is not None:
        settings_payload.from_name = from_name
    reply_to = _coerce_str(mail_cfg.get("reply_to"))
    if reply_to is not None:
        settings_payload.reply_to = reply_to

    username_secret = await get_secret_plaintext(organizacion_id=organizacion_id, clave="mail.username")
    if username_secret:
        settings_payload.username = username_secret
    password_secret = await get_secret_plaintext(organizacion_id=organizacion_id, clave="mail.password")
    if password_secret:
        settings_payload.password = password_secret

    return settings_payload


async def get_denue_runtime_settings(
    *,
    organizacion_id: UUID | None = None,
) -> DenueRuntimeSettings:
    base_url = settings.denue_base_url
    token = settings.denue_token

    if organizacion_id is None:
        return DenueRuntimeSettings(token=token, base_url=base_url)

    config = await get_org_config(organizacion_id=organizacion_id)
    denue_cfg = _as_dict(config.get("denue")) or {}
    base_url_candidate = _coerce_str(denue_cfg.get("base_url"))
    if base_url_candidate is not None:
        base_url = base_url_candidate

    secret_token = await get_secret_plaintext(organizacion_id=organizacion_id, clave="denue.token")
    if secret_token:
        token = secret_token

    return DenueRuntimeSettings(token=token, base_url=base_url)


async def get_google_places_runtime_settings(
    *,
    organizacion_id: UUID | None = None,
) -> GooglePlacesRuntimeSettings:
    settings_payload = GooglePlacesRuntimeSettings(
        api_key=settings.google_places_api_key,
        nearby_url=settings.google_places_nearby_url,
        text_url=settings.google_places_text_url,
        details_url=settings.google_places_details_url,
        field_mask=settings.google_places_field_mask,
        details_field_mask=settings.google_places_details_field_mask,
        language_code=settings.google_places_language_code,
        region_code=settings.google_places_region_code,
        grid_max_tile_radius_m=settings.google_places_grid_max_tile_radius_m,
        pause_between_pages=settings.google_places_pause_between_pages,
        dense_grid_max_tile_radius_m=settings.google_places_dense_grid_max_tile_radius_m,
        dense_pause_between_pages=settings.google_places_dense_pause_between_pages,
        dense_max_results=settings.google_places_dense_max_results,
    )
    if organizacion_id is None:
        return settings_payload

    config = await get_org_config(organizacion_id=organizacion_id)
    google_cfg = _as_dict(config.get("google_places")) or {}

    nearby_url = _coerce_str(google_cfg.get("nearby_url"))
    if nearby_url is not None:
        settings_payload.nearby_url = nearby_url
    text_url = _coerce_str(google_cfg.get("text_url"))
    if text_url is not None:
        settings_payload.text_url = text_url
    details_url = _coerce_str(google_cfg.get("details_url"))
    if details_url is not None:
        settings_payload.details_url = details_url
    field_mask = _coerce_str(google_cfg.get("field_mask"))
    if field_mask is not None:
        settings_payload.field_mask = field_mask
    details_field_mask = _coerce_str(google_cfg.get("details_field_mask"))
    if details_field_mask is not None:
        settings_payload.details_field_mask = details_field_mask
    language_code = _coerce_str(google_cfg.get("language_code"))
    if language_code is not None:
        settings_payload.language_code = language_code
    region_code = _coerce_str(google_cfg.get("region_code"))
    if region_code is not None:
        settings_payload.region_code = region_code
    grid_max = google_cfg.get("grid_max_tile_radius_m")
    if grid_max is not None:
        settings_payload.grid_max_tile_radius_m = _coerce_int(grid_max, settings_payload.grid_max_tile_radius_m)
    pause_between = google_cfg.get("pause_between_pages")
    if pause_between is not None:
        settings_payload.pause_between_pages = _coerce_float(pause_between, settings_payload.pause_between_pages)
    dense_grid = google_cfg.get("dense_grid_max_tile_radius_m")
    if dense_grid is not None:
        settings_payload.dense_grid_max_tile_radius_m = _coerce_int(
            dense_grid, settings_payload.dense_grid_max_tile_radius_m
        )
    dense_pause = google_cfg.get("dense_pause_between_pages")
    if dense_pause is not None:
        settings_payload.dense_pause_between_pages = _coerce_float(
            dense_pause, settings_payload.dense_pause_between_pages
        )
    dense_max = google_cfg.get("dense_max_results")
    if dense_max is not None:
        settings_payload.dense_max_results = _coerce_positive_int_or_none(dense_max)

    api_key_secret = await get_secret_plaintext(organizacion_id=organizacion_id, clave="google.places_api_key")
    if api_key_secret:
        settings_payload.api_key = api_key_secret

    return settings_payload


@dataclass(slots=True)
class BrevoRuntimeSettings:
    api_key: str | None
    base_url: str
    sender_email: str | None = None
    sender_name: str | None = None


async def get_brevo_runtime_settings(
    *,
    organizacion_id: UUID | None = None,
) -> BrevoRuntimeSettings:
    settings_payload = BrevoRuntimeSettings(
        api_key=settings.brevo_api_key,
        base_url=(settings.brevo_base_url or "https://api.brevo.com/v3").strip().rstrip("/"),
    )
    if organizacion_id is None:
        return settings_payload

    config = await get_org_config(organizacion_id=organizacion_id)
    brevo_cfg = _as_dict(config.get("brevo")) or {}

    base_url_candidate = _coerce_str(brevo_cfg.get("base_url"))
    if base_url_candidate is not None:
        normalized = base_url_candidate.strip()
        settings_payload.base_url = normalized.rstrip("/") if normalized else normalized

    sender_email = _coerce_str(brevo_cfg.get("sender_email"))
    if sender_email is not None:
        settings_payload.sender_email = sender_email
    sender_name = _coerce_str(brevo_cfg.get("sender_name"))
    if sender_name is not None:
        settings_payload.sender_name = sender_name

    api_key_secret = await get_secret_plaintext(organizacion_id=organizacion_id, clave="brevo.api_key")
    if api_key_secret:
        settings_payload.api_key = api_key_secret

    return settings_payload


@dataclass(slots=True)
class TwilioRuntimeSettings:
    phone_number: str | None
    phone_number_sid: str | None
    validate_signatures: bool
    voice_webhook_path: str | None
    voice_full_duplex: bool
    voice_debug_verbose: bool
    voice_debug_energy_every_n: int | None
    account_sid: str | None
    auth_token: str | None
    voice_stream_jwt_secret: str | None


async def get_twilio_runtime_settings(
    *,
    organizacion_id: UUID | None = None,
) -> TwilioRuntimeSettings:
    phone_number = settings.twilio_phone_number
    phone_number_sid = settings.twilio_phone_number_sid
    validate_signatures = settings.twilio_validate_signatures
    webhook_path = settings.voice_webhook_path
    full_duplex = settings.voice_full_duplex
    debug_verbose = settings.voice_debug_verbose
    debug_energy = settings.voice_debug_energy_every_n

    if organizacion_id:
        config = await get_org_config(organizacion_id=organizacion_id)
        twilio_cfg = _as_dict(config.get("twilio")) or {}
        whatsapp_cfg = _as_dict(config.get("whatsapp")) or {}
        whatsapp_twilio_cfg = _as_dict(whatsapp_cfg.get("twilio")) or {}
        voice_cfg = _as_dict(config.get("voice")) or {}

        twilio_phone = whatsapp_twilio_cfg.get("phone_number")
        if not isinstance(twilio_phone, str) or not twilio_phone.strip():
            twilio_phone = twilio_cfg.get("phone_number")
        if isinstance(twilio_phone, str) and twilio_phone.strip():
            phone_number = twilio_phone.strip()
        twilio_phone_sid = whatsapp_twilio_cfg.get("phone_number_sid")
        if not isinstance(twilio_phone_sid, str) or not twilio_phone_sid.strip():
            twilio_phone_sid = twilio_cfg.get("phone_number_sid")
        if isinstance(twilio_phone_sid, str) and twilio_phone_sid.strip():
            phone_number_sid = twilio_phone_sid.strip()
        validate_signatures = _coerce_bool(
            whatsapp_twilio_cfg.get("validate_signatures"),
            _coerce_bool(twilio_cfg.get("validate_signatures"), validate_signatures),
        )

        webhook_value = voice_cfg.get("webhook_path")
        if isinstance(webhook_value, str) and webhook_value.strip():
            webhook_path = webhook_value.strip()
        full_duplex = _coerce_bool(voice_cfg.get("full_duplex"), full_duplex)
        debug_verbose = _coerce_bool(voice_cfg.get("debug_verbose"), debug_verbose)
        energy_value = voice_cfg.get("energy_every_n")
        if isinstance(energy_value, (int, float)):
            debug_energy = int(energy_value)
        elif isinstance(energy_value, str):
            try:
                debug_energy = int(energy_value.strip())
            except ValueError:
                pass

    account_sid = await get_secret_plaintext(organizacion_id=organizacion_id, clave="twilio.account_sid")
    if not account_sid:
        account_sid = settings.twilio_account_sid
    auth_token = await get_secret_plaintext(organizacion_id=organizacion_id, clave="twilio.auth_token")
    if not auth_token:
        auth_token = settings.twilio_auth_token
    voice_stream = await get_secret_plaintext(organizacion_id=organizacion_id, clave="voice.stream_jwt_secret")
    if not voice_stream:
        voice_stream = settings.voice_stream_jwt_secret

    return TwilioRuntimeSettings(
        phone_number=phone_number,
        phone_number_sid=phone_number_sid,
        validate_signatures=validate_signatures,
        voice_webhook_path=webhook_path,
        voice_full_duplex=full_duplex,
        voice_debug_verbose=debug_verbose,
        voice_debug_energy_every_n=debug_energy,
        account_sid=account_sid,
        auth_token=auth_token,
        voice_stream_jwt_secret=voice_stream,
    )


def _coerce_positive_int(value: Any, default: int) -> int:
    if isinstance(value, (int, float)):
        candidate = int(value)
        if candidate >= 0:
            return candidate
        return default
    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return default
        try:
            parsed = int(candidate)
        except ValueError:
            return default
        return parsed if parsed >= 0 else default
    return default


def _coerce_positive_int_or_none(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        candidate = int(value)
        return candidate if candidate >= 0 else None
    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return None
        try:
            parsed = int(candidate)
        except ValueError:
            return None
        return parsed if parsed >= 0 else None
    return None


def _coerce_str_or_none(value: Any) -> str | None:
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    if value is None:
        return None
    candidate = str(value).strip()
    return candidate or None


def _coerce_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


@dataclass(slots=True)
class WhatsappRuntimeSettings:
    provider: str
    assistant_id: str | None
    prompt_id: str | None
    prompt_version: str | None
    inactivity_minutes: int
    reengage_minutes: int
    reengage_max_attempts: int
    escalate_minutes: int
    sales_template_sid: str | None
    appointment_template_sid: str | None
    cancel_template_sid: str | None
    prospeccion_prompt_id: str | None
    prospeccion_prompt_version: str | None
    prospeccion_template_sids: list[str]
    project_id: str | None
    voice_model: str | None
    voice_max_tokens: int | None
    voice_stt_model: str | None
    voice_api_key: str | None
    twilio_phone_number: str | None
    twilio_phone_number_sid: str | None
    twilio_validate_signatures: bool
    twilio_account_sid: str | None
    twilio_auth_token: str | None
    meta_phone_number_id: str | None
    meta_page_access_token: str | None
    meta_verify_token: str | None
    meta_app_secret: str | None
    meta_graph_api_version: str | None

    @staticmethod
    def from_settings() -> "WhatsappRuntimeSettings":
        return WhatsappRuntimeSettings(
            provider="twilio",
            assistant_id=settings.whatsapp_assistant_id,
            prompt_id=settings.whatsapp_prompt_id,
            prompt_version=settings.whatsapp_prompt_version or settings.openai_prompt_version,
            inactivity_minutes=settings.whatsapp_inactivity_minutes,
            reengage_minutes=settings.whatsapp_reengage_minutes,
            reengage_max_attempts=max(1, int(settings.whatsapp_reengage_max_attempts)),
            escalate_minutes=settings.whatsapp_escalate_minutes,
            sales_template_sid=settings.whatsapp_sales_template_sid,
            appointment_template_sid=settings.whatsapp_sales_appointment_template_sid,
            cancel_template_sid=settings.whatsapp_sales_cancel_appointment_template_sid,
            prospeccion_prompt_id=None,
            prospeccion_prompt_version=None,
            prospeccion_template_sids=[],
            project_id=settings.openai_project_id,
            voice_model=settings.openai_model,
            voice_max_tokens=settings.openai_max_tokens,
            voice_stt_model=settings.openai_stt_model,
            voice_api_key=settings.openai_api_key,
            twilio_phone_number=settings.twilio_phone_number,
            twilio_phone_number_sid=settings.twilio_phone_number_sid,
            twilio_validate_signatures=settings.twilio_validate_signatures,
            twilio_account_sid=settings.twilio_account_sid,
            twilio_auth_token=settings.twilio_auth_token,
            meta_phone_number_id=None,
            meta_page_access_token=None,
            meta_verify_token=None,
            meta_app_secret=None,
            meta_graph_api_version="v21.0",
        )


async def get_whatsapp_runtime_settings(
    *,
    organizacion_id: UUID | None = None,
    force_refresh: bool = False,
) -> WhatsappRuntimeSettings:
    settings_payload = WhatsappRuntimeSettings.from_settings()
    if organizacion_id is None:
        return settings_payload

    config = await get_org_config(organizacion_id=organizacion_id, force_refresh=force_refresh)
    whatsapp_cfg = _as_dict(config.get("whatsapp")) or {}
    whatsapp_twilio_cfg = _as_dict(whatsapp_cfg.get("twilio")) or {}
    whatsapp_meta_cfg = _as_dict(whatsapp_cfg.get("meta")) or {}
    openai_cfg = _as_dict(config.get("openai")) or {}
    general_cfg = _as_dict(openai_cfg.get("general")) or {}
    voice_cfg = _as_dict(openai_cfg.get("voice")) or {}

    provider_value = _coerce_str_or_none(whatsapp_cfg.get("provider"))
    if provider_value is not None:
        settings_payload.provider = provider_value.lower()

    assistant_id = _coerce_str_or_none(voice_cfg.get("assistant_id"))
    if assistant_id is None:
        assistant_id = _coerce_str_or_none(whatsapp_cfg.get("assistant_id"))
    if assistant_id is not None:
        settings_payload.assistant_id = assistant_id

    prompt_id = _coerce_str_or_none(voice_cfg.get("prompt_id"))
    if prompt_id is None:
        prompt_id = _coerce_str_or_none(whatsapp_cfg.get("prompt_id"))
    if prompt_id is not None:
        settings_payload.prompt_id = prompt_id

    prompt_version = _coerce_str_or_none(voice_cfg.get("prompt_version"))
    if prompt_version is None:
        prompt_version = _coerce_str_or_none(whatsapp_cfg.get("prompt_version"))
    if prompt_version is not None:
        settings_payload.prompt_version = prompt_version

    inactivity_value = whatsapp_cfg.get("inactivity_minutes")
    if inactivity_value is not None:
        settings_payload.inactivity_minutes = _coerce_positive_int(inactivity_value, settings_payload.inactivity_minutes)

    settings_payload.reengage_minutes = _coerce_positive_int(
        whatsapp_cfg.get("reengage_minutes"), settings_payload.reengage_minutes
    )
    settings_payload.reengage_max_attempts = max(
        1,
        _coerce_positive_int(whatsapp_cfg.get("reengage_max_attempts"), settings_payload.reengage_max_attempts),
    )
    settings_payload.escalate_minutes = _coerce_positive_int(
        whatsapp_cfg.get("escalate_minutes"), settings_payload.escalate_minutes
    )

    templates = _as_dict(whatsapp_cfg.get("templates")) or {}
    prospeccion_cfg = _as_dict(whatsapp_cfg.get("prospeccion")) or {}
    sales_template = _coerce_str_or_none(templates.get("sales"))
    if sales_template is not None:
        settings_payload.sales_template_sid = sales_template
    appointment_template = _coerce_str_or_none(templates.get("appointment"))
    if appointment_template is not None:
        settings_payload.appointment_template_sid = appointment_template
    cancel_template = _coerce_str_or_none(templates.get("cancel"))
    if cancel_template is not None:
        settings_payload.cancel_template_sid = cancel_template
    prospeccion_prompt_id = _coerce_str_or_none(prospeccion_cfg.get("prompt_id"))
    if prospeccion_prompt_id is not None:
        settings_payload.prospeccion_prompt_id = prospeccion_prompt_id
    prospeccion_prompt_version = _coerce_str_or_none(prospeccion_cfg.get("prompt_version"))
    if prospeccion_prompt_version is not None:
        settings_payload.prospeccion_prompt_version = prospeccion_prompt_version
    prospeccion_templates_raw = templates.get("prospeccion")
    prospeccion_templates: list[str] = []
    if isinstance(prospeccion_templates_raw, list):
        for item in prospeccion_templates_raw:
            sid = _coerce_str_or_none(item)
            if sid:
                prospeccion_templates.append(sid)
    else:
        single_sid = _coerce_str_or_none(prospeccion_templates_raw)
        if single_sid:
            prospeccion_templates.append(single_sid)
    if prospeccion_templates:
        deduped: list[str] = []
        seen: set[str] = set()
        for sid in prospeccion_templates:
            if sid in seen:
                continue
            seen.add(sid)
            deduped.append(sid)
        settings_payload.prospeccion_template_sids = deduped

    project_value = _coerce_str_or_none(general_cfg.get("project_id"))
    if project_value is not None:
        settings_payload.project_id = project_value

    model_value = _coerce_str_or_none(voice_cfg.get("model"))
    if model_value is not None:
        settings_payload.voice_model = model_value
    max_tokens_value = voice_cfg.get("max_tokens")
    max_tokens_coerced = _coerce_positive_int_or_none(max_tokens_value)
    if max_tokens_coerced is not None:
        settings_payload.voice_max_tokens = max_tokens_coerced
    stt_value = _coerce_str_or_none(voice_cfg.get("stt_model"))
    if stt_value is not None:
        settings_payload.voice_stt_model = stt_value

    settings_payload.voice_api_key = await get_openai_api_key(
        organizacion_id=organizacion_id,
        force_refresh=force_refresh,
    )

    twilio_phone_number = _coerce_str_or_none(whatsapp_twilio_cfg.get("phone_number"))
    if twilio_phone_number is not None:
        settings_payload.twilio_phone_number = twilio_phone_number
    elif settings_payload.twilio_phone_number is None:
        settings_payload.twilio_phone_number = settings.twilio_phone_number

    twilio_phone_number_sid = _coerce_str_or_none(whatsapp_twilio_cfg.get("phone_number_sid"))
    if twilio_phone_number_sid is not None:
        settings_payload.twilio_phone_number_sid = twilio_phone_number_sid
    elif settings_payload.twilio_phone_number_sid is None:
        settings_payload.twilio_phone_number_sid = settings.twilio_phone_number_sid

    settings_payload.twilio_validate_signatures = _coerce_bool(
        whatsapp_twilio_cfg.get("validate_signatures"),
        settings_payload.twilio_validate_signatures,
    )

    twilio_account_sid = await get_secret_plaintext(
        organizacion_id=organizacion_id,
        clave="twilio.account_sid",
        force_refresh=force_refresh,
    )
    if twilio_account_sid is not None:
        settings_payload.twilio_account_sid = twilio_account_sid
    elif settings_payload.twilio_account_sid is None:
        settings_payload.twilio_account_sid = settings.twilio_account_sid

    twilio_auth_token = await get_secret_plaintext(
        organizacion_id=organizacion_id,
        clave="twilio.auth_token",
        force_refresh=force_refresh,
    )
    if twilio_auth_token is not None:
        settings_payload.twilio_auth_token = twilio_auth_token
    elif settings_payload.twilio_auth_token is None:
        settings_payload.twilio_auth_token = settings.twilio_auth_token

    meta_phone_number_id = _coerce_str_or_none(whatsapp_meta_cfg.get("phone_number_id"))
    if meta_phone_number_id is not None:
        settings_payload.meta_phone_number_id = meta_phone_number_id

    meta_page_access_token = await get_secret_plaintext(
        organizacion_id=organizacion_id,
        clave="meta.whatsapp.page_access_token",
        force_refresh=force_refresh,
    )
    if meta_page_access_token is not None:
        settings_payload.meta_page_access_token = meta_page_access_token

    meta_verify_token = await get_secret_plaintext(
        organizacion_id=organizacion_id,
        clave="meta.whatsapp.verify_token",
        force_refresh=force_refresh,
    )
    if meta_verify_token is not None:
        settings_payload.meta_verify_token = meta_verify_token

    meta_app_secret = await get_secret_plaintext(
        organizacion_id=organizacion_id,
        clave="meta.whatsapp.app_secret",
        force_refresh=force_refresh,
    )
    if meta_app_secret is not None:
        settings_payload.meta_app_secret = meta_app_secret

    meta_graph_api_version = _coerce_str_or_none(whatsapp_meta_cfg.get("graph_api_version"))
    if meta_graph_api_version is not None:
        settings_payload.meta_graph_api_version = meta_graph_api_version

    return settings_payload


@dataclass(slots=True)
class LeadScoringRuntimeSettings:
    enabled: bool
    capacidad_financiera_weight: float
    urgencia_weight: float
    nivel_decision_weight: float
    autoridad_weight: float
    interaccion_compromiso_weight: float
    explorando_max: float
    interesado_max: float
    listo_min: float
    confidence_high_min: float
    confidence_medium_min: float

    @staticmethod
    def from_defaults() -> "LeadScoringRuntimeSettings":
        return LeadScoringRuntimeSettings(
            enabled=True,
            capacidad_financiera_weight=30.0,
            urgencia_weight=20.0,
            nivel_decision_weight=20.0,
            autoridad_weight=15.0,
            interaccion_compromiso_weight=15.0,
            explorando_max=50.0,
            interesado_max=75.0,
            listo_min=76.0,
            confidence_high_min=0.80,
            confidence_medium_min=0.50,
        )


def _coerce_ratio(value: Any, default: float) -> float:
    candidate = _coerce_float(value, default)
    if candidate > 1:
        candidate = candidate / 100.0
    return max(0.0, min(candidate, 1.0))


async def get_lead_scoring_runtime_settings(
    *,
    organizacion_id: UUID | None = None,
) -> LeadScoringRuntimeSettings:
    payload = LeadScoringRuntimeSettings.from_defaults()
    if organizacion_id is None:
        return payload

    config = await get_org_config(organizacion_id=organizacion_id)
    scoring_cfg = _as_dict(config.get("scoring_bienes_raices")) or {}
    payload.enabled = _coerce_bool(scoring_cfg.get("enabled"), payload.enabled)

    weights_cfg = _as_dict(scoring_cfg.get("weights")) or {}
    candidate_weights = {
        "capacidad_financiera_weight": max(
            0.0, _coerce_float(weights_cfg.get("capacidad_financiera"), payload.capacidad_financiera_weight)
        ),
        "urgencia_weight": max(0.0, _coerce_float(weights_cfg.get("urgencia"), payload.urgencia_weight)),
        "nivel_decision_weight": max(
            0.0, _coerce_float(weights_cfg.get("nivel_decision"), payload.nivel_decision_weight)
        ),
        "autoridad_weight": max(0.0, _coerce_float(weights_cfg.get("autoridad"), payload.autoridad_weight)),
        "interaccion_compromiso_weight": max(
            0.0,
            _coerce_float(weights_cfg.get("interaccion_compromiso"), payload.interaccion_compromiso_weight),
        ),
    }
    total_weight = round(sum(candidate_weights.values()), 4)
    if abs(total_weight - 100.0) < 0.0001:
        payload.capacidad_financiera_weight = candidate_weights["capacidad_financiera_weight"]
        payload.urgencia_weight = candidate_weights["urgencia_weight"]
        payload.nivel_decision_weight = candidate_weights["nivel_decision_weight"]
        payload.autoridad_weight = candidate_weights["autoridad_weight"]
        payload.interaccion_compromiso_weight = candidate_weights["interaccion_compromiso_weight"]
    elif weights_cfg:
        logger.warning(
            "tenant_runtime.lead_scoring_invalid_weights",
            extra={"organizacion_id": str(organizacion_id), "weights_total": total_weight},
        )

    thresholds_cfg = _as_dict(scoring_cfg.get("thresholds")) or {}
    candidate_explorando = _coerce_float(thresholds_cfg.get("explorando_max"), payload.explorando_max)
    candidate_interesado = _coerce_float(thresholds_cfg.get("interesado_max"), payload.interesado_max)
    candidate_listo = _coerce_float(thresholds_cfg.get("listo_min"), payload.listo_min)
    if (
        0.0 <= candidate_explorando <= candidate_interesado <= 100.0
        and 0.0 <= candidate_listo <= 100.0
        and candidate_listo >= candidate_interesado
    ):
        payload.explorando_max = candidate_explorando
        payload.interesado_max = candidate_interesado
        payload.listo_min = candidate_listo
    elif thresholds_cfg:
        logger.warning(
            "tenant_runtime.lead_scoring_invalid_thresholds",
            extra={"organizacion_id": str(organizacion_id)},
        )

    confidence_cfg = _as_dict(scoring_cfg.get("confidence_thresholds")) or {}
    candidate_high = _coerce_ratio(confidence_cfg.get("high_min"), payload.confidence_high_min)
    candidate_medium = _coerce_ratio(confidence_cfg.get("medium_min"), payload.confidence_medium_min)
    if 0.0 <= candidate_medium <= candidate_high <= 1.0:
        payload.confidence_high_min = candidate_high
        payload.confidence_medium_min = candidate_medium
    elif confidence_cfg:
        logger.warning(
            "tenant_runtime.lead_scoring_invalid_confidence_thresholds",
            extra={"organizacion_id": str(organizacion_id)},
        )

    return payload


async def is_profiling_enabled(
    *,
    organizacion_id: UUID,
    channel: Literal["whatsapp", "webchat"] | None = None,
) -> bool:
    """Resuelve si el perfilamiento está activo para un tenant/canal.

    Fuente:
    - `organizaciones.config.scoring_bienes_raices.profiling_enabled` (global)
    - `organizaciones.config.scoring_bienes_raices.profiling_enabled_by_channel`
    """

    try:
        config = await get_org_config(organizacion_id=organizacion_id)
    except Exception as exc:
        logger.warning(
            "tenant_runtime.profiling_enabled_fallback_true",
            extra={"organizacion_id": str(organizacion_id), "channel": channel, "error": str(exc)},
        )
        return True
    scoring_cfg = _as_dict(config.get("scoring_bienes_raices")) or {}

    # Default ON para no romper tenants existentes sin config explícita.
    global_enabled = _coerce_bool(scoring_cfg.get("profiling_enabled"), True)
    if channel not in {"whatsapp", "webchat"}:
        return global_enabled

    by_channel = _as_dict(scoring_cfg.get("profiling_enabled_by_channel")) or {}
    return _coerce_bool(by_channel.get(channel), global_enabled)


@dataclass(slots=True)
class MessengerRuntimeSettings:
    page_access_token: str | None
    verify_token: str | None
    app_secret: str | None
    assistant_id: str | None
    prompt_id: str | None
    prompt_version: str | None
    inactivity_hours: int | None


async def get_messenger_runtime_settings(
    *,
    organizacion_id: UUID | None = None,
) -> MessengerRuntimeSettings:
    settings_payload = MessengerRuntimeSettings(
        page_access_token=settings.messenger_page_access_token,
        verify_token=settings.messenger_verify_token,
        app_secret=settings.messenger_app_secret,
        assistant_id=settings.messenger_assistant_id,
        prompt_id=settings.messenger_prompt_id,
        prompt_version=settings.messenger_prompt_version,
        inactivity_hours=settings.messenger_inactivity_hours,
    )
    if organizacion_id is None:
        return settings_payload

    config = await get_org_config(organizacion_id=organizacion_id)
    messenger_cfg = _as_dict(config.get("messenger")) or {}

    assistant_id = _coerce_str_or_none(messenger_cfg.get("assistant_id"))
    if assistant_id is not None:
        settings_payload.assistant_id = assistant_id

    prompt_id = _coerce_str_or_none(messenger_cfg.get("prompt_id"))
    if prompt_id is not None:
        settings_payload.prompt_id = prompt_id

    prompt_version = _coerce_str_or_none(messenger_cfg.get("prompt_version"))
    if prompt_version is not None:
        settings_payload.prompt_version = prompt_version

    inactivity_value = messenger_cfg.get("inactivity_hours")
    if inactivity_value is not None:
        coerced_inactivity = _coerce_positive_int_or_none(inactivity_value)
        if coerced_inactivity is not None:
            settings_payload.inactivity_hours = coerced_inactivity

    page_token_secret = await get_secret_plaintext(
        organizacion_id=organizacion_id,
        clave="meta.messenger.page_access_token",
    )
    if page_token_secret:
        settings_payload.page_access_token = page_token_secret

    verify_token_secret = await get_secret_plaintext(
        organizacion_id=organizacion_id,
        clave="meta.messenger.verify_token",
    )
    if verify_token_secret:
        settings_payload.verify_token = verify_token_secret

    app_secret = await get_secret_plaintext(
        organizacion_id=organizacion_id,
        clave="meta.messenger.app_secret",
    )
    if app_secret:
        settings_payload.app_secret = app_secret

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
