"""Repositorio para interactuar con las tablas CRM en Supabase."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

import httpx

from app.core.config import settings


class CRMRepositoryError(RuntimeError):
    """Errores al interactuar con Supabase CRM."""


class CRMRepository:
    """Cliente ligero contra Supabase REST usando service role."""

    def __init__(self, *, timeout: float = 10.0) -> None:
        if not settings.supabase_url or not settings.supabase_service_role:
            raise CRMRepositoryError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")
        self._base_url = settings.supabase_url.rstrip("/")
        self._service_role = settings.supabase_service_role
        self._timeout = timeout

    async def list_accounts(
        self,
        *,
        organizacion_id: UUID,
        limit: int = 50,
        offset: int = 0,
        order: Literal["creado_en.desc", "creado_en.asc"] = "creado_en.desc",
    ) -> list[dict[str, Any]]:
        params = {
            "organizacion_id": f"eq.{organizacion_id}",
            "order": order,
            "limit": str(limit),
            "offset": str(offset),
        }
        resp = await self._request("GET", "/rest/v1/cuentas", params=params)
        data = resp.json()
        if not isinstance(data, list):
            raise CRMRepositoryError(f"Respuesta inesperada al listar cuentas: {data!r}")
        return data

    async def create_account(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        resp = await self._request(
            "POST",
            "/rest/v1/cuentas",
            json=body,
            prefer="return=representation",
        )
        data = resp.json()
        if not isinstance(data, list) or not data:
            raise CRMRepositoryError("Supabase no devolvió la cuenta creada")
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al crear cuenta: {row!r}")
        return row

    async def get_account(
        self,
        *,
        organizacion_id: UUID,
        account_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "id": f"eq.{account_id}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        resp = await self._request("GET", "/rest/v1/cuentas", params=params)
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise CRMRepositoryError(f"Respuesta inválida al obtener cuenta: {row!r}")
        return row

    async def _request(
        self,
        method: Literal["GET", "POST", "PATCH", "DELETE"],
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> httpx.Response:
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
        except httpx.RequestError as exc:  # pragma: no cover - red de terceros
            raise CRMRepositoryError(f"Error de red al llamar Supabase: {exc}") from exc
        if resp.status_code >= 400:
            raise CRMRepositoryError(
                f"Supabase respondió error {resp.status_code} en {path}: {resp.text}"
            )
        return resp
