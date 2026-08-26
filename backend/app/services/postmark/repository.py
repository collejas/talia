"""Acceso aislado a la configuración Postmark persistida en Supabase."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import httpx

from app.core.config import settings


class PostmarkRepositoryError(RuntimeError):
    """Error controlado al consultar la configuración de correo."""


class PostmarkRepository:
    """Repositorio server-side exclusivo de las tablas tenant_email_*."""

    def __init__(self, *, timeout: float = 10.0) -> None:
        if not settings.supabase_url or not settings.supabase_service_role:
            raise PostmarkRepositoryError("supabase_not_configured")
        self._base_url = settings.supabase_url.rstrip("/")
        self._service_role = settings.supabase_service_role
        self._timeout = timeout

    async def get_migration(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        return await self._get_one(
            "/rest/v1/tenant_email_migrations",
            params={
                "select": "id,organizacion_id,status,feature_enabled,domain_verified_at,production_enabled_at,validated_at",
                "organizacion_id": f"eq.{organizacion_id}",
                "limit": "1",
            },
        )

    async def get_verified_domain(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        return await self._get_one(
            "/rest/v1/tenant_email_domains",
            params={
                "select": "id,organizacion_id,domain_name,status,verified_at,default_from_email,default_from_name,reply_to_email",
                "organizacion_id": f"eq.{organizacion_id}",
                "status": "eq.verified",
                "limit": "1",
            },
        )

    async def get_active_plan(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        return await self._get_one(
            "/rest/v1/tenant_email_plans",
            params={
                "select": "id,organizacion_id,plan_code,status,period_unit,period_limit,daily_limit,overage_allowed,starts_at,ends_at",
                "organizacion_id": f"eq.{organizacion_id}",
                "status": "eq.active",
                "order": "starts_at.desc",
                "limit": "1",
            },
        )

    async def is_suppressed(self, *, organizacion_id: UUID, email_address: str) -> bool:
        row = await self._get_one(
            "/rest/v1/tenant_email_suppressions",
            params={
                "select": "id",
                "organizacion_id": f"eq.{organizacion_id}",
                "email_address": f"eq.{email_address.lower()}",
                "active": "eq.true",
                "limit": "1",
            },
        )
        return row is not None

    async def _get_one(self, path: str, *, params: dict[str, str]) -> dict[str, Any] | None:
        headers = {
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(f"{self._base_url}{path}", params=params, headers=headers)
        except httpx.RequestError as exc:
            raise PostmarkRepositoryError("database_unreachable") from exc
        if response.status_code >= 400:
            raise PostmarkRepositoryError("database_read_failed")
        data = response.json()
        if not isinstance(data, list):
            raise PostmarkRepositoryError("database_invalid_response")
        return data[0] if data and isinstance(data[0], dict) else None


__all__ = ["PostmarkRepository", "PostmarkRepositoryError"]
