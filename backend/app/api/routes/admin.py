"""Rutas administrativas (globales) para gestionar tenants y routing."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any, Literal
from uuid import UUID

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.config import settings
from app.core.secrets_crypto import SecretsCryptoError, encrypt_secret
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError
from app.services import channel_routing
from app.services.role_permissions_sync import (
    compute_matrix_hash,
    parse_role_permissions_matrix,
    sync_role_permissions,
)
from app.services.supabase_admin import SupabaseAdminError, create_supabase_user

router = APIRouter(prefix="/admin", tags=["admin"])


class AdminDebugRowsResponse(BaseModel):
    ok: bool = True
    items: list[dict[str, Any]] = Field(default_factory=list)


def _resolve_matrix_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return (Path(__file__).resolve().parents[3] / path).resolve()


def get_platform_repo() -> PlatformRepository:
    try:
        return PlatformRepository()
    except PlatformRepositoryError as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def get_crm_repo() -> CRMRepository:
    try:
        return CRMRepository()
    except CRMRepositoryError as exc:  # pragma: no cover
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


def get_crm_repo_with_user(
    user_token: str = Depends(require_user_token),
) -> CRMRepository:
    try:
        return CRMRepository(user_token=user_token)
    except CRMRepositoryError as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc)) from exc


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


class AdminActor(BaseModel):
    user_id: UUID
    organizacion_id: UUID | None = None
    is_platform_admin: bool = False
    is_owner: bool = False


def _is_owner_context(context: dict[str, Any]) -> bool:
    if context.get("es_owner") is True:
        return True
    roles = context.get("roles")
    if isinstance(roles, list):
        return any(str(role).strip().lower() == "owner" for role in roles)
    return False


async def require_platform_admin_or_owner(
    user_token: str = Depends(require_user_token),
    repo: PlatformRepository = Depends(get_platform_repo),
    crm_repo: CRMRepository = Depends(get_crm_repo_with_user),
) -> AdminActor:
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
    if allowed:
        return AdminActor(user_id=user_id, is_platform_admin=True)

    try:
        context = await crm_repo.get_permission_context()
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if not _is_owner_context(context):
        raise HTTPException(status_code=403, detail="owner_required")

    org_value = context.get("organizacion_id")
    if not org_value:
        raise HTTPException(status_code=403, detail="owner_without_org")
    try:
        organizacion_id = UUID(str(org_value))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=403, detail="owner_org_invalid") from exc

    return AdminActor(
        user_id=user_id,
        organizacion_id=organizacion_id,
        is_owner=True,
    )


@router.get("/me/platform-admin")
async def get_my_platform_admin_status(
    user_token: str = Depends(require_user_token),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> dict[str, bool]:
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
    return {"is_platform_admin": bool(allowed)}


@router.get("/debug/inbox/threads", response_model=AdminDebugRowsResponse)
async def debug_inbox_threads_as_actor(
    actor_user_id: UUID = Query(..., description="auth.uid a emular en el RPC"),
    estado: str | None = Query(default=None),
    asignado_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0, le=5000),
    message_limit: int = Query(default=20, ge=1, le=50),
    _: UUID = Depends(require_platform_admin),
    repo: CRMRepository = Depends(get_crm_repo),
) -> AdminDebugRowsResponse:
    try:
        rows = await repo.inbox_threads_debug(
            actor_user_id=actor_user_id,
            estado=estado,
            asignado_id=asignado_id,
            limit=limit,
            offset=offset,
            message_limit=message_limit,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return AdminDebugRowsResponse(items=rows)


@router.get("/debug/leads/restarts", response_model=AdminDebugRowsResponse)
async def debug_restart_stats_as_actor(
    actor_user_id: UUID = Query(..., description="auth.uid a emular en el RPC"),
    organizacion_id: UUID = Query(...),
    min_restart_sequence: int = Query(default=1, ge=1, le=100),
    limit: int = Query(default=200, ge=1, le=500),
    _: UUID = Depends(require_platform_admin),
    repo: CRMRepository = Depends(get_crm_repo),
) -> AdminDebugRowsResponse:
    try:
        rows = await repo.contact_restart_stats_debug(
            actor_user_id=actor_user_id,
            organizacion_id=organizacion_id,
            min_restart_sequence=min_restart_sequence,
            limit=limit,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return AdminDebugRowsResponse(items=rows)


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


class RolePermissionsSyncRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    organizacion_id: UUID | None = None
    matrix_path: str | None = None
    prune: bool | None = None
    dry_run: bool | None = None
    force: bool | None = None


class RolePermissionsSyncResponse(BaseModel):
    ok: bool = True
    skipped: bool = False
    reason: str | None = None
    organizacion_id: UUID | None = None
    matrix_path: str | None = None
    matrix_hash: str | None = None
    added: int | None = None
    removed: int | None = None


@router.post("/roles/permissions/sync", response_model=RolePermissionsSyncResponse)
async def sync_role_permissions_from_matrix(
    payload: RolePermissionsSyncRequest,
    _: UUID = Depends(require_platform_admin),
) -> RolePermissionsSyncResponse:
    matrix_path = payload.matrix_path or settings.role_permissions_matrix_path
    resolved_path = _resolve_matrix_path(matrix_path)
    if not resolved_path.exists():
        raise HTTPException(status_code=404, detail="matrix_not_found")

    content = resolved_path.read_text(encoding="utf-8")
    matrix_hash = compute_matrix_hash(content)

    state_path = _resolve_matrix_path(settings.role_permissions_sync_state_path)
    if not payload.force and state_path.exists():
        stored = state_path.read_text(encoding="utf-8").strip()
        if stored == matrix_hash:
            return RolePermissionsSyncResponse(
                skipped=True,
                reason="hash_unchanged",
                matrix_path=str(resolved_path),
                matrix_hash=matrix_hash,
            )

    try:
        plans = parse_role_permissions_matrix(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    org_id = (
        payload.organizacion_id
        or settings.webchat_default_organizacion_id
        or settings.whatsapp_default_organizacion_id
    )
    if not org_id:
        raise HTTPException(status_code=400, detail="organizacion_id_missing")

    prune = payload.prune if payload.prune is not None else settings.role_permissions_sync_prune
    dry_run = bool(payload.dry_run)

    try:
        summary = await sync_role_permissions(
            organizacion_id=UUID(str(org_id)),
            plans=plans,
            prune=bool(prune),
            dry_run=dry_run,
        )
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if not dry_run:
        state_path.write_text(matrix_hash, encoding="utf-8")

    return RolePermissionsSyncResponse(
        organizacion_id=UUID(str(org_id)),
        matrix_path=str(resolved_path),
        matrix_hash=matrix_hash,
        added=summary["added"],
        removed=summary["removed"],
    )


class CreateTenantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nombre: str = Field(..., min_length=2)
    razon_social: str | None = None
    dominio_principal: str | None = None
    rfc: str | None = None
    pais: str | None = None
    estado: str | None = None
    ciudad: str | None = None
    telefono: str | None = None
    sitio_web: str | None = None
    activo: bool | None = None
    estado_onboarding: str | None = None
    config: dict[str, Any] | None = None
    webchat_alias: str | None = Field(
        default=None,
        description="Alias público para enrutar el webchat (se guarda como canal=webchat, clave=alias).",
    )


class CreateTenantResponse(BaseModel):
    ok: bool = True
    tenant: TenantSummary


class TenantBasicInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    nombre: str
    razon_social: str | None = None
    rfc: str | None = None
    pais: str | None = None
    estado: str | None = None
    ciudad: str | None = None
    dominio_principal: str | None = None
    telefono: str | None = None
    sitio_web: str | None = None
    estado_onboarding: str | None = None


class TenantSeedPermission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codigo: str = Field(..., min_length=1)
    descripcion: str | None = None


class TenantSeedPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    departamento: str = Field(..., min_length=1)
    puesto: str = Field(..., min_length=1)
    rol_nombre: str = Field(..., min_length=1)
    rol_descripcion: str | None = None
    permisos: list[TenantSeedPermission] = Field(..., min_length=1)


class TenantAdminPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    correo: str
    nombre_completo: str | None = None
    telefono: str | None = None
    estado: str = Field(default="activo")

    @field_validator("correo")
    @classmethod
    def _validate_correo(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("correo_invalid")
        try:
            validated = validate_email(cleaned, test_environment=True)
        except EmailNotValidError as exc:
            raise ValueError("correo_invalid") from exc
        return validated.normalized


class CreateTenantWithAdminRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tenant: CreateTenantRequest
    admin: TenantAdminPayload
    seed: TenantSeedPayload


class TenantSeedSummary(BaseModel):
    rol_id: UUID
    permisos_ids: list[UUID]
    departamento_id: UUID
    puesto_id: UUID
    empleado_id: UUID


class CreateTenantWithAdminResponse(BaseModel):
    ok: bool = True
    tenant_id: UUID
    usuario_id: UUID
    seed: TenantSeedSummary
    recovery_email_sent: bool
    activo: bool | None = None


class TenantDetailResponse(BaseModel):
    ok: bool = True
    tenant: TenantBasicInfo


class UpdateTenantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nombre: str | None = None
    razon_social: str | None = None
    dominio_principal: str | None = None
    rfc: str | None = None
    pais: str | None = None
    estado: str | None = None
    ciudad: str | None = None
    telefono: str | None = None
    sitio_web: str | None = None
    activo: bool | None = None
    estado_onboarding: str | None = None


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
    actor: AdminActor = Depends(require_platform_admin_or_owner),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantsResponse:
    items = await repo.list_organizaciones()
    if actor.is_owner:
        items = [row for row in items if str(row.get("id")) == str(actor.organizacion_id)]
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
    if payload.rfc:
        tenant_payload["rfc"] = payload.rfc
    if payload.pais:
        tenant_payload["pais"] = payload.pais
    if payload.estado:
        tenant_payload["estado"] = payload.estado
    if payload.ciudad:
        tenant_payload["ciudad"] = payload.ciudad
    if payload.telefono:
        tenant_payload["telefono"] = payload.telefono
    if payload.sitio_web:
        tenant_payload["sitio_web"] = payload.sitio_web
    if payload.activo is not None:
        tenant_payload["activo"] = bool(payload.activo)
    if payload.estado_onboarding:
        tenant_payload["estado_onboarding"] = payload.estado_onboarding
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


@router.post("/tenants/con_usuario", response_model=CreateTenantWithAdminResponse)
async def create_tenant_with_admin(
    payload: CreateTenantWithAdminRequest,
    _: UUID = Depends(require_platform_admin),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> CreateTenantWithAdminResponse:
    try:
        tenant_payload: dict[str, Any] = {"nombre": payload.tenant.nombre}
        if payload.tenant.razon_social:
            tenant_payload["razon_social"] = payload.tenant.razon_social
        if payload.tenant.dominio_principal:
            tenant_payload["dominio_principal"] = payload.tenant.dominio_principal
        if payload.tenant.rfc:
            tenant_payload["rfc"] = payload.tenant.rfc
        if payload.tenant.pais:
            tenant_payload["pais"] = payload.tenant.pais
        if payload.tenant.estado:
            tenant_payload["estado"] = payload.tenant.estado
        if payload.tenant.ciudad:
            tenant_payload["ciudad"] = payload.tenant.ciudad
        if payload.tenant.telefono:
            tenant_payload["telefono"] = payload.tenant.telefono
        if payload.tenant.sitio_web:
            tenant_payload["sitio_web"] = payload.tenant.sitio_web
        if payload.tenant.activo is not None:
            tenant_payload["activo"] = bool(payload.tenant.activo)
        if payload.tenant.estado_onboarding:
            tenant_payload["estado_onboarding"] = payload.tenant.estado_onboarding
        if payload.tenant.config is not None:
            tenant_payload["config"] = payload.tenant.config

        tenant = await repo.create_organizacion(payload=tenant_payload)
        tenant_id = UUID(str(tenant["id"]))

        alias = payload.tenant.webchat_alias.strip().lower() if payload.tenant.webchat_alias else None
        if alias:
            try:
                await repo.create_channel_route(
                    payload={
                        "organizacion_id": str(tenant_id),
                        "canal": "webchat",
                        "clave": alias,
                        "metadata": {"source": "admin.create_tenant_with_admin"},
                        "activo": True,
                    }
                )
                channel_routing.invalidate_cache(canal="webchat", clave=alias)
            except PlatformRepositoryError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc

        permisos_input = []
        for permiso in payload.seed.permisos:
            permisos_input.append(
                {"codigo": permiso.codigo.strip(), "descripcion": permiso.descripcion}
            )
        permisos_rows = await repo.create_permissions(organizacion_id=tenant_id, permisos=permisos_input)
        permiso_ids = [UUID(str(row["id"])) for row in permisos_rows]

        role = await repo.create_role(
            organizacion_id=tenant_id,
            nombre=payload.seed.rol_nombre,
            descripcion=payload.seed.rol_descripcion,
        )
        role_id = UUID(str(role["id"]))
        for permiso_id in permiso_ids:
            await repo.create_role_permission(
                organizacion_id=tenant_id, rol_id=role_id, permiso_id=permiso_id
            )

        departamento = await repo.create_department(
            organizacion_id=tenant_id, nombre=payload.seed.departamento
        )
        departamento_id = UUID(str(departamento["id"]))
        puesto = await repo.create_position(organizacion_id=tenant_id, nombre=payload.seed.puesto)
        puesto_id = UUID(str(puesto["id"]))

        usuario_id_str, telefono_value = await create_supabase_user(
            email=payload.admin.correo,
            nombre=payload.admin.nombre_completo,
            telefono=payload.admin.telefono,
            organizacion_id=str(tenant_id),
        )
        usuario_id = UUID(usuario_id_str)

        await repo.upsert_usuario(
            usuario_id=usuario_id,
            payload={
                "correo": payload.admin.correo,
                "nombre_completo": payload.admin.nombre_completo,
                "telefono_e164": telefono_value,
                "estado": payload.admin.estado,
                "organizacion_id": str(tenant_id),
            },
        )

        await repo.assign_user_role(
            usuario_id=usuario_id, rol_id=role_id, organizacion_id=tenant_id
        )

        await repo.create_employee(
            usuario_id=usuario_id,
            departamento_id=departamento_id,
            puesto_id=puesto_id,
            organizacion_id=tenant_id,
        )

        return CreateTenantWithAdminResponse(
            tenant_id=tenant_id,
            usuario_id=usuario_id,
            seed=TenantSeedSummary(
                rol_id=role_id,
                permisos_ids=permiso_ids,
                departamento_id=departamento_id,
                puesto_id=puesto_id,
                empleado_id=usuario_id,
            ),
            recovery_email_sent=True,
        )
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except SupabaseAdminError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/tenants/{organizacion_id}", response_model=TenantDetailResponse)
async def get_tenant_info(
    organizacion_id: UUID,
    actor: AdminActor = Depends(require_platform_admin_or_owner),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantDetailResponse:
    if actor.is_owner and actor.organizacion_id != organizacion_id:
        raise HTTPException(status_code=403, detail="owner_scope_violation")
    row = await repo.get_organizacion_details(organizacion_id=organizacion_id)
    if not row:
        raise HTTPException(status_code=404, detail="tenant_not_found")
    return TenantDetailResponse(tenant=TenantBasicInfo.model_validate(row))


@router.patch("/tenants/{organizacion_id}", response_model=TenantDetailResponse)
async def update_tenant_info(
    organizacion_id: UUID,
    payload: UpdateTenantRequest,
    actor: AdminActor = Depends(require_platform_admin_or_owner),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantDetailResponse:
    if actor.is_owner and actor.organizacion_id != organizacion_id:
        raise HTTPException(status_code=403, detail="owner_scope_violation")
    update_payload = payload.model_dump(exclude_none=True)
    if not update_payload:
        raise HTTPException(status_code=400, detail="nothing_to_update")
    try:
        row = await repo.update_organizacion_details(
            organizacion_id=organizacion_id,
            payload=update_payload,
        )
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return TenantDetailResponse(tenant=TenantBasicInfo.model_validate(row))


@router.get("/tenants/{organizacion_id}/routes", response_model=TenantRoutesResponse)
async def list_tenant_routes(
    organizacion_id: UUID,
    actor: AdminActor = Depends(require_platform_admin_or_owner),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantRoutesResponse:
    if actor.is_owner and actor.organizacion_id != organizacion_id:
        raise HTTPException(status_code=403, detail="owner_scope_violation")
    routes = await repo.list_channel_routes(organizacion_id=organizacion_id)
    return TenantRoutesResponse(items=[ChannelRoute.model_validate(row) for row in routes])


@router.post("/tenants/{organizacion_id}/routes", response_model=CreateRouteResponse)
async def create_tenant_route(
    organizacion_id: UUID,
    payload: CreateRouteRequest,
    actor: AdminActor = Depends(require_platform_admin_or_owner),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> CreateRouteResponse:
    if actor.is_owner and actor.organizacion_id != organizacion_id:
        raise HTTPException(status_code=403, detail="owner_scope_violation")
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
    actor: AdminActor = Depends(require_platform_admin_or_owner),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> Response:
    if actor.is_owner and actor.organizacion_id != organizacion_id:
        raise HTTPException(status_code=403, detail="owner_scope_violation")
    try:
        await repo.delete_channel_route(organizacion_id=organizacion_id, route_id=route_id)
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(status_code=204)


@router.get("/tenants/{organizacion_id}/config", response_model=TenantConfigResponse)
async def get_tenant_config(
    organizacion_id: UUID,
    actor: AdminActor = Depends(require_platform_admin_or_owner),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantConfigResponse:
    if actor.is_owner and actor.organizacion_id != organizacion_id:
        raise HTTPException(status_code=403, detail="owner_scope_violation")
    config = await repo.get_organizacion_config(organizacion_id=organizacion_id)
    if config is None:
        raise HTTPException(status_code=404, detail="tenant_not_found")
    return TenantConfigResponse(organizacion_id=organizacion_id, config=config)


@router.put("/tenants/{organizacion_id}/config", response_model=TenantConfigResponse)
async def set_tenant_config(
    organizacion_id: UUID,
    payload: SetTenantConfigRequest,
    actor: AdminActor = Depends(require_platform_admin_or_owner),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantConfigResponse:
    if actor.is_owner and actor.organizacion_id != organizacion_id:
        raise HTTPException(status_code=403, detail="owner_scope_violation")
    try:
        _ = actor.user_id  # reservado para auditoría futura
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
    actor: AdminActor = Depends(require_platform_admin_or_owner),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantSecretsResponse:
    if actor.is_owner and actor.organizacion_id != organizacion_id:
        raise HTTPException(status_code=403, detail="owner_scope_violation")
    items = await repo.list_secret_metadata(organizacion_id=organizacion_id)
    return TenantSecretsResponse(items=[SecretMetadata.model_validate(row) for row in items])


@router.put("/tenants/{organizacion_id}/secrets/{clave:path}", response_model=SetTenantSecretResponse)
async def set_tenant_secret(
    organizacion_id: UUID,
    clave: str,
    payload: SetTenantSecretRequest,
    actor: AdminActor = Depends(require_platform_admin_or_owner),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> SetTenantSecretResponse:
    if actor.is_owner and actor.organizacion_id != organizacion_id:
        raise HTTPException(status_code=403, detail="owner_scope_violation")
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
            updated_by=actor.user_id,
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
    actor: AdminActor = Depends(require_platform_admin_or_owner),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> Response:
    if actor.is_owner and actor.organizacion_id != organizacion_id:
        raise HTTPException(status_code=403, detail="owner_scope_violation")
    secret_key = _normalize_secret_key(clave)
    try:
        await repo.delete_secret(organizacion_id=organizacion_id, clave=secret_key)
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(status_code=204)


@router.post("/tenants/{organizacion_id}/validate", response_model=TenantValidationReport)
async def validate_tenant(
    organizacion_id: UUID,
    scope: Literal["webchat", "calendar", "mail", "twilio", "messenger", "full"] = "full",
    actor: AdminActor = Depends(require_platform_admin_or_owner),
    repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantValidationReport:
    if actor.is_owner and actor.organizacion_id != organizacion_id:
        raise HTTPException(status_code=403, detail="owner_scope_violation")
    config = await repo.get_organizacion_config(organizacion_id=organizacion_id)
    if config is None:
        raise HTTPException(status_code=404, detail="tenant_not_found")

    routes = await repo.list_channel_routes(organizacion_id=organizacion_id)
    secrets = await repo.list_secret_metadata(organizacion_id=organizacion_id)

    return build_validation_report(
        organizacion_id=organizacion_id,
        config=config,
        routes=routes,
        secrets=secrets,
        scope=scope,
    )


def build_validation_report(
    organizacion_id: UUID,
    config: dict[str, Any],
    routes: list[dict[str, Any]],
    secrets: list[dict[str, Any]],
    scope: Literal["webchat", "calendar", "mail", "twilio", "messenger", "full"],
) -> TenantValidationReport:
    report = TenantValidationReport(organizacion_id=organizacion_id)

    required_route_canals: list[str] = []
    if scope in {"webchat", "calendar", "full"}:
        required_route_canals.append("webchat")
    if scope in {"twilio", "full"}:
        required_route_canals.append("whatsapp")
    if scope in {"messenger", "full"}:
        required_route_canals.append("messenger")
    for canal in required_route_canals:
        has = any(isinstance(r, dict) and r.get("canal") == canal for r in routes)
        if not has:
            report.missing_routes.append(f"route:{canal}")

    twilio_config_keys = [
        "twilio.phone_number",
        "twilio.phone_number_sid",
        "twilio.validate_signatures",
    ]
    voice_config_keys = [
        "voice.webhook_path",
        "voice.full_duplex",
        "voice.debug_verbose",
        "voice.energy_every_n",
    ]
    webchat_config_keys = [
        "webchat.assistant_id",
        "webchat.prompt_version",
        "webchat.inactivity_hours",
        "webchat.persist_session",
    ]
    calendar_config_keys = [
        "webchat.calendar.resource_id",
        "webchat.calendar.timezone",
        "webchat.calendar.default_days",
        "webchat.calendar.hold_minutes",
        "calendar.provider",
        "calendar.server_url",
        "calendar.server_port",
        "calendar.full_calendar_url",
        "calendar.full_contact_list_url",
    ]
    mail_config_keys = [
        "mail.incoming_server",
        "mail.incoming_port_imap",
        "mail.outgoing_server",
        "mail.outgoing_port_smtp",
        "mail.use_ssl",
        "mail.use_tls",
    ]
    messenger_config_keys = [
        "messenger.prompt_id",
        "messenger.prompt_version",
        "messenger.assistant_id",
        "messenger.inactivity_hours",
    ]

    if scope == "full":
        required_config = (
            webchat_config_keys
            + calendar_config_keys
            + mail_config_keys
            + twilio_config_keys
            + voice_config_keys
            + messenger_config_keys
        )
    elif scope == "calendar":
        required_config = calendar_config_keys
    elif scope == "mail":
        required_config = mail_config_keys
    elif scope == "twilio":
        required_config = twilio_config_keys + voice_config_keys
    elif scope == "messenger":
        required_config = messenger_config_keys
    else:
        required_config = webchat_config_keys

    if scope == "full":
        required_secrets = [
            "openai.api_key",
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
            "voice.stream_jwt_secret",
        ]
    elif scope == "calendar":
        required_secrets = ["calendar.username", "calendar.password"]
    elif scope == "mail":
        required_secrets = ["mail.username", "mail.password"]
    elif scope == "twilio":
        required_secrets = ["twilio.account_sid", "twilio.auth_token", "voice.stream_jwt_secret"]
    elif scope == "messenger":
        required_secrets = [
            "meta.messenger.page_access_token",
            "meta.messenger.app_secret",
            "meta.messenger.verify_token",
        ]
    else:
        required_secrets = ["openai.api_key"]

    present_secret_keys = {
        str(row.get("clave")).strip().lower()
        for row in secrets
        if isinstance(row, dict) and row.get("clave")
    }
    for key in required_secrets:
        if key not in present_secret_keys:
            report.missing_secrets.append(key)

    for dotted in required_config:
        value = _get_config_value(config, dotted)
        if value is None or value == "":
            report.missing_config.append(dotted)

    if not settings.secrets_master_key:
        report.notes.append("TALIA_SECRETS_MASTER_KEY no está configurada (tier A fallará).")
    if not settings.secrets_master_key_high:
        report.notes.append("TALIA_SECRETS_MASTER_KEY_HIGH no está configurada (tier B fallará).")

    return report
