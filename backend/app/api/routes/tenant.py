"""Rutas tenant-scoped para que un admin de organización edite su propia configuración."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field

from app.api.routes.admin import (
    ChannelRoute,
    CreateRouteRequest,
    CreateRouteResponse,
    SetTenantConfigRequest,
    TenantConfigResponse,
    TenantRoutesResponse,
    TenantValidationReport,
    SecretMetadata,
    TenantSecretsResponse,
    _ensure_tenant_calendar_bootstrap,
    _get_master_key_for_tier,
    _normalize_secret_key,
    build_validation_report,
    get_platform_repo,
    require_user_token,
)
from app.core.secrets_crypto import SecretsCryptoError, encrypt_secret
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError
from app.services import channel_routing

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


async def require_permission(user_token: str, code: str) -> None:
    repo = CRMRepository(user_token=user_token)
    allowed = await repo.current_user_has_perm(codigo=code)
    if not allowed:
        raise HTTPException(status_code=403, detail="forbidden")


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


class TenantSecretEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clave: str
    valor: str = Field(..., min_length=1)
    tier: Literal["A", "B"] = Field(
        default="A",
        description="A=normal (master key primaria), B=seguridad extendida",
    )
    etiqueta: str | None = Field(default=None, max_length=200)


class TenantSecretsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    secrets: list[TenantSecretEntry] = Field(..., min_length=1)


class TenantValidationPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: Literal["webchat", "calendar", "mail", "twilio", "whatsapp", "messenger", "full"] = "full"


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
    user_token: str = Depends(require_user_token),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantScopedSettings:
    await require_permission(user_token, "settings.view")
    row = await platform_repo.get_organizacion_details(organizacion_id=context.organizacion_id)
    if not row:
        raise HTTPException(status_code=404, detail="tenant_not_found")
    current_config = row.get("config") if isinstance(row.get("config"), dict) else {}
    ensured_config = await _ensure_tenant_calendar_bootstrap(
        repo=platform_repo,
        tenant_id=context.organizacion_id,
        tenant_name=str(row.get("nombre") or context.organizacion_id),
        current_config=current_config,
    )
    if ensured_config != current_config:
        saved = await platform_repo.set_organizacion_config(
            organizacion_id=context.organizacion_id,
            config=ensured_config,
        )
        row["config"] = saved.get("config") if isinstance(saved.get("config"), dict) else ensured_config
    routes = await platform_repo.list_channel_routes(organizacion_id=context.organizacion_id)
    return await _build_tenant_response(context.organizacion_id, row, routes)


@router.put("/me/settings", response_model=TenantScopedSettings)
async def update_tenant_settings(
    payload: TenantScopedUpdateRequest,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantScopedSettings:
    await require_permission(user_token, "settings.manage")
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


@router.post("/me/secrets", response_model=TenantSecretsResponse)
async def upsert_tenant_secrets(
    payload: TenantSecretsPayload,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantSecretsResponse:
    await require_permission(user_token, "settings.manage")
    items: list[SecretMetadata] = []
    for entry in payload.secrets:
        secret_key = _normalize_secret_key(entry.clave)
        master_key = _get_master_key_for_tier(entry.tier)
        aad = f"org:{context.organizacion_id}:key:{secret_key}:tier:{entry.tier}"
        try:
            nonce_b64, ciphertext_b64 = encrypt_secret(
                plaintext=entry.valor, master_key=master_key, aad=aad
            )
        except SecretsCryptoError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        existing = await repo.get_secret_row(
            organizacion_id=context.organizacion_id, clave=secret_key
        )
        version = 1
        if isinstance(existing, dict):
            try:
                version = int(existing.get("version") or 1) + 1
            except (TypeError, ValueError):
                version = 2

        etiqueta = entry.etiqueta or f"aesgcm:v1:tier:{entry.tier}"
        try:
            row = await repo.upsert_secret(
                organizacion_id=context.organizacion_id,
                clave=secret_key,
                valor_cifrado=ciphertext_b64,
                nonce=nonce_b64,
                etiqueta=etiqueta,
                version=version,
                updated_by=context.user_id,
            )
        except PlatformRepositoryError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        safe_row = {
            "id": row.get("id"),
            "organizacion_id": row.get("organizacion_id"),
            "clave": row.get("clave"),
            "etiqueta": row.get("etiqueta"),
            "version": row.get("version"),
            "creado_por": row.get("creado_por"),
            "actualizado_por": row.get("actualizado_por"),
            "creado_en": row.get("creado_en"),
            "actualizado_en": row.get("actualizado_en"),
        }
        items.append(SecretMetadata.model_validate(safe_row))

    return TenantSecretsResponse(items=items)


@router.get("/me/secrets", response_model=TenantSecretsResponse)
async def list_tenant_secrets(
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantSecretsResponse:
    await require_permission(user_token, "settings.view")
    items = await repo.list_secret_metadata(organizacion_id=context.organizacion_id)
    return TenantSecretsResponse(items=[SecretMetadata.model_validate(row) for row in items])


@router.delete("/me/secrets/{clave:path}", status_code=204)
async def delete_tenant_secret(
    clave: str,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> Response:
    await require_permission(user_token, "settings.manage")
    secret_key = _normalize_secret_key(clave)
    try:
        await repo.delete_secret(organizacion_id=context.organizacion_id, clave=secret_key)
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(status_code=204)


@router.get("/me/routes", response_model=TenantRoutesResponse)
async def list_tenant_routes(
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantRoutesResponse:
    await require_permission(user_token, "settings.view")
    routes = await repo.list_channel_routes(organizacion_id=context.organizacion_id)
    return TenantRoutesResponse(items=[ChannelRoute.model_validate(row) for row in routes])


@router.post("/me/routes", response_model=CreateRouteResponse)
async def create_tenant_route(
    payload: CreateRouteRequest,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> CreateRouteResponse:
    await require_permission(user_token, "settings.manage")
    canal = payload.canal.strip().lower()
    clave = payload.clave.strip().lower()
    if not canal or not clave:
        raise HTTPException(status_code=400, detail="invalid_route_key")
    try:
        route = await repo.create_channel_route(
            payload={
                "organizacion_id": str(context.organizacion_id),
                "canal": canal,
                "clave": clave,
                "metadata": payload.metadata or {},
                "activo": bool(payload.activo),
            }
        )
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    channel_routing.invalidate_cache(canal=canal, clave=clave)
    return CreateRouteResponse(route=ChannelRoute.model_validate(route))


@router.delete("/me/routes/{route_id}", status_code=204)
async def delete_tenant_route(
    route_id: UUID,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> Response:
    await require_permission(user_token, "settings.manage")
    try:
        await repo.delete_channel_route(organizacion_id=context.organizacion_id, route_id=route_id)
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(status_code=204)


@router.put("/me/config", response_model=TenantConfigResponse)
async def set_my_tenant_config(
    payload: SetTenantConfigRequest,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantConfigResponse:
    await require_permission(user_token, "settings.manage")
    tenant_row = await repo.get_organizacion_details(organizacion_id=context.organizacion_id)
    tenant_name = str((tenant_row or {}).get("nombre") or context.organizacion_id)
    ensured_config = await _ensure_tenant_calendar_bootstrap(
        repo=repo,
        tenant_id=context.organizacion_id,
        tenant_name=tenant_name,
        current_config=payload.config,
    )
    try:
        row = await repo.set_organizacion_config(
            organizacion_id=context.organizacion_id,
            config=ensured_config,
        )
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    config = row.get("config")
    return TenantConfigResponse(
        organizacion_id=context.organizacion_id,
        config=config if isinstance(config, dict) else {},
    )


@router.post("/me/validate", response_model=TenantValidationReport)
async def tenant_validate(
    payload: TenantValidationPayload,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantValidationReport:
    await require_permission(user_token, "settings.view")
    config = await repo.get_organizacion_config(organizacion_id=context.organizacion_id)
    if config is None:
        raise HTTPException(status_code=404, detail="tenant_not_found")

    routes = await repo.list_channel_routes(organizacion_id=context.organizacion_id)
    secrets = await repo.list_secret_metadata(organizacion_id=context.organizacion_id)

    return build_validation_report(
        organizacion_id=context.organizacion_id,
        config=config,
        routes=routes,
        secrets=secrets,
        scope=payload.scope,
    )
