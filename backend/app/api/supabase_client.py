"""Helper utilities to call Supabase REST endpoints with consistent headers."""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import HTTPException

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def supabase_base_url() -> str:
    """Return the configured Supabase base URL or raise if missing."""

    if not settings.supabase_url:
        raise HTTPException(status_code=500, detail="Supabase no está configurado")
    return settings.supabase_url.rstrip("/")


def build_supabase_headers(
    *,
    token: str | None,
    prefer: str | None = None,
    content_type: str | None = "application/json",
) -> dict[str, str]:
    """Construct headers for Supabase REST requests."""

    headers: dict[str, str] = {"Accept": "application/json"}
    if content_type:
        headers["Content-Type"] = content_type

    if token:
        headers["Authorization"] = token
        anon = getattr(settings, "supabase_anon", None)
        if anon:
            headers["apikey"] = anon  # type: ignore[assignment]
    elif settings.supabase_service_role:
        headers["apikey"] = settings.supabase_service_role
        headers["Authorization"] = f"Bearer {settings.supabase_service_role}"
    else:
        raise HTTPException(status_code=500, detail="Falta SUPABASE_SERVICE_ROLE")

    if prefer:
        headers["Prefer"] = prefer
    return headers


def supabase_error(resp: httpx.Response, fallback: str) -> HTTPException:
    """Create an HTTPException using Supabase error payload when available."""

    detail: str | None = None
    try:
        payload = resp.json()
    except ValueError:
        payload = None

    if isinstance(payload, dict):
        detail = (
            payload.get("message")
            or payload.get("error_description")
            or payload.get("error")
            or fallback
        )
    else:
        detail = fallback

    return HTTPException(status_code=resp.status_code, detail=detail)


def ensure_bearer_token(raw_token: str | None) -> str:
    """Validate that an Authorization header includes a Bearer token."""

    if not raw_token:
        raise HTTPException(status_code=401, detail="Falta Authorization bearer token")

    normalized = raw_token.strip()
    if not normalized.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401, detail="Authorization debe ser Bearer <token>"
        )

    return normalized


async def supabase_request(
    method: str,
    path: str,
    *,
    token: str | None,
    params: dict[str, str] | None = None,
    json: Any | None = None,
    data: Any | None = None,
    prefer: str | None = None,
    content_type: str | None = "application/json",
    timeout: float = 10.0,
) -> httpx.Response:
    """Execute an HTTP request against Supabase REST with shared error handling."""

    url = f"{supabase_base_url()}{path}"
    headers = build_supabase_headers(
        token=token, prefer=prefer, content_type=content_type
    )

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.request(
                method,
                url,
                headers=headers,
                params=params,
                json=json,
                data=data,
            )
        return response
    except httpx.RequestError:
        logger.exception("Error al conectar a Supabase")
        raise HTTPException(status_code=502, detail="Error al conectar a Supabase")
