"""Rutas administrativas (globales) para gestionar tenants y routing."""

from __future__ import annotations

from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import settings
from app.core.secrets_crypto import SecretsCryptoError, encrypt_secret
from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError
from app.services import channel_routing

router = APIRouter(prefix="/admin", tags=["admin"])


def get_platform_repo() -> PlatformRepository:
    try:
        return PlatformRepository()
    except PlatformRepositoryError as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def require_user_token(
    x_user_token: Annotated[str | None, Header(alias="X-User-Token")] = None,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> str:
    if x_user_token:
        token = x_user_token.strip()
        if token:
            return token
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        if token:
            return token
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="authorization_invalid")


async def require_platform_admin(
    user_token: str = Depends(require_user_token),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> UUID:
    try:
        user = await repo.auth_get_user(user_token=user_token)
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    raw_id = user.get("id")
    try:
        user_id = UUID(str(raw_id))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="auth_user_invalid") from exc

    try:
        allowed = await repo.is_platform_admin(user_id=user_id)
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not allowed:
        raise HTTPException(status_code=403, detail="platform_admin_required")
    return user_id


class TenantSummary(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    nombre: str
    razon_social: str | None = None
    dominio_principal: str | None = None
    estado_onboarding: str | None = None
    activo: bool | None = None
    config: dict[str, Any] | None = None


class TenantsResponse(BaseModel):
    ok: bool = True
    items: list[TenantSummary] = Field(default_factory=list)


class CreateTenantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nombre: str = Field(..., min_length=2)
    razon_social: str | None = None
    dominio_principal: str | None = None
    config: dict[str, Any] | None = None
    webchat_alias: str | None = Field(
        default=None,
        description="Alias público para enrutar el webchat (se guarda como canal=webchat, clave=alias).",
    )


class CreateTenantResponse(BaseModel):
    ok: bool = True
    tenant: TenantSummary


class ChannelRoute(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    organizacion_id: UUID
    canal: str
    clave: str
    metadata: dict[str, Any] | None = None
    activo: bool | None = None


class TenantRoutesResponse(BaseModel):
    ok: bool = True
    items: list[ChannelRoute] = Field(default_factory=list)


class CreateRouteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    canal: str = Field(..., min_length=2)
    clave: str = Field(..., min_length=2)
    metadata: dict[str, Any] | None = None
    activo: bool = True


class CreateRouteResponse(BaseModel):
    ok: bool = True
    route: ChannelRoute


class TenantConfigResponse(BaseModel):
    ok: bool = True
    organizacion_id: UUID
    config: dict[str, Any] = Field(default_factory=dict)


class SetTenantConfigRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    config: dict[str, Any] = Field(default_factory=dict)


class SecretMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    organizacion_id: UUID
    clave: str
    etiqueta: str | None = None
    version: int
    creado_por: UUID | None = None
    actualizado_por: UUID | None = None
    creado_en: str | None = None
    actualizado_en: str | None = None


class TenantSecretsResponse(BaseModel):
    ok: bool = True
    items: list[SecretMetadata] = Field(default_factory=list)


class SetTenantSecretRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    valor: str = Field(..., min_length=1)
    tier: Literal["A", "B"] = Field(
        default="A",
        description="A=normal (master key primaria), B=seguridad extendida (master key secundaria).",
    )
    etiqueta: str | None = Field(default=None, max_length=200)


class SetTenantSecretResponse(BaseModel):
    ok: bool = True
    secret: SecretMetadata


class TenantValidationReport(BaseModel):
    ok: bool = True
    organizacion_id: UUID
    missing_routes: list[str] = Field(default_factory=list)
    missing_secrets: list[str] = Field(default_factory=list)
    missing_config: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


def _normalize_secret_key(raw: str) -> str:
    value = raw.strip().lower()
    if not value:
        raise HTTPException(status_code=400, detail="invalid_secret_key")
    if len(value) > 200:
        raise HTTPException(status_code=400, detail="invalid_secret_key")
    allowed = set("abcdefghijklmnopqrstuvwxyz0123456789._/-")
    if any(ch not in allowed for ch in value):
        raise HTTPException(status_code=400, detail="invalid_secret_key")
    return value


def _get_master_key_for_tier(tier: Literal["A", "B"]) -> str:
    if tier == "B":
        if not settings.secrets_master_key_high:
            raise HTTPException(status_code=500, detail="secrets_master_key_high_not_configured")
        return settings.secrets_master_key_high
    if not settings.secrets_master_key:
        raise HTTPException(status_code=500, detail="secrets_master_key_not_configured")
    return settings.secrets_master_key


def _get_config_value(config: dict[str, Any], dotted_key: str) -> Any:
    current: Any = config
    for part in dotted_key.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


@router.get("/tenants", response_model=TenantsResponse)
async def list_tenants(
    _: UUID = Depends(require_platform_admin),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantsResponse:
    items = await repo.list_organizaciones()
    return TenantsResponse(items=[TenantSummary.model_validate(row) for row in items])


@router.post("/tenants", response_model=CreateTenantResponse)
async def create_tenant(
    payload: CreateTenantRequest,
    _: UUID = Depends(require_platform_admin),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> CreateTenantResponse:
    tenant_payload: dict[str, Any] = {
        "nombre": payload.nombre,
    }
    if payload.razon_social:
        tenant_payload["razon_social"] = payload.razon_social
    if payload.dominio_principal:
        tenant_payload["dominio_principal"] = payload.dominio_principal
    if payload.config is not None:
        tenant_payload["config"] = payload.config

    tenant = await repo.create_organizacion(payload=tenant_payload)

    alias = payload.webchat_alias.strip().lower() if payload.webchat_alias else None
    if alias:
        try:
            await repo.create_channel_route(
                payload={
                    "organizacion_id": str(tenant["id"]),
                    "canal": "webchat",
                    "clave": alias,
                    "metadata": {"source": "admin.create_tenant"},
                    "activo": True,
                }
            )
            channel_routing.invalidate_cache(canal="webchat", clave=alias)
        except PlatformRepositoryError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    return CreateTenantResponse(tenant=TenantSummary.model_validate(tenant))


@router.get("/tenants/{organizacion_id}/routes", response_model=TenantRoutesResponse)
async def list_tenant_routes(
    organizacion_id: UUID,
    _: UUID = Depends(require_platform_admin),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantRoutesResponse:
    routes = await repo.list_channel_routes(organizacion_id=organizacion_id)
    return TenantRoutesResponse(items=[ChannelRoute.model_validate(row) for row in routes])


@router.post("/tenants/{organizacion_id}/routes", response_model=CreateRouteResponse)
async def create_tenant_route(
    organizacion_id: UUID,
    payload: CreateRouteRequest,
    _: UUID = Depends(require_platform_admin),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> CreateRouteResponse:
    canal = payload.canal.strip().lower()
    clave = payload.clave.strip().lower()
    if not canal or not clave:
        raise HTTPException(status_code=400, detail="invalid_route_key")
    try:
        route = await repo.create_channel_route(
            payload={
                "organizacion_id": str(organizacion_id),
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


@router.delete("/tenants/{organizacion_id}/routes/{route_id}", status_code=204)
async def delete_tenant_route(
    organizacion_id: UUID,
    route_id: UUID,
    _: UUID = Depends(require_platform_admin),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> Response:
    try:
        await repo.delete_channel_route(organizacion_id=organizacion_id, route_id=route_id)
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(status_code=204)


@router.get("/tenants/{organizacion_id}/config", response_model=TenantConfigResponse)
async def get_tenant_config(
    organizacion_id: UUID,
    _: UUID = Depends(require_platform_admin),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantConfigResponse:
    config = await repo.get_organizacion_config(organizacion_id=organizacion_id)
    if config is None:
        raise HTTPException(status_code=404, detail="tenant_not_found")
    return TenantConfigResponse(organizacion_id=organizacion_id, config=config)


@router.put("/tenants/{organizacion_id}/config", response_model=TenantConfigResponse)
async def set_tenant_config(
    organizacion_id: UUID,
    payload: SetTenantConfigRequest,
    user_id: UUID = Depends(require_platform_admin),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantConfigResponse:
    try:
        _ = user_id  # reservado para auditoría futura
        row = await repo.set_organizacion_config(organizacion_id=organizacion_id, config=payload.config)
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    config = row.get("config")
    return TenantConfigResponse(
        organizacion_id=organizacion_id,
        config=config if isinstance(config, dict) else {},
    )


@router.get("/tenants/{organizacion_id}/secrets", response_model=TenantSecretsResponse)
async def list_tenant_secrets(
    organizacion_id: UUID,
    _: UUID = Depends(require_platform_admin),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantSecretsResponse:
    items = await repo.list_secret_metadata(organizacion_id=organizacion_id)
    return TenantSecretsResponse(items=[SecretMetadata.model_validate(row) for row in items])


@router.put("/tenants/{organizacion_id}/secrets/{clave:path}", response_model=SetTenantSecretResponse)
async def set_tenant_secret(
    organizacion_id: UUID,
    clave: str,
    payload: SetTenantSecretRequest,
    user_id: UUID = Depends(require_platform_admin),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> SetTenantSecretResponse:
    secret_key = _normalize_secret_key(clave)

    master_key = _get_master_key_for_tier(payload.tier)
    aad = f"org:{organizacion_id}:key:{secret_key}:tier:{payload.tier}"
    try:
        nonce_b64, ciphertext_b64 = encrypt_secret(
            plaintext=payload.valor, master_key=master_key, aad=aad
        )
    except SecretsCryptoError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    existing = await repo.get_secret_row(organizacion_id=organizacion_id, clave=secret_key)
    version = 1
    if isinstance(existing, dict):
        try:
            version = int(existing.get("version") or 1) + 1
        except (TypeError, ValueError):
            version = 2

    etiqueta = payload.etiqueta or f"aesgcm:v1:tier:{payload.tier}"
    try:
        row = await repo.upsert_secret(
            organizacion_id=organizacion_id,
            clave=secret_key,
            valor_cifrado=ciphertext_b64,
            nonce=nonce_b64,
            etiqueta=etiqueta,
            version=version,
            updated_by=user_id,
        )
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Nunca devolver valor/nonce/cifrado. Solo metadata.
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
    return SetTenantSecretResponse(secret=SecretMetadata.model_validate(safe_row))


@router.delete("/tenants/{organizacion_id}/secrets/{clave:path}", status_code=204)
async def delete_tenant_secret(
    organizacion_id: UUID,
    clave: str,
    _: UUID = Depends(require_platform_admin),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> Response:
    secret_key = _normalize_secret_key(clave)
    try:
        await repo.delete_secret(organizacion_id=organizacion_id, clave=secret_key)
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(status_code=204)


@router.post("/tenants/{organizacion_id}/validate", response_model=TenantValidationReport)
async def validate_tenant(
    organizacion_id: UUID,
    scope: Literal["webchat", "full"] = "full",
    _: UUID = Depends(require_platform_admin),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantValidationReport:
    config = await repo.get_organizacion_config(organizacion_id=organizacion_id)
    if config is None:
        raise HTTPException(status_code=404, detail="tenant_not_found")

    routes = await repo.list_channel_routes(organizacion_id=organizacion_id)
    secrets = await repo.list_secret_metadata(organizacion_id=organizacion_id)

    report = TenantValidationReport(organizacion_id=organizacion_id)

    # Routing mínimo por canal (puedes ampliar esto por cliente/caso).
    required_route_canals = ["webchat"] if scope in {"webchat", "full"} else []
    for canal in required_route_canals:
        has = any(isinstance(r, dict) and r.get("canal") == canal for r in routes)
        if not has:
            report.missing_routes.append(f"route:{canal}")

    # Secretos mínimos (POR_TENANT) según contrato canónico.
    required_secrets = ["openai.api_key"]
    if scope == "full":
        required_secrets.extend(
            [
                "twilio.account_sid",
                "twilio.auth_token",
                "meta.messenger.page_access_token",
                "meta.messenger.app_secret",
                "meta.messenger.verify_token",
                "mail.username",
                "mail.password",
                "calendar.username",
                "calendar.password",
                "google.places_api_key",
                "google.oauth.client_secret",
            ]
        )
    present_secret_keys = {
        str(row.get("clave")).strip().lower()
        for row in secrets
        if isinstance(row, dict) and row.get("clave")
    }
    for key in required_secrets:
        if key not in present_secret_keys:
            report.missing_secrets.append(key)

    # Config mínima (no secreta) para webchat (puedes ampliar por canal).
    required_config = []
    if scope in {"webchat", "full"}:
        required_config.extend(
            [
                "webchat.assistant_id",
                "webchat.prompt_version",
                "webchat.inactivity_hours",
                "webchat.persist_session",
            ]
        )
    for dotted in required_config:
        value = _get_config_value(config, dotted)
        if value is None or value == "":
            report.missing_config.append(dotted)

    if not settings.secrets_master_key:
        report.notes.append("TALIA_SECRETS_MASTER_KEY no está configurada (tier A fallará).")
    if not settings.secrets_master_key_high:
        report.notes.append("TALIA_SECRETS_MASTER_KEY_HIGH no está configurada (tier B fallará).")

    return report
