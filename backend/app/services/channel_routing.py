"""Resolución de tenant (organizacion_id) a partir de claves externas por canal."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError


@dataclass(frozen=True)
class _CacheEntry:
    organizacion_id: str | None
    expires_at: datetime


_CACHE: dict[tuple[str, str], _CacheEntry] = {}
_DEFAULT_TTL = timedelta(minutes=10)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_key(canal: str, clave: str) -> tuple[str, str]:
    return canal.strip().lower(), clave.strip().lower()


async def resolve_organizacion_id(*, canal: str, clave: str) -> str | None:
    """Devuelve el organizacion_id asociado a (canal, clave) o None si no existe."""
    canal_norm, clave_norm = _normalize_key(canal, clave)
    if not canal_norm or not clave_norm:
        return None
    key = (canal_norm, clave_norm)
    entry = _CACHE.get(key)
    now = _now()
    if entry and entry.expires_at > now:
        return entry.organizacion_id

    repo = PlatformRepository()
    try:
        organizacion_id = await repo.resolve_org_for_route(canal=canal_norm, clave=clave_norm)
    except PlatformRepositoryError:
        organizacion_id = None

    if organizacion_id is not None:
        _CACHE[key] = _CacheEntry(organizacion_id=organizacion_id, expires_at=now + _DEFAULT_TTL)
    else:
        _CACHE.pop(key, None)
    return organizacion_id


def invalidate_cache(*, canal: str | None = None, clave: str | None = None) -> None:
    """Permite invalidar la caché tras cambios en admin."""
    if canal is None and clave is None:
        _CACHE.clear()
        return
    canal_norm = canal.strip().lower() if canal else None
    clave_norm = clave.strip().lower() if clave else None
    to_delete: list[tuple[str, str]] = []
    for (c, k) in _CACHE.keys():
        if canal_norm and c != canal_norm:
            continue
        if clave_norm and k != clave_norm:
            continue
        to_delete.append((c, k))
    for key in to_delete:
        _CACHE.pop(key, None)
