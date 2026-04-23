"""Repositorio server-side para operaciones globales (cross-tenant) en Supabase."""

from __future__ import annotations

import json
from typing import Any, Literal, Sequence
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

    async def list_roles(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        params = {
            "select": "id,nombre,codigo,descripcion",
            "organizacion_id": f"eq.{organizacion_id}",
        }
        data = await self._rest("GET", "/rest/v1/roles", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("roles_invalid_response")
        return data

    async def list_permissions(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        params = {
            "select": "id,codigo,descripcion",
            "organizacion_id": f"eq.{organizacion_id}",
        }
        data = await self._rest("GET", "/rest/v1/permisos", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("permisos_invalid_response")
        return data

    async def list_role_permissions(self, *, organizacion_id: UUID, rol_id: UUID) -> list[dict[str, Any]]:
        params = {
            "select": "rol_id,permiso_id",
            "organizacion_id": f"eq.{organizacion_id}",
            "rol_id": f"eq.{rol_id}",
        }
        data = await self._rest("GET", "/rest/v1/roles_permisos", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("roles_permisos_invalid_response")
        return data

    async def delete_role_permission(
        self, *, organizacion_id: UUID, rol_id: UUID, permiso_id: UUID
    ) -> None:
        await self._rest(
            "DELETE",
            "/rest/v1/roles_permisos",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "rol_id": f"eq.{rol_id}",
                "permiso_id": f"eq.{permiso_id}",
            },
        )

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

    async def delete_organizacion(self, *, organizacion_id: UUID) -> None:
        await self._rest(
            "DELETE",
            "/rest/v1/organizaciones",
            params={"id": f"eq.{organizacion_id}"},
        )

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

    async def create_calendar_resource(
        self,
        *,
        organizacion_id: UUID,
        name: str,
        slug: str | None = None,
        timezone: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "organizacion_id": str(organizacion_id),
            "name": name,
            "metadata": metadata or {},
        }
        if slug:
            payload["slug"] = slug
        if timezone:
            payload["timezone"] = timezone
        data = await self._rest(
            "POST",
            "/rest/v1/calendar_resources",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("calendar_resource_create_failed")
        return data[0]

    async def delete_channel_route(self, *, organizacion_id: UUID, route_id: UUID) -> None:
        await self._rest(
            "DELETE",
            "/rest/v1/organizacion_rutas_canal",
            params={"organizacion_id": f"eq.{organizacion_id}", "id": f"eq.{route_id}"},
        )

    async def get_organizacion_config(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        params = {
            "select": "id,config",
            "id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/organizaciones", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        config = row.get("config")
        return config if isinstance(config, dict) else ({} if config is None else None)

    async def set_organizacion_config(
        self, *, organizacion_id: UUID, config: dict[str, Any]
    ) -> dict[str, Any]:
        # Nota: `public.organizaciones` no tiene columna `actualizado_por` (solo `actualizado_en`).
        payload: dict[str, Any] = {"config": config}
        data = await self._rest(
            "PATCH",
            "/rest/v1/organizaciones",
            params={"id": f"eq.{organizacion_id}"},
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("organizacion_update_failed")
        return data[0]

    async def get_organizacion_details(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        params = {
            "select": "id,nombre,razon_social,rfc,pais,estado,ciudad,dominio_principal,telefono,sitio_web,config,estado_onboarding,activo,fecha_alta,fecha_pausa,fecha_cancelacion",
            "id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/organizaciones", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        return row if isinstance(row, dict) else None

    async def update_organizacion_details(
        self, *, organizacion_id: UUID, payload: dict[str, Any]
    ) -> dict[str, Any]:
        data = await self._rest(
            "PATCH",
            "/rest/v1/organizaciones",
            params={"id": f"eq.{organizacion_id}"},
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("organizacion_update_failed")
        return data[0]

    async def list_secret_metadata(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        params = {
            "select": "id,organizacion_id,clave,etiqueta,version,creado_por,actualizado_por,creado_en,actualizado_en",
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "actualizado_en.desc",
        }
        data = await self._rest("GET", "/rest/v1/secretos", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("secretos_invalid_response")
        return data

    async def get_secret_row(self, *, organizacion_id: UUID, clave: str) -> dict[str, Any] | None:
        params = {
            "select": "id,organizacion_id,clave,version,etiqueta,nonce,valor_cifrado,creado_en,actualizado_en",
            "organizacion_id": f"eq.{organizacion_id}",
            "clave": f"eq.{clave}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/secretos", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        return row if isinstance(row, dict) else None

    async def upsert_secret(
        self,
        *,
        organizacion_id: UUID,
        clave: str,
        valor_cifrado: str,
        nonce: str,
        etiqueta: str | None,
        version: int,
        updated_by: UUID | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "organizacion_id": str(organizacion_id),
            "clave": clave,
            "valor_cifrado": valor_cifrado,
            "nonce": nonce,
            "etiqueta": etiqueta,
            "version": version,
        }
        if updated_by:
            payload["actualizado_por"] = str(updated_by)
            payload["creado_por"] = str(updated_by)
        data = await self._rest(
            "POST",
            "/rest/v1/secretos",
            params={"on_conflict": "organizacion_id,clave"},
            json=payload,
            prefer="return=representation,resolution=merge-duplicates",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("secret_upsert_failed")
        return data[0]

    async def delete_secret(self, *, organizacion_id: UUID, clave: str) -> None:
        await self._rest(
            "DELETE",
            "/rest/v1/secretos",
            params={"organizacion_id": f"eq.{organizacion_id}", "clave": f"eq.{clave}"},
        )

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

    async def create_permissions(
        self, *, organizacion_id: UUID, permisos: Sequence[dict[str, str]]
    ) -> list[dict[str, Any]]:
        if not permisos:
            return []
        payload = []
        for permiso in permisos:
            payload.append(
                {
                    "organizacion_id": str(organizacion_id),
                    "codigo": permiso.get("codigo"),
                    "descripcion": permiso.get("descripcion"),
                }
            )
        data = await self._rest(
            "POST",
            "/rest/v1/permisos",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list):
            raise PlatformRepositoryError("permisos_create_failed")
        return data

    async def create_role(
        self, *, organizacion_id: UUID, nombre: str, descripcion: str | None
    ) -> dict[str, Any]:
        payload = {
            "organizacion_id": str(organizacion_id),
            "nombre": nombre,
            "descripcion": descripcion,
        }
        data = await self._rest(
            "POST",
            "/rest/v1/roles",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("role_create_failed")
        return data[0]

    async def create_role_permission(
        self, *, organizacion_id: UUID, rol_id: UUID, permiso_id: UUID
    ) -> None:
        await self._rest(
            "POST",
            "/rest/v1/roles_permisos",
            json={
                "organizacion_id": str(organizacion_id),
                "rol_id": str(rol_id),
                "permiso_id": str(permiso_id),
            },
        )

    async def create_department(self, *, organizacion_id: UUID, nombre: str) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/departamentos",
            json={
                "organizacion_id": str(organizacion_id),
                "nombre": nombre,
            },
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("department_create_failed")
        return data[0]

    async def create_position(self, *, organizacion_id: UUID, nombre: str) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/puestos",
            json={
                "organizacion_id": str(organizacion_id),
                "nombre": nombre,
            },
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("position_create_failed")
        return data[0]

    async def list_tenant_bootstrap_catalog(self, *, tipo: Literal["departamento", "puesto"]) -> list[str]:
        data = await self._rest(
            "GET",
            "/rest/v1/tenant_bootstrap_catalog",
            params={
                "select": "nombre",
                "tipo": f"eq.{tipo}",
                "activo": "eq.true",
                "order": "orden.asc,nombre.asc",
                "limit": "500",
            },
        )
        if not isinstance(data, list):
            raise PlatformRepositoryError("tenant_bootstrap_catalog_read_failed")
        names: list[str] = []
        for row in data:
            if not isinstance(row, dict):
                continue
            name = str(row.get("nombre") or "").strip()
            if name:
                names.append(name)
        return names

    async def upsert_usuario(
        self,
        *,
        usuario_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        data = await self._rest(
            "PATCH",
            "/rest/v1/usuarios",
            params={"id": f"eq.{usuario_id}"},
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("usuario_upsert_failed")
        return data[0]

    async def assign_user_role(self, *, usuario_id: UUID, rol_id: UUID, organizacion_id: UUID) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/usuarios_roles",
            json={
                "usuario_id": str(usuario_id),
                "rol_id": str(rol_id),
                "organizacion_id": str(organizacion_id),
            },
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("usuario_role_assign_failed")
        return data[0]

    async def create_employee(
        self,
        *,
        usuario_id: UUID,
        departamento_id: UUID | None,
        puesto_id: UUID | None,
        organizacion_id: UUID,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "usuario_id": str(usuario_id),
            "organizacion_id": str(organizacion_id),
        }
        if departamento_id:
            payload["departamento_id"] = str(departamento_id)
        if puesto_id:
            payload["puesto_id"] = str(puesto_id)
        data = await self._rest(
            "POST",
            "/rest/v1/empleados",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("empleado_create_failed")
        return data[0]

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
        if not resp.text:
            return None
        try:
            return resp.json()
        except json.JSONDecodeError:
            return None
