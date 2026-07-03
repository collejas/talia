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
from app.core.logging import get_logger
from app.core.secrets_crypto import SecretsCryptoError, encrypt_secret
from app.repositories.crm import CRMRepository, CRMRepositoryError
from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError
from app.services import tenant_runtime
from app.services import channel_routing

router = APIRouter(prefix="/tenant", tags=["tenant"])
logger = get_logger("app.api.tenant")


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

    organizacion_id_from_db = await crm_repo.get_usuario_organizacion_id(usuario_id=user_id)
    organizacion_id_from_metadata = _extract_organizacion_id_from_metadata(user)
    if organizacion_id_from_db and organizacion_id_from_metadata and organizacion_id_from_db != organizacion_id_from_metadata:
        logger.warning(
            "tenant_context_metadata_mismatch",
            extra={
                "user_id": str(user_id),
                "metadata_organizacion_id": str(organizacion_id_from_metadata),
                "db_organizacion_id": str(organizacion_id_from_db),
            },
        )

    organizacion_id = organizacion_id_from_db or organizacion_id_from_metadata
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
    nombre_comercial: str | None = None
    razon_social: str | None = None
    rfc: str | None = None
    pais: str | None = None
    pais_codigo_iso2: str | None = None
    estado: str | None = None
    estado_clave_entidad: str | None = None
    ciudad: str | None = None
    municipio_clave_entidad: str | None = None
    municipio_clave_municipio: str | None = None
    dominio_principal: str | None = None
    telefono: str | None = None
    correo_contacto_principal: str | None = None
    correo_facturacion: str | None = None
    contacto_nombre: str | None = None
    contacto_telefono: str | None = None
    timezone: str | None = None
    idioma: str | None = None
    moneda: str | None = None
    logo_url: str | None = None
    direccion_fiscal: str | None = None
    direccion_fiscal_calle: str | None = None
    direccion_fiscal_numero_exterior: str | None = None
    direccion_fiscal_numero_interior: str | None = None
    direccion_fiscal_colonia: str | None = None
    direccion_fiscal_localidad: str | None = None
    direccion_fiscal_referencia: str | None = None
    codigo_postal: str | None = None
    regimen_fiscal: str | None = None
    sitio_web: str | None = None
    estado_onboarding: str | None = None
    activo: bool | None = None
    config: dict[str, Any] | None = None
    routes: list[ChannelRoute] = Field(default_factory=list)


class TenantContactCatalogsResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    organizacion_id: UUID
    catalogos: dict[str, Any] = Field(default_factory=dict)


class TenantScopedUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nombre: str | None = Field(default=None, min_length=2)
    nombre_comercial: str | None = None
    razon_social: str | None = None
    dominio_principal: str | None = None
    rfc: str | None = None
    pais: str | None = None
    pais_codigo_iso2: str | None = None
    estado: str | None = None
    estado_clave_entidad: str | None = None
    ciudad: str | None = None
    municipio_clave_entidad: str | None = None
    municipio_clave_municipio: str | None = None
    telefono: str | None = None
    correo_contacto_principal: str | None = None
    correo_facturacion: str | None = None
    contacto_nombre: str | None = None
    contacto_telefono: str | None = None
    timezone: str | None = None
    idioma: str | None = None
    moneda: str | None = None
    logo_url: str | None = None
    direccion_fiscal: str | None = None
    direccion_fiscal_calle: str | None = None
    direccion_fiscal_numero_exterior: str | None = None
    direccion_fiscal_numero_interior: str | None = None
    direccion_fiscal_colonia: str | None = None
    direccion_fiscal_localidad: str | None = None
    direccion_fiscal_referencia: str | None = None
    codigo_postal: str | None = None
    regimen_fiscal: str | None = None
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


def _build_organization_address_summary(source: Any) -> str | None:
    calle = getattr(source, "direccion_fiscal_calle", None)
    numero_exterior = getattr(source, "direccion_fiscal_numero_exterior", None)
    numero_interior = getattr(source, "direccion_fiscal_numero_interior", None)
    colonia = getattr(source, "direccion_fiscal_colonia", None)
    localidad = getattr(source, "direccion_fiscal_localidad", None)
    ciudad = getattr(source, "ciudad", None)
    estado = getattr(source, "estado", None)
    pais = getattr(source, "pais", None) or getattr(source, "pais_codigo_iso2", None)
    codigo_postal = getattr(source, "codigo_postal", None)
    referencia = getattr(source, "direccion_fiscal_referencia", None)

    parts: list[str] = []
    street_parts = [str(calle).strip() if calle else ""]
    if numero_exterior:
        street_parts.append(f"No. {str(numero_exterior).strip()}")
    if numero_interior:
        street_parts.append(f"Int. {str(numero_interior).strip()}")
    street = " ".join(part for part in street_parts if part)
    if street:
        parts.append(street)
    if colonia:
        parts.append(f"Col. {str(colonia).strip()}")
    if localidad:
        parts.append(str(localidad).strip())
    if ciudad and str(ciudad).strip() != (str(localidad).strip() if localidad else ""):
        parts.append(str(ciudad).strip())
    if estado:
        parts.append(str(estado).strip())
    if pais:
        parts.append(str(pais).strip())
    if codigo_postal:
        parts.append(f"CP {str(codigo_postal).strip()}")
    if referencia:
        parts.append(f"Ref. {str(referencia).strip()}")
    summary = ", ".join(part for part in parts if part)
    return summary or None


