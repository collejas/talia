"""Repositorio server-side para operaciones globales (cross-tenant) en Supabase."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

import httpx

from app.core.config import settings


class PlatformRepositoryError(RuntimeError):
    """Errores al interactuar con Supabase para tareas de plataforma."""


class PlatformRepository:
    """Cliente ligero contra Supabase REST usando service role (server-side)."""

    def __init__(self, *, timeout: float = 10.0) -> None:
        if not settings.supabase_url or not settings.supabase_service_role:
            raise PlatformRepositoryError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")
        self._base_url = settings.supabase_url.rstrip("/")
        self._service_role = settings.supabase_service_role
        self._timeout = timeout

    async def auth_get_user(self, *, user_token: str) -> dict[str, Any]:
        """Valida el JWT y devuelve el payload del usuario desde Supabase Auth."""
        url = f"{self._base_url}/auth/v1/user"
        headers = {
            "apikey": self._service_role,
            "Authorization": f"Bearer {user_token}",
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(url, headers=headers)
        except httpx.RequestError as exc:  # pragma: no cover
            raise PlatformRepositoryError(f"auth_user_network_error:{exc}") from exc
        if resp.status_code >= 400:
            raise PlatformRepositoryError(f"auth_user_invalid:{resp.status_code}:{resp.text}")
        data = resp.json()
        if not isinstance(data, dict):
            raise PlatformRepositoryError("auth_user_invalid_response")
        return data

    async def is_platform_admin(self, *, user_id: UUID) -> bool:
        params = {
            "select": "user_id",
            "user_id": f"eq.{user_id}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/platform_admins", params=params)
        return isinstance(data, list) and len(data) > 0

    async def list_organizaciones(self) -> list[dict[str, Any]]:
        params = {
            "select": "id,nombre,razon_social,dominio_principal,estado_onboarding,activo,config,fecha_alta",
            "order": "fecha_alta.desc",
        }
        data = await self._rest("GET", "/rest/v1/organizaciones", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("organizaciones_invalid_response")
        return data

    async def create_organizacion(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/organizaciones",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("organizacion_create_failed")
        return data[0]

    async def list_channel_routes(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        params = {
            "select": "id,organizacion_id,canal,clave,metadata,activo,creado_en,actualizado_en",
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
        }
        data = await self._rest("GET", "/rest/v1/organizacion_rutas_canal", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("routes_invalid_response")
        return data

    async def create_channel_route(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/organizacion_rutas_canal",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("route_create_failed")
        return data[0]

    async def resolve_org_for_route(self, *, canal: str, clave: str) -> str | None:
        params = {
            "select": "organizacion_id",
            "canal": f"eq.{canal}",
            "clave": f"eq.{clave}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/organizacion_rutas_canal", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        value = row.get("organizacion_id")
        return str(value) if value else None

    async def _rest(
        self,
        method: Literal["GET", "POST", "PATCH", "DELETE"],
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> Any:
        url = f"{self._base_url}{path}"
        headers = {
            "Accept": "application/json",
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
        }
        if prefer:
            headers["Prefer"] = prefer
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.request(method, url, params=params, json=json, headers=headers)
        except httpx.RequestError as exc:  # pragma: no cover
            raise PlatformRepositoryError(f"supabase_network_error:{exc}") from exc
        if resp.status_code >= 400:
            raise PlatformRepositoryError(f"supabase_error:{resp.status_code}:{path}:{resp.text}")
        if resp.status_code == 204:
            return None
        return resp.json()

