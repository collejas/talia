"""Rutas tenant-scoped para que un admin de organización edite su propia configuración."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.api.routes.admin import ChannelRoute, get_platform_repo, require_user_token
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError

router = APIRouter(prefix="/tenant", tags=["tenant"])


class TenantContext(BaseModel):
    model_config = ConfigDict(extra="ignore")

    user_id: UUID
    organizacion_id: UUID


def get_crm_repo() -> CRMRepository:
    try:
        return CRMRepository()
    except CRMRepositoryError as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _extract_organizacion_id_from_metadata(user: dict[str, Any]) -> UUID | None:
    if not isinstance(user, dict):
        return None
    for namespace in ("app_metadata", "user_metadata"):
        metadata = user.get(namespace)
        if not isinstance(metadata, dict):
            continue
        value = metadata.get("organizacion_id")
        if value:
            try:
                return UUID(str(value))
            except (TypeError, ValueError):
                return None
    return None


async def require_tenant_context(
    user_token: str = Depends(require_user_token),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
    crm_repo: CRMRepository = Depends(get_crm_repo),
) -> TenantContext:
    try:
        user = await platform_repo.auth_get_user(user_token=user_token)
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    raw_id = user.get("id")
    try:
        user_id = UUID(str(raw_id))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="auth_user_invalid") from exc

    organizacion_id = _extract_organizacion_id_from_metadata(user)
    if not organizacion_id:
        organizacion_id = await crm_repo.get_usuario_organizacion_id(usuario_id=user_id)
    if not organizacion_id:
        raise HTTPException(status_code=403, detail="organizacion_not_found")

    return TenantContext(user_id=user_id, organizacion_id=organizacion_id)


def _format_route_rows(rows: list[dict[str, Any]]) -> list[ChannelRoute]:
    routes: list[ChannelRoute] = []
    for row in rows:
        try:
            routes.append(ChannelRoute.model_validate(row))
        except Exception:
            continue
    return routes


class TenantScopedSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")

    organizacion_id: UUID
    nombre: str
    razon_social: str | None = None
    dominio_principal: str | None = None
    rfc: str | None = None
    pais: str | None = None
    estado: str | None = None
    ciudad: str | None = None
    telefono: str | None = None
    sitio_web: str | None = None
    estado_onboarding: str | None = None
    activo: bool | None = None
    config: dict[str, Any] | None = None
    routes: list[ChannelRoute] = Field(default_factory=list)


class TenantScopedUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nombre: str | None = Field(default=None, min_length=2)
    razon_social: str | None = None
    dominio_principal: str | None = None
    rfc: str | None = None
    pais: str | None = None
    estado: str | None = None
    ciudad: str | None = None
    telefono: str | None = None
    sitio_web: str | None = None
    estado_onboarding: str | None = None


async def _build_tenant_response(
    organizacion_id: UUID,
    row: dict[str, Any],
    routes: list[dict[str, Any]],
) -> TenantScopedSettings:
    data = {
        "organizacion_id": organizacion_id,
        "nombre": row.get("nombre") or "",
        "razon_social": row.get("razon_social"),
        "dominio_principal": row.get("dominio_principal"),
        "rfc": row.get("rfc"),
        "pais": row.get("pais"),
        "estado": row.get("estado"),
        "ciudad": row.get("ciudad"),
        "telefono": row.get("telefono"),
        "sitio_web": row.get("sitio_web"),
        "estado_onboarding": row.get("estado_onboarding"),
        "activo": row.get("activo"),
        "config": row.get("config") if isinstance(row.get("config"), dict) else None,
        "routes": _format_route_rows(routes),
    }
    return TenantScopedSettings.model_validate(data)


@router.get("/me/settings", response_model=TenantScopedSettings)
async def get_tenant_settings(
    context: TenantContext = Depends(require_tenant_context),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantScopedSettings:
    row = await platform_repo.get_organizacion_details(organizacion_id=context.organizacion_id)
    if not row:
        raise HTTPException(status_code=404, detail="tenant_not_found")
    routes = await platform_repo.list_channel_routes(organizacion_id=context.organizacion_id)
    return await _build_tenant_response(context.organizacion_id, row, routes)


@router.put("/me/settings", response_model=TenantScopedSettings)
async def update_tenant_settings(
    payload: TenantScopedUpdateRequest,
    context: TenantContext = Depends(require_tenant_context),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantScopedSettings:
    update_payload = payload.model_dump(exclude_none=True)
    if not update_payload:
        raise HTTPException(status_code=400, detail="nothing_to_update")
    try:
        row = await platform_repo.update_organizacion_details(
            organizacion_id=context.organizacion_id,
            payload=update_payload,
        )
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    routes = await platform_repo.list_channel_routes(organizacion_id=context.organizacion_id)
    return await _build_tenant_response(context.organizacion_id, row, routes)
