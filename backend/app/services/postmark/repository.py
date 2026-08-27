"""Acceso aislado a la configuración Postmark persistida en Supabase."""

from __future__ import annotations

from datetime import datetime, timezone
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
                "select": "id,organizacion_id,domain_name,external_domain_id,status,verified_at,default_from_email,default_from_name,reply_to_email",
                "organizacion_id": f"eq.{organizacion_id}",
                "status": "eq.verified",
                "limit": "1",
            },
        )

    async def list_domains(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        data = await self._get_many(
            "/rest/v1/tenant_email_domains",
            params={
                "select": "id,organizacion_id,domain_name,status,dkim_host,dkim_record_value,return_path_domain,return_path_cname_target,dkim_verified_at,return_path_verified_at,verified_at,blocked_at,default_from_email,default_from_name,reply_to_email",
                "organizacion_id": f"eq.{organizacion_id}",
                "order": "created_at.asc",
            },
        )
        return data

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

    async def get_current_usage(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc).isoformat()
        return await self._get_one(
            "/rest/v1/tenant_email_usage_periods",
            params={
                "select": "id,plan_id,period_start,period_end,reserved_recipients,accepted_recipients,failed_recipients,delivered_recipients,bounced_recipients,complained_recipients,released_recipients",
                "organizacion_id": f"eq.{organizacion_id}",
                "period_start": f"lte.{now}",
                "period_end": f"gt.{now}",
                "order": "period_start.desc",
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

    async def ensure_migration(self, *, organizacion_id: UUID) -> dict[str, Any]:
        data = await self._rest_post(
            "/rest/v1/tenant_email_migrations",
            payload={"organizacion_id": str(organizacion_id), "status": "pending", "feature_enabled": False},
            prefer="resolution=merge-duplicates,return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("migration_invalid_response")
        return data[0]

    async def find_domain(self, *, domain_name: str) -> dict[str, Any] | None:
        return await self._get_one(
            "/rest/v1/tenant_email_domains",
            params={
                "select": "id,organizacion_id,domain_name,status,external_domain_id",
                "domain_name": f"eq.{domain_name}",
                "status": "not.eq.removed",
                "limit": "1",
            },
        )

    async def get_domain(self, *, organizacion_id: UUID, domain_id: UUID) -> dict[str, Any] | None:
        return await self._get_one(
            "/rest/v1/tenant_email_domains",
            params={
                "select": "id,organizacion_id,domain_name,external_domain_id,status,dkim_host,dkim_record_value,return_path_domain,return_path_cname_target,dkim_verified_at,return_path_verified_at,verified_at,default_from_email,default_from_name,reply_to_email",
                "id": f"eq.{domain_id}",
                "organizacion_id": f"eq.{organizacion_id}",
                "limit": "1",
            },
        )

    async def create_domain(self, *, organizacion_id: UUID, domain: dict[str, Any]) -> dict[str, Any]:
        payload = {"organizacion_id": str(organizacion_id), **domain}
        data = await self._rest_post(
            "/rest/v1/tenant_email_domains",
            payload=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("domain_create_invalid_response")
        return data[0]

    async def update_domain_verification(
        self,
        *,
        organizacion_id: UUID,
        domain_id: UUID,
        fields: dict[str, Any],
    ) -> dict[str, Any]:
        data = await self._rest_patch(
            "/rest/v1/tenant_email_domains",
            params={"id": f"eq.{domain_id}", "organizacion_id": f"eq.{organizacion_id}"},
            payload=fields,
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("domain_update_invalid_response")
        return data[0]

    async def queue_message(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        """Encola y reserva cuota mediante la RPC atómica propia de Postmark."""
        data = await self._rpc("tenant_email_queue_message", payload)
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("queue_invalid_response")
        return data[0]

    async def claim_messages(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        data = await self._rpc(
            "tenant_email_claim_messages",
            {
                "p_organizacion_id": str(organizacion_id),
                "p_limit": limit,
                "p_stale_after_seconds": 600,
            },
        )
        if not isinstance(data, list):
            raise PostmarkRepositoryError("claim_invalid_response")
        return [row for row in data if isinstance(row, dict)]

    async def list_enabled_organizations(self) -> list[UUID]:
        data = await self._get_many(
            "/rest/v1/tenant_email_migrations",
            params={
                "select": "organizacion_id",
                "feature_enabled": "eq.true",
                "status": "in.(active,validated,migrated)",
            },
        )
        result: list[UUID] = []
        for row in data:
            try:
                result.append(UUID(str(row["organizacion_id"])))
            except (KeyError, TypeError, ValueError):
                continue
        return result

    async def start_attempt(self, *, organizacion_id: UUID, message_id: UUID) -> dict[str, Any]:
        data = await self._rpc(
            "tenant_email_start_attempt",
            {"p_organizacion_id": str(organizacion_id), "p_message_id": str(message_id)},
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("attempt_start_invalid_response")
        return data[0]

    async def finish_attempt(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rpc("tenant_email_finish_attempt", payload)
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("attempt_finish_invalid_response")
        return data[0]

    async def set_quota(
        self,
        *,
        organizacion_id: UUID,
        period_limit: int,
        changed_by: UUID,
        reason: str,
    ) -> dict[str, Any]:
        data = await self._rpc(
            "tenant_email_admin_set_quota",
            {
                "p_organizacion_id": str(organizacion_id),
                "p_period_limit": period_limit,
                "p_changed_by": str(changed_by),
                "p_reason": reason,
            },
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PostmarkRepositoryError("quota_invalid_response")
        return data[0]

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

    async def _get_many(self, path: str, *, params: dict[str, str]) -> list[dict[str, Any]]:
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
        return [row for row in data if isinstance(row, dict)]

    async def _rest_post(self, path: str, *, payload: dict[str, Any], prefer: str) -> Any:
        headers = {
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(f"{self._base_url}{path}", json=payload, headers=headers)
        except httpx.RequestError as exc:
            raise PostmarkRepositoryError("database_unreachable") from exc
        if response.status_code >= 400:
            raise PostmarkRepositoryError("database_write_failed")
        return response.json()

    async def _rest_patch(self, path: str, *, params: dict[str, str], payload: dict[str, Any]) -> Any:
        headers = {
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.patch(
                    f"{self._base_url}{path}", params=params, json=payload, headers=headers
                )
        except httpx.RequestError as exc:
            raise PostmarkRepositoryError("database_unreachable") from exc
        if response.status_code >= 400:
            raise PostmarkRepositoryError("database_write_failed")
        return response.json()

    async def _rpc(self, function_name: str, payload: dict[str, Any]) -> Any:
        headers = {
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    f"{self._base_url}/rest/v1/rpc/{function_name}",
                    json=payload,
                    headers=headers,
                )
        except httpx.RequestError as exc:
            raise PostmarkRepositoryError("database_unreachable") from exc
        if response.status_code >= 400:
            raise PostmarkRepositoryError("queue_failed")
        return response.json()


__all__ = ["PostmarkRepository", "PostmarkRepositoryError"]