def _apply_organization_fields(target: dict[str, Any], source: Any) -> dict[str, Any]:
    for source_name, target_name in (
        ("pais", "pais"),
        ("pais_codigo_iso2", "pais_codigo_iso2"),
        ("estado", "estado"),
        ("estado_clave_entidad", "estado_clave_entidad"),
        ("ciudad", "ciudad"),
        ("municipio_clave_entidad", "municipio_clave_entidad"),
        ("municipio_clave_municipio", "municipio_clave_municipio"),
        ("direccion_fiscal_calle", "direccion_fiscal_calle"),
        ("direccion_fiscal_numero_exterior", "direccion_fiscal_numero_exterior"),
        ("direccion_fiscal_numero_interior", "direccion_fiscal_numero_interior"),
        ("direccion_fiscal_colonia", "direccion_fiscal_colonia"),
        ("direccion_fiscal_localidad", "direccion_fiscal_localidad"),
        ("direccion_fiscal_referencia", "direccion_fiscal_referencia"),
        ("codigo_postal", "codigo_postal"),
        ("regimen_fiscal", "regimen_fiscal"),
        ("sitio_web", "sitio_web"),
        ("nombre", "nombre"),
        ("nombre_comercial", "nombre_comercial"),
        ("razon_social", "razon_social"),
        ("dominio_principal", "dominio_principal"),
        ("rfc", "rfc"),
        ("telefono", "telefono"),
        ("correo_contacto_principal", "correo_contacto_principal"),
        ("correo_facturacion", "correo_facturacion"),
        ("contacto_nombre", "contacto_nombre"),
        ("contacto_telefono", "contacto_telefono"),
        ("timezone", "timezone"),
        ("idioma", "idioma"),
        ("moneda", "moneda"),
        ("logo_url", "logo_url"),
    ):
        value = getattr(source, source_name, None)
        if value is not None:
            target[target_name] = value

    if "pais" not in target:
        country = getattr(source, "pais_codigo_iso2", None)
        if country is not None:
            target["pais"] = country

    if "direccion_fiscal" not in target:
        summary = _build_organization_address_summary(source)
        if summary:
            target["direccion_fiscal"] = summary

    return target


async def _build_tenant_response(
    organizacion_id: UUID,
    row: dict[str, Any],
    routes: list[dict[str, Any]],
) -> TenantScopedSettings:
    data = {
        "organizacion_id": organizacion_id,
        "nombre": row.get("nombre") or "",
        "nombre_comercial": row.get("nombre_comercial"),
        "razon_social": row.get("razon_social"),
        "rfc": row.get("rfc"),
        "pais": row.get("pais"),
        "pais_codigo_iso2": row.get("pais_codigo_iso2"),
        "estado": row.get("estado"),
        "estado_clave_entidad": row.get("estado_clave_entidad"),
        "ciudad": row.get("ciudad"),
        "municipio_clave_entidad": row.get("municipio_clave_entidad"),
        "municipio_clave_municipio": row.get("municipio_clave_municipio"),
        "dominio_principal": row.get("dominio_principal"),
        "telefono": row.get("telefono"),
        "correo_contacto_principal": row.get("correo_contacto_principal"),
        "correo_facturacion": row.get("correo_facturacion"),
        "contacto_nombre": row.get("contacto_nombre"),
        "contacto_telefono": row.get("contacto_telefono"),
        "timezone": row.get("timezone"),
        "idioma": row.get("idioma"),
        "moneda": row.get("moneda"),
        "logo_url": row.get("logo_url"),
        "direccion_fiscal": row.get("direccion_fiscal"),
        "direccion_fiscal_calle": row.get("direccion_fiscal_calle"),
        "direccion_fiscal_numero_exterior": row.get("direccion_fiscal_numero_exterior"),
        "direccion_fiscal_numero_interior": row.get("direccion_fiscal_numero_interior"),
        "direccion_fiscal_colonia": row.get("direccion_fiscal_colonia"),
        "direccion_fiscal_localidad": row.get("direccion_fiscal_localidad"),
        "direccion_fiscal_referencia": row.get("direccion_fiscal_referencia"),
        "codigo_postal": row.get("codigo_postal"),
        "regimen_fiscal": row.get("regimen_fiscal"),
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


def _extract_contact_catalogs(config: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(config, dict):
        return {}
    extras = config.get("extras")
    if not isinstance(extras, dict):
        return {}
    catalogos = extras.get("catalogos")
    return catalogos if isinstance(catalogos, dict) else {}


@router.get("/me/contactos/catalogos", response_model=TenantContactCatalogsResponse)
async def get_tenant_contact_catalogs(
    context: TenantContext = Depends(require_tenant_context),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantContactCatalogsResponse:
    row = await platform_repo.get_organizacion_details(organizacion_id=context.organizacion_id)
    if not row:
        raise HTTPException(status_code=404, detail="tenant_not_found")

    config = row.get("config") if isinstance(row.get("config"), dict) else None
    catalogos = _extract_contact_catalogs(config)

    try:
        puestos = await platform_repo.list_tenant_bootstrap_catalog(tipo="puesto")
    except PlatformRepositoryError:
        puestos = []
    if not catalogos.get("puesto") and puestos:
        catalogos = {**catalogos, "puesto": puestos}

    return TenantContactCatalogsResponse(
        organizacion_id=context.organizacion_id,
        catalogos=catalogos,
    )


@router.put("/me/settings", response_model=TenantScopedSettings)
async def update_tenant_settings(
    payload: TenantScopedUpdateRequest,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantScopedSettings:
    await require_permission(user_token, "settings.manage")
    update_payload = payload.model_dump(exclude_none=True)
    update_payload = _apply_organization_fields(update_payload, payload)
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
        tenant_runtime.invalidate_runtime_cache(organizacion_id=context.organizacion_id)

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
    tenant_runtime.invalidate_runtime_cache(organizacion_id=context.organizacion_id)
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
    tenant_runtime.invalidate_runtime_cache(organizacion_id=context.organizacion_id)
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
