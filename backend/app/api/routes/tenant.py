"""Rutas tenant-scoped para que un admin de organización edite su propia configuración."""

from __future__ import annotations

from datetime import datetime, time as dt_time, timezone
import secrets
from typing import Any, Literal
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

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
from app.services.tenant_onboarding import build_onboarding_progress
from app.services.postmark.repository import PostmarkRepository, PostmarkRepositoryError
from app.services.web_tracking import normalize_tracking_domain, verify_dns_txt
from app.services.meta_whatsapp_assisted import MetaWhatsAppAssistedClient, MetaWhatsAppConnectionError

router = APIRouter(prefix="/tenant", tags=["tenant"])
logger = get_logger("app.api.tenant")


class TenantContext(BaseModel):
    model_config = ConfigDict(extra="ignore")

    user_id: UUID
    organizacion_id: UUID


class TenantOnboardingProgressResponse(BaseModel):
    porcentaje: int = Field(..., ge=0, le=100)
    completados: int = Field(..., ge=0)
    total: int = Field(..., ge=1)
    paso_actual: str | None = None
    ultimo_paso: str | None = None
    completado: bool
    requiere_onboarding: bool = True
    webchat_decision: Literal["pendiente", "usar", "no_usar"] = "pendiente"
    voz_decision: Literal["pendiente", "usar", "no_usar"] = "pendiente"
    zoom_decision: Literal["pendiente", "usar", "no_usar"] = "pendiente"
    errores: list[str] = Field(default_factory=list)
    pasos: list[dict[str, Any]] = Field(default_factory=list)
    correo: dict[str, bool] = Field(default_factory=dict)


class TenantOnboardingProgressUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    webchat_decision: Literal["pendiente", "usar", "no_usar"] | None = None
    voz_decision: Literal["pendiente", "usar", "no_usar"] | None = None
    zoom_decision: Literal["pendiente", "usar", "no_usar"] | None = None
    ultimo_paso: str | None = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def at_least_one_value(self) -> "TenantOnboardingProgressUpdate":
        if (
            self.webchat_decision is None
            and self.voz_decision is None
            and self.zoom_decision is None
            and self.ultimo_paso is None
        ):
            raise ValueError("debe_indicar_un_cambio")
        return self


MASTER_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")


class MetaWhatsAppConnectionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    waba_id: str = Field(..., min_length=5, max_length=40, pattern=r"^[0-9]+$")
    phone_number_id: str = Field(..., min_length=5, max_length=40, pattern=r"^[0-9]+$")
    accion: Literal["validar", "registrar", "suscribir"] = "validar"
    pin: str | None = Field(default=None, min_length=6, max_length=6, pattern=r"^[0-9]{6}$")


class MetaWhatsAppConnectionResponse(BaseModel):
    organizacion_id: UUID
    waba_id: str
    phone_number_id: str
    estado: str
    waba_nombre: str | None = None
    phone_display: str | None = None
    phone_verified: bool | None = None
    suscrita: bool = False
    ultimo_validado_en: datetime | None = None
    registrado_en: datetime | None = None
    suscrito_en: datetime | None = None
    conectado_en: datetime | None = None
    ultimo_error_codigo: str | None = None
    ultimo_error_mensaje: str | None = None


class ProspeccionTemplateAiPromptConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    organizacion_id: UUID
    canal: Literal["whatsapp", "correo"]
    prompt_id: str = Field(..., min_length=1, max_length=255)
    prompt_version: str = Field(..., min_length=1, max_length=100)
    activo: bool
    actualizado_por: UUID | None = None
    actualizado_en: datetime | None = None


class ProspeccionTemplateAiPromptConfigResponse(BaseModel):
    items: list[ProspeccionTemplateAiPromptConfig] = Field(default_factory=list)


class ProspeccionTemplateAiPromptConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt_id: str = Field(..., min_length=1, max_length=255)
    prompt_version: str = Field(..., min_length=1, max_length=100)
    activo: bool = True


class ProspeccionTemplateAiLayout(BaseModel):
    model_config = ConfigDict(extra="ignore")

    organizacion_id: UUID
    id: UUID
    codigo: str = Field(..., min_length=2, max_length=80)
    nombre: str = Field(..., min_length=2, max_length=120)
    descripcion: str = Field(..., max_length=500)
    instrucciones_composicion: str = Field(..., min_length=10, max_length=6000)
    logo_ancho_px: int = Field(..., ge=80, le=240)
    canal: Literal["correo", "whatsapp"]
    activo: bool
    orden: int = Field(..., ge=0, le=9999)
    habilitado: bool
    predeterminado: bool
    actualizado_por: UUID | None = None
    creado_en: datetime | None = None
    actualizado_en: datetime | None = None


class ProspeccionTemplateAiLayoutsResponse(BaseModel):
    items: list[ProspeccionTemplateAiLayout] = Field(default_factory=list)


class ProspeccionTemplateAiLayoutCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    codigo: str = Field(..., min_length=2, max_length=80, pattern=r"^[a-z][a-z0-9_]{1,79}$")
    nombre: str = Field(..., min_length=2, max_length=120)
    descripcion: str = Field(..., max_length=500)
    instrucciones_composicion: str = Field(..., min_length=10, max_length=6000)
    logo_ancho_px: int = Field(default=140, ge=80, le=240)
    canal: Literal["correo"] = "correo"
    orden: int = Field(default=1000, ge=0, le=9999)
    habilitado: bool = True
    predeterminado: bool = False


class ProspeccionTemplateAiLayoutUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    descripcion: str | None = Field(default=None, max_length=500)
    instrucciones_composicion: str | None = Field(default=None, min_length=10, max_length=6000)
    logo_ancho_px: int | None = Field(default=None, ge=80, le=240)
    orden: int | None = Field(default=None, ge=0, le=9999)
    activo: bool | None = None
    habilitado: bool | None = None
    predeterminado: bool | None = None


class TenantWebTrackingDomain(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    tracking_site_id: UUID
    domain: str
    domain_normalized: str
    verification_method: Literal["dns", "html_file", "manual"]
    verification_status: Literal["pending", "verified", "rejected", "inactive"]
    verification_token: str | None = None
    verified_at: datetime | None = None
    verification_last_attempt_at: datetime | None = None
    verification_attempt_count: int = 0
    verification_error_code: str | None = None
    verification_error_message: str | None = None
    active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TenantWebTrackingSite(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    public_site_id: str
    active: bool
    consent_required: bool
    last_event_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    domains: list[TenantWebTrackingDomain] = Field(default_factory=list)


class TenantWebTrackingResponse(BaseModel):
    items: list[TenantWebTrackingSite] = Field(default_factory=list)


class TenantWebTrackingSiteCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    consent_required: bool = True


class TenantWebTrackingSiteUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    active: bool | None = None
    consent_required: bool | None = None


class TenantWebTrackingDomainCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    domain: str = Field(..., min_length=1, max_length=253)
    verification_method: Literal["dns", "html_file", "manual"] = "dns"


class TenantWebTrackingDomainUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    active: bool | None = None
    verification_method: Literal["dns", "html_file", "manual"] | None = None


class TenantWebTrackingVerificationResult(BaseModel):
    verified: bool
    verification_status: Literal["pending", "verified", "rejected", "inactive"]
    error_code: str | None = None
    message: str
    domain: TenantWebTrackingDomain


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
    request: Request,
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

    requested_organizacion_id = request.headers.get("x-organizacion-id")
    if requested_organizacion_id:
        try:
            requested_id = UUID(requested_organizacion_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="organizacion_id_invalid") from exc
        if not await platform_repo.is_platform_admin(user_id=user_id):
            raise HTTPException(status_code=403, detail="platform_admin_required_for_organizacion_context")
        organizacion_id = requested_id

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
    eslogan_empresa: str | None = None
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
    ia_descripcion_empresa: str | None = None
    ia_productos_servicios: str | None = None
    ia_publico_objetivo: str | None = None
    ia_propuesta_valor: str | None = None
    ia_diferenciadores: str | None = None
    ia_restricciones_comerciales: str | None = None
    ia_color_primario: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    ia_color_secundario: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    ia_color_acento: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    ia_color_fondo: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    ia_estilo_visual: str | None = None
    ia_radio_bordes: str | None = Field(default=None, pattern=r"^(0|[1-9][0-9]{0,2})(px|rem|em|%)$")
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


class WhatsAppAssistantSchedulePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    activo: bool = False
    zona_horaria: str = Field(default="UTC", min_length=1, max_length=100)
    aplica_a_normal: bool = True
    aplica_a_prospeccion: bool = True
    lunes_activo: bool = False
    lunes_inicio: dt_time | None = None
    lunes_fin: dt_time | None = None
    martes_activo: bool = False
    martes_inicio: dt_time | None = None
    martes_fin: dt_time | None = None
    miercoles_activo: bool = False
    miercoles_inicio: dt_time | None = None
    miercoles_fin: dt_time | None = None
    jueves_activo: bool = False
    jueves_inicio: dt_time | None = None
    jueves_fin: dt_time | None = None
    viernes_activo: bool = False
    viernes_inicio: dt_time | None = None
    viernes_fin: dt_time | None = None
    sabado_activo: bool = False
    sabado_inicio: dt_time | None = None
    sabado_fin: dt_time | None = None
    domingo_activo: bool = False
    domingo_inicio: dt_time | None = None
    domingo_fin: dt_time | None = None

    @field_validator("zona_horaria")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("zona_horaria_required")
        try:
            ZoneInfo(normalized)
        except Exception as exc:
            raise ValueError("zona_horaria_invalid") from exc
        return normalized

    @model_validator(mode="after")
    def validate_day_windows(self) -> "WhatsAppAssistantSchedulePayload":
        for label in ("lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"):
            active = getattr(self, f"{label}_activo")
            start = getattr(self, f"{label}_inicio")
            end = getattr(self, f"{label}_fin")
            if active and (start is None or end is None):
                raise ValueError(f"{label}_horario_incompleto")
            if active and start == end:
                raise ValueError(f"{label}_horario_inicio_fin_iguales")
        return self


class WhatsAppAssistantScheduleResponse(WhatsAppAssistantSchedulePayload):
    model_config = ConfigDict(extra="ignore")

    id: UUID | None = None
    organizacion_id: UUID
    creado_en: datetime | None = None
    actualizado_en: datetime | None = None
    actualizado_por_usuario_id: UUID | None = None


class TenantContactCatalogsResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    organizacion_id: UUID
    catalogos: dict[str, Any] = Field(default_factory=dict)


class TenantScopedUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nombre: str | None = Field(default=None, min_length=2, max_length=40)
    nombre_comercial: str | None = None
    eslogan_empresa: str | None = Field(default=None, max_length=75)
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
    ia_descripcion_empresa: str | None = Field(default=None, max_length=4000)
    ia_productos_servicios: str | None = Field(default=None, max_length=4000)
    ia_publico_objetivo: str | None = Field(default=None, max_length=3000)
    ia_propuesta_valor: str | None = Field(default=None, max_length=3000)
    ia_diferenciadores: str | None = Field(default=None, max_length=3000)
    ia_restricciones_comerciales: str | None = Field(default=None, max_length=3000)
    ia_color_primario: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    ia_color_secundario: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    ia_color_acento: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    ia_color_fondo: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    ia_estilo_visual: str | None = Field(default=None, max_length=120)
    ia_radio_bordes: str | None = Field(default=None, pattern=r"^(0|[1-9][0-9]{0,2})(px|rem|em|%)$")
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


class UserMailConnectionState(BaseModel):
    model_config = ConfigDict(extra="ignore")

    habilitado: bool = False
    configurado: bool = False
    usa_fallback_sistema: bool = True
    username: str | None = None
    incoming_server: str | None = None
    incoming_port_imap: int | None = None
    outgoing_server: str | None = None
    outgoing_port_smtp: int | None = None
    use_ssl: bool = False
    use_tls: bool = True
    from_name: str | None = None
    reply_to: str | None = None
    password_configured: bool = False


class UserProfileResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    organizacion_id: UUID
    usuario_id: UUID
    nombre_completo: str | None = None
    correo: str | None = None
    telefono_e164: str | None = None
    timezone: str | None = None
    mail: UserMailConnectionState


class UserProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nombre_completo: str | None = Field(default=None, max_length=255)
    telefono_e164: str | None = Field(default=None, max_length=32)
    timezone: str | None = Field(default=None, max_length=64)
    mail_habilitado: bool | None = None
    mail_username: EmailStr | None = None
    mail_password: str | None = Field(default=None, max_length=512)
    mail_incoming_server: str | None = Field(default=None, max_length=255)
    mail_incoming_port_imap: int | None = Field(default=None, ge=1, le=65535)
    mail_outgoing_server: str | None = Field(default=None, max_length=255)
    mail_outgoing_port_smtp: int | None = Field(default=None, ge=1, le=65535)
    mail_use_ssl: bool | None = None
    mail_use_tls: bool | None = None
    mail_from_name: str | None = Field(default=None, max_length=255)
    mail_reply_to: EmailStr | None = None


def _clean_optional_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


def _normalize_optional_timezone(raw: str | None) -> str | None:
    if raw is None:
        return None
    trimmed = raw.strip()
    if not trimmed:
        return None
    try:
        ZoneInfo(trimmed)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="timezone_invalida") from exc
    return trimmed


def _normalize_optional_phone(raw: str | None) -> str | None:
    if raw is None:
        return None
    trimmed = raw.strip()
    if not trimmed:
        return None
    normalized = trimmed.replace(" ", "")
    if not normalized.startswith("+") or not normalized[1:].isdigit() or len(normalized) < 8:
        raise HTTPException(
            status_code=400,
            detail="telefono_invalido",
        )
    return normalized


def _mail_connection_ready(row: dict[str, Any] | None) -> bool:
    if not isinstance(row, dict):
        return False
    if row.get("mail_habilitado") is False:
        return False
    required = [
        _clean_optional_text(row.get("mail_username")),
        _clean_optional_text(row.get("mail_password_ciphertext")),
        _clean_optional_text(row.get("mail_password_nonce")),
        _clean_optional_text(row.get("mail_outgoing_server")),
        row.get("mail_outgoing_port_smtp"),
    ]
    return all(value is not None and value != "" for value in required)


def _build_mail_state(row: dict[str, Any] | None) -> UserMailConnectionState:
    if not isinstance(row, dict):
        return UserMailConnectionState()
    configured = _mail_connection_ready(row)
    enabled = bool(row.get("mail_habilitado"))
    return UserMailConnectionState(
        habilitado=enabled,
        configurado=configured,
        usa_fallback_sistema=not configured,
        username=_clean_optional_text(row.get("mail_username")),
        incoming_server=_clean_optional_text(row.get("mail_incoming_server")),
        incoming_port_imap=row.get("mail_incoming_port_imap"),
        outgoing_server=_clean_optional_text(row.get("mail_outgoing_server")),
        outgoing_port_smtp=row.get("mail_outgoing_port_smtp"),
        use_ssl=bool(row.get("mail_use_ssl")) if row.get("mail_use_ssl") is not None else False,
        use_tls=bool(row.get("mail_use_tls")) if row.get("mail_use_tls") is not None else True,
        from_name=_clean_optional_text(row.get("mail_from_name")),
        reply_to=_clean_optional_text(row.get("mail_reply_to")),
        password_configured=bool(_clean_optional_text(row.get("mail_password_ciphertext"))),
    )


async def _load_user_profile_response(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    usuario_id: UUID,
) -> UserProfileResponse:
    user_row = await repo.get_user_by_id(organizacion_id=organizacion_id, usuario_id=usuario_id)
    if not user_row:
        raise HTTPException(status_code=404, detail="user_not_found")

    mail_row = await repo.get_user_mail_config(organizacion_id=organizacion_id, usuario_id=usuario_id)
    return UserProfileResponse(
        organizacion_id=organizacion_id,
        usuario_id=usuario_id,
        nombre_completo=_clean_optional_text(user_row.get("nombre_completo")),
        correo=_clean_optional_text(user_row.get("correo")),
        telefono_e164=_clean_optional_text(user_row.get("telefono_e164")),
        timezone=_clean_optional_text(user_row.get("timezone")),
        mail=_build_mail_state(mail_row),
    )


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
    scope: Literal["webchat", "calendar", "mail", "twilio", "whatsapp", "messenger", "busqueda", "full"] = "full"


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
        ("eslogan_empresa", "eslogan_empresa"),
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
        ("ia_descripcion_empresa", "ia_descripcion_empresa"),
        ("ia_productos_servicios", "ia_productos_servicios"),
        ("ia_publico_objetivo", "ia_publico_objetivo"),
        ("ia_propuesta_valor", "ia_propuesta_valor"),
        ("ia_diferenciadores", "ia_diferenciadores"),
        ("ia_restricciones_comerciales", "ia_restricciones_comerciales"),
        ("ia_color_primario", "ia_color_primario"),
        ("ia_color_secundario", "ia_color_secundario"),
        ("ia_color_acento", "ia_color_acento"),
        ("ia_color_fondo", "ia_color_fondo"),
        ("ia_estilo_visual", "ia_estilo_visual"),
        ("ia_radio_bordes", "ia_radio_bordes"),
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
        "eslogan_empresa": row.get("eslogan_empresa"),
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
        "ia_descripcion_empresa": row.get("ia_descripcion_empresa"),
        "ia_productos_servicios": row.get("ia_productos_servicios"),
        "ia_publico_objetivo": row.get("ia_publico_objetivo"),
        "ia_propuesta_valor": row.get("ia_propuesta_valor"),
        "ia_diferenciadores": row.get("ia_diferenciadores"),
        "ia_restricciones_comerciales": row.get("ia_restricciones_comerciales"),
        "ia_color_primario": row.get("ia_color_primario"),
        "ia_color_secundario": row.get("ia_color_secundario"),
        "ia_color_acento": row.get("ia_color_acento"),
        "ia_color_fondo": row.get("ia_color_fondo"),
        "ia_estilo_visual": row.get("ia_estilo_visual"),
        "ia_radio_bordes": row.get("ia_radio_bordes"),
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


async def _get_onboarding_progress(
    *, context: TenantContext, platform_repo: PlatformRepository
) -> TenantOnboardingProgressResponse:
    tenant = await platform_repo.get_organizacion_details(organizacion_id=context.organizacion_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="tenant_not_found")
    routes = await platform_repo.list_channel_routes(organizacion_id=context.organizacion_id)
    secrets = await platform_repo.list_secret_metadata(organizacion_id=context.organizacion_id)
    whatsapp_connection = await platform_repo.get_whatsapp_meta_connection(
        organizacion_id=context.organizacion_id
    )
    preferences = await platform_repo.get_tenant_onboarding_progress(
        organizacion_id=context.organizacion_id
    )
    email_service: dict[str, Any] = {}
    try:
        email_repository = PostmarkRepository()
        email_service = {
            "migration": await email_repository.get_migration(organizacion_id=context.organizacion_id),
            "domain": await email_repository.get_verified_domain(organizacion_id=context.organizacion_id),
        }
    except PostmarkRepositoryError:
        # El resto del onboarding debe seguir siendo visible aunque el servicio
        # central de correo no esté disponible temporalmente.
        email_service = {}
    progress = build_onboarding_progress(
        tenant=tenant,
        routes=routes,
        secrets=secrets,
        preferences=preferences,
        email_service=email_service,
        whatsapp_connection=whatsapp_connection,
    )
    progress["webchat_decision"] = str((preferences or {}).get("webchat_decision") or "pendiente")
    progress["voz_decision"] = str((preferences or {}).get("voz_decision") or "pendiente")
    progress["zoom_decision"] = str((preferences or {}).get("zoom_decision") or "pendiente")
    return TenantOnboardingProgressResponse.model_validate(progress)


@router.get("/me/onboarding", response_model=TenantOnboardingProgressResponse)
async def get_tenant_onboarding_progress(
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantOnboardingProgressResponse:
    """Devuelve el avance funcional del tenant sin exponer nombres técnicos."""
    await require_permission(user_token, "settings.view")
    try:
        return await _get_onboarding_progress(context=context, platform_repo=platform_repo)
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail="onboarding_progress_unavailable") from exc


@router.patch("/me/onboarding", response_model=TenantOnboardingProgressResponse)
async def update_tenant_onboarding_progress(
    payload: TenantOnboardingProgressUpdate,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> TenantOnboardingProgressResponse:
    """Guarda decisiones y posición del flujo; no exige completar todo el proceso."""
    await require_permission(user_token, "settings.manage")
    values = payload.model_dump(exclude_none=True)
    if "ultimo_paso" in values:
        values["ultimo_paso_actualizado_en"] = datetime.now(timezone.utc).isoformat()
    values["actualizado_por"] = str(context.user_id)
    try:
        await platform_repo.upsert_tenant_onboarding_progress(
            organizacion_id=context.organizacion_id,
            payload=values,
        )
        if values.get("zoom_decision") == "no_usar":
            tenant = await platform_repo.get_organizacion_details(organizacion_id=context.organizacion_id)
            current_config = tenant.get("config") if isinstance(tenant, dict) else {}
            if not isinstance(current_config, dict):
                current_config = {}
            current_zoom = current_config.get("zoom") if isinstance(current_config.get("zoom"), dict) else {}
            await platform_repo.set_organizacion_config(
                organizacion_id=context.organizacion_id,
                config={**current_config, "zoom": {**current_zoom, "enabled": False}},
            )
        result = await _get_onboarding_progress(context=context, platform_repo=platform_repo)
        # El estado general se conserva en la organización para que otros
        # flujos administrativos puedan consultarlo sin duplicar el cálculo.
        onboarding_state = "completado" if result.completado else "en_progreso"
        await platform_repo.update_organizacion_details(
            organizacion_id=context.organizacion_id,
            payload={"estado_onboarding": onboarding_state},
        )
        return result
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail="onboarding_progress_unavailable") from exc


def _connection_response(row: dict[str, Any]) -> MetaWhatsAppConnectionResponse:
    return MetaWhatsAppConnectionResponse.model_validate(row)


@router.get("/me/whatsapp/meta/connection", response_model=MetaWhatsAppConnectionResponse | None)
async def get_meta_whatsapp_connection(
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> MetaWhatsAppConnectionResponse | None:
    await require_permission(user_token, "settings.view")
    try:
        row = await platform_repo.get_whatsapp_meta_connection(organizacion_id=context.organizacion_id)
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail="whatsapp_meta_connection_unavailable") from exc
    return _connection_response(row) if row else None


@router.post("/me/whatsapp/meta/connection", response_model=MetaWhatsAppConnectionResponse)
async def operate_meta_whatsapp_connection(
    payload: MetaWhatsAppConnectionPayload,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> MetaWhatsAppConnectionResponse:
    await require_permission(user_token, "settings.manage")
    if payload.accion == "registrar" and payload.pin is None:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "pin_required_for_registration",
                "message": "Captura el PIN de verificación en dos pasos para registrar el número.",
                "retryable": False,
            },
        )
    try:
        existing_tenant = await platform_repo.get_organizacion_details(organizacion_id=context.organizacion_id)
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail="whatsapp_meta_tenant_config_unavailable") from exc
    existing_config = existing_tenant.get("config") if isinstance(existing_tenant, dict) else None
    existing_whatsapp = existing_config.get("whatsapp") if isinstance(existing_config, dict) else None
    existing_meta = existing_whatsapp.get("meta") if isinstance(existing_whatsapp, dict) else None
    existing_phone = existing_meta.get("phone_number_id") if isinstance(existing_meta, dict) else None
    try:
        existing_connection = await platform_repo.get_whatsapp_meta_connection(
            organizacion_id=context.organizacion_id
        )
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail="whatsapp_meta_connection_unavailable") from exc

    existing_connection_state = str((existing_connection or {}).get("estado") or "")
    connection_ids_differ = bool(existing_connection) and (
        str(existing_connection.get("waba_id") or "") != payload.waba_id
        or str(existing_connection.get("phone_number_id") or "") != payload.phone_number_id
    )
    # Una conexión confirmada o una configuración legacy sin registro asistido
    # está operativa y no debe cambiarse desde un alta accidental. Los intentos
    # pendientes o fallidos sí deben poder corregirse con nuevos IDs.
    if existing_connection_state == "conectado" and connection_ids_differ:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "whatsapp_meta_connection_already_connected",
                "message": "Esta conexión ya está activa. Para cambiarla, solicita a soporte una sustitución controlada.",
                "retryable": False,
            },
        )
    if existing_connection is None and existing_phone and str(existing_phone) != payload.phone_number_id:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "whatsapp_meta_phone_already_configured",
                "message": "Este tenant ya tiene un número operativo. Para cambiarlo, solicita a soporte una sustitución controlada.",
                "retryable": False,
            },
        )
    if payload.accion == "suscribir" and not (existing_connection or {}).get("registrado_en"):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "whatsapp_registration_required",
                "message": "Primero completa el registro del número en el paso 2. Después podrás activar la conexión en el paso 3.",
                "retryable": False,
            },
        )
    now = datetime.now(timezone.utc).isoformat()
    values: dict[str, Any] = {
        "waba_id": payload.waba_id,
        "phone_number_id": payload.phone_number_id,
        "actualizado_en": now,
        "ultimo_error_codigo": None,
        "ultimo_error_mensaje": None,
    }
    if connection_ids_differ:
        values.update({"registrado_en": None, "suscrito_en": None, "conectado_en": None})
    try:
        client = MetaWhatsAppAssistedClient()
        inspected = await client.inspect(
            waba_id=payload.waba_id,
            phone_number_id=payload.phone_number_id,
            operation=payload.accion,
        )
        number = inspected["phone_number"]
        values.update({
            "estado": "validado",
            "ultimo_validado_en": now,
        })
        if payload.accion == "registrar":
            await client.register(phone_number_id=payload.phone_number_id, pin=payload.pin or "")
            values.update({"estado": "registrado", "registrado_en": now})
        elif payload.accion == "suscribir":
            await client.subscribe(waba_id=payload.waba_id)
            values.update({"estado": "suscrito", "suscrito_en": now})
            inspected = await client.inspect(
                waba_id=payload.waba_id,
                phone_number_id=payload.phone_number_id,
                operation="suscribir",
            )
            if inspected["subscribed"]:
                values.update({"estado": "conectado", "conectado_en": now})
        if inspected.get("subscribed") and payload.accion == "validar":
            values.update({"estado": "conectado", "conectado_en": now})
        presentation = {
            "waba_nombre": inspected["waba"].get("name"),
            "phone_display": number.get("display_phone_number"),
            "phone_verified": str(number.get("code_verification_status") or "").upper() == "VERIFIED",
            "suscrita": bool(inspected.get("subscribed")),
        }
    except MetaWhatsAppConnectionError as exc:
        error_values: dict[str, Any] = {
            "estado": "error",
            "ultimo_error_codigo": exc.code,
            "ultimo_error_mensaje": exc.message,
            "actualizado_en": now,
        }
        # No reemplazar la conexión canónica con IDs candidatos que Meta no
        # pudo validar. Esto permite reintentar con los IDs correctos sin
        # destruir una conexión previa o bloquear la recuperación.
        if existing_connection_state == "conectado":
            error_values["estado"] = "conectado"
        elif connection_ids_differ:
            # Solo se actualiza el error y la fecha; al no incluir IDs en este
            # payload, el upsert conserva la conexión canónica anterior.
            error_values["estado"] = "error"
        else:
            error_values.update(values)
        try:
            if existing_connection is None:
                await platform_repo.upsert_whatsapp_meta_connection(
                    organizacion_id=context.organizacion_id, values=error_values
                )
            else:
                await platform_repo.update_whatsapp_meta_connection_status(
                    organizacion_id=context.organizacion_id, values=error_values
                )
        except PlatformRepositoryError:
            pass
        raise HTTPException(
            status_code=422,
            detail={
                "code": exc.code,
                "message": exc.message,
                "retryable": exc.retryable,
            },
        ) from exc
    try:
        row = await platform_repo.upsert_whatsapp_meta_connection(organizacion_id=context.organizacion_id, values=values)
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail="whatsapp_meta_connection_save_failed") from exc
    # El resolver del webhook y el envío productivo siguen usando la
    # configuración existente del tenant. Solo una conexión completamente
    # confirmada puede cambiar el Phone ID y el proveedor operativo.
    if values.get("estado") == "conectado":
        try:
            tenant_row = await platform_repo.get_organizacion_details(organizacion_id=context.organizacion_id)
            current_config = tenant_row.get("config") if isinstance(tenant_row, dict) and isinstance(tenant_row.get("config"), dict) else {}
            whatsapp = dict(current_config.get("whatsapp")) if isinstance(current_config.get("whatsapp"), dict) else {}
            meta = dict(whatsapp.get("meta")) if isinstance(whatsapp.get("meta"), dict) else {}
            meta["phone_number_id"] = payload.phone_number_id
            whatsapp["meta"] = meta
            whatsapp["provider"] = "meta"
            saved_config = await platform_repo.set_organizacion_config(
                organizacion_id=context.organizacion_id,
                config={**current_config, "whatsapp": whatsapp},
            )
            _ = saved_config
        except PlatformRepositoryError as exc:
            raise HTTPException(status_code=502, detail="whatsapp_meta_tenant_config_save_failed") from exc
    return _connection_response({**row, **presentation})


def _require_master_tenant(context: TenantContext) -> None:
    if context.organizacion_id != MASTER_TENANT_ID:
        raise HTTPException(status_code=403, detail="master_tenant_only")


@router.get(
    "/me/prospeccion-template-ai-prompts",
    response_model=ProspeccionTemplateAiPromptConfigResponse,
)
async def get_prospeccion_template_ai_prompts(
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> ProspeccionTemplateAiPromptConfigResponse:
    await require_permission(user_token, "settings.view")
    _require_master_tenant(context)
    try:
        rows = await platform_repo.list_prospeccion_template_ai_prompt_configs(
            organizacion_id=MASTER_TENANT_ID,
        )
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    by_channel = {str(row.get("canal")): row for row in rows}
    items: list[ProspeccionTemplateAiPromptConfig] = []
    for channel in ("whatsapp", "correo"):
        row = by_channel.get(channel)
        if row is None:
            row = {
                "organizacion_id": MASTER_TENANT_ID,
                "canal": channel,
                "prompt_id": "pendiente-configurar",
                "prompt_version": "pendiente",
                "activo": False,
            }
        items.append(ProspeccionTemplateAiPromptConfig.model_validate(row))
    return ProspeccionTemplateAiPromptConfigResponse(items=items)


@router.put(
    "/me/prospeccion-template-ai-prompts/{canal}",
    response_model=ProspeccionTemplateAiPromptConfig,
)
async def update_prospeccion_template_ai_prompt(
    canal: Literal["whatsapp", "correo"],
    payload: ProspeccionTemplateAiPromptConfigUpdate,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> ProspeccionTemplateAiPromptConfig:
    await require_permission(user_token, "settings.manage")
    _require_master_tenant(context)
    prompt_id = payload.prompt_id.strip()
    prompt_version = payload.prompt_version.strip()
    if not prompt_id or not prompt_version:
        raise HTTPException(status_code=422, detail="prompt_id_and_version_required")
    try:
        row = await platform_repo.upsert_prospeccion_template_ai_prompt_config(
            organizacion_id=MASTER_TENANT_ID,
            canal=canal,
            prompt_id=prompt_id,
            prompt_version=prompt_version,
            activo=payload.activo,
            actualizado_por=context.user_id,
        )
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return ProspeccionTemplateAiPromptConfig.model_validate(row)


@router.get(
    "/me/prospeccion-template-ai-layouts",
    response_model=ProspeccionTemplateAiLayoutsResponse,
)
async def get_prospeccion_template_ai_layouts(
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> ProspeccionTemplateAiLayoutsResponse:
    await require_permission(user_token, "settings.view")
    try:
        rows = await platform_repo.list_prospeccion_template_ai_layouts(
            canal="correo",
            organizacion_id=context.organizacion_id,
        )
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail="prospeccion_template_ai_layouts_unavailable") from exc
    return ProspeccionTemplateAiLayoutsResponse(
        items=[ProspeccionTemplateAiLayout.model_validate(row) for row in rows]
    )


@router.post(
    "/me/prospeccion-template-ai-layouts",
    response_model=ProspeccionTemplateAiLayout,
    status_code=201,
)
async def create_prospeccion_template_ai_layout(
    payload: ProspeccionTemplateAiLayoutCreate,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> ProspeccionTemplateAiLayout:
    await require_permission(user_token, "settings.manage")
    if payload.predeterminado and not payload.habilitado:
        raise HTTPException(status_code=422, detail="prospeccion_template_ai_layout_default_disabled")
    try:
        rows = await platform_repo.list_prospeccion_template_ai_layouts(
            canal="correo",
            organizacion_id=context.organizacion_id,
        )
        if payload.predeterminado:
            await platform_repo.clear_prospeccion_template_ai_layout_defaults(organizacion_id=context.organizacion_id)
        row = await platform_repo.create_prospeccion_template_ai_layout(
            organizacion_id=context.organizacion_id,
            codigo=payload.codigo.strip().lower(),
            nombre=payload.nombre.strip(),
            descripcion=payload.descripcion.strip(),
            instrucciones_composicion=payload.instrucciones_composicion.strip(),
            logo_ancho_px=payload.logo_ancho_px,
            canal=payload.canal,
            orden=payload.orden if payload.orden else (max((int(item.get("orden") or 0) for item in rows), default=0) + 10),
            habilitado=payload.habilitado,
            predeterminado=payload.predeterminado,
            actualizado_por=context.user_id,
        )
    except HTTPException:
        raise
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=409, detail="prospeccion_template_ai_layout_create_failed") from exc
    return ProspeccionTemplateAiLayout.model_validate(row)


@router.put(
    "/me/prospeccion-template-ai-layouts/{layout_id}",
    response_model=ProspeccionTemplateAiLayout,
)
async def update_prospeccion_template_ai_layout(
    layout_id: UUID,
    payload: ProspeccionTemplateAiLayoutUpdate,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> ProspeccionTemplateAiLayout:
    await require_permission(user_token, "settings.manage")
    try:
        if payload.predeterminado is True and payload.habilitado is False:
            raise HTTPException(status_code=422, detail="prospeccion_template_ai_layout_default_disabled")
        rows = await platform_repo.list_prospeccion_template_ai_layouts(canal="correo", organizacion_id=context.organizacion_id)
        current = next((row for row in rows if str(row.get("id")) == str(layout_id)), None)
        if current is None:
            raise HTTPException(status_code=404, detail="prospeccion_template_ai_layout_not_found")
        update_payload = payload.model_dump(exclude_none=True)
        if payload.predeterminado is True:
            await platform_repo.clear_prospeccion_template_ai_layout_defaults(organizacion_id=context.organizacion_id)
        if payload.predeterminado is False and bool(current.get("predeterminado")):
            update_payload["predeterminado"] = False
        if (payload.habilitado is False or payload.activo is False) and bool(current.get("predeterminado")):
            update_payload["predeterminado"] = False
        if payload.habilitado is False:
            enabled_after = [row for row in rows if str(row.get("id")) != str(layout_id) and row.get("habilitado") is True]
            if not enabled_after:
                raise HTTPException(status_code=422, detail="prospeccion_template_ai_layout_required")
        update_payload["actualizado_por"] = str(context.user_id)
        row = await platform_repo.update_prospeccion_template_ai_layout(
            organizacion_id=context.organizacion_id,
            layout_id=layout_id,
            payload=update_payload,
        )
        if row is None:
            raise HTTPException(status_code=404, detail="prospeccion_template_ai_layout_not_found")
    except HTTPException:
        raise
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail="prospeccion_template_ai_layout_update_failed") from exc
    return ProspeccionTemplateAiLayout.model_validate(row)


@router.delete("/me/prospeccion-template-ai-layouts/{layout_id}", status_code=204)
async def delete_prospeccion_template_ai_layout(
    layout_id: UUID,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> Response:
    await require_permission(user_token, "settings.manage")
    try:
        rows = await platform_repo.list_prospeccion_template_ai_layouts(canal="correo", organizacion_id=context.organizacion_id)
        current = next((row for row in rows if str(row.get("id")) == str(layout_id)), None)
        if current is None:
            raise HTTPException(status_code=404, detail="prospeccion_template_ai_layout_not_found")
        if len(rows) <= 1:
            raise HTTPException(status_code=422, detail="prospeccion_template_ai_layout_required")
        if current.get("habilitado") is True and not any(
            row.get("habilitado") is True and str(row.get("id")) != str(layout_id) for row in rows
        ):
            raise HTTPException(status_code=422, detail="prospeccion_template_ai_layout_required")
        if not await platform_repo.delete_prospeccion_template_ai_layout(
            organizacion_id=context.organizacion_id,
            layout_id=layout_id,
        ):
            raise HTTPException(status_code=404, detail="prospeccion_template_ai_layout_not_found")
    except HTTPException:
        raise
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail="prospeccion_template_ai_layout_delete_failed") from exc
    return Response(status_code=204)


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


def _default_whatsapp_assistant_schedule(organizacion_id: UUID) -> WhatsAppAssistantScheduleResponse:
    return WhatsAppAssistantScheduleResponse(
        organizacion_id=organizacion_id,
        activo=False,
        zona_horaria="UTC",
        aplica_a_normal=True,
        aplica_a_prospeccion=True,
    )


def _build_whatsapp_assistant_schedule_response(
    *,
    organizacion_id: UUID,
    row: dict[str, Any] | None,
) -> WhatsAppAssistantScheduleResponse:
    if not isinstance(row, dict):
        return _default_whatsapp_assistant_schedule(organizacion_id)
    return WhatsAppAssistantScheduleResponse.model_validate(
        {**row, "organizacion_id": row.get("organizacion_id") or organizacion_id}
    )


@router.get(
    "/me/whatsapp-assistant-schedule",
    response_model=WhatsAppAssistantScheduleResponse,
)
async def get_whatsapp_assistant_schedule(
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> WhatsAppAssistantScheduleResponse:
    await require_permission(user_token, "settings.view")
    try:
        row = await platform_repo.get_whatsapp_assistant_schedule(
            organizacion_id=context.organizacion_id,
        )
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail="whatsapp_assistant_schedule_read_failed") from exc
    return _build_whatsapp_assistant_schedule_response(
        organizacion_id=context.organizacion_id,
        row=row,
    )


@router.put(
    "/me/whatsapp-assistant-schedule",
    response_model=WhatsAppAssistantScheduleResponse,
)
async def update_whatsapp_assistant_schedule(
    payload: WhatsAppAssistantSchedulePayload,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
    platform_repo: PlatformRepository = Depends(get_platform_repo),
) -> WhatsAppAssistantScheduleResponse:
    await require_permission(user_token, "settings.manage")
    schedule_payload = payload.model_dump(mode="json")
    schedule_payload["actualizado_por_usuario_id"] = str(context.user_id)
    try:
        row = await platform_repo.upsert_whatsapp_assistant_schedule(
            organizacion_id=context.organizacion_id,
            payload=schedule_payload,
        )
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail="whatsapp_assistant_schedule_save_failed") from exc
    tenant_runtime.invalidate_runtime_cache(organizacion_id=context.organizacion_id)
    return _build_whatsapp_assistant_schedule_response(
        organizacion_id=context.organizacion_id,
        row=row,
    )


@router.get("/me/profile", response_model=UserProfileResponse)
async def get_user_profile(
    context: TenantContext = Depends(require_tenant_context),
    repo: CRMRepository = Depends(get_crm_repo),
) -> UserProfileResponse:
    return await _load_user_profile_response(
        repo=repo,
        organizacion_id=context.organizacion_id,
        usuario_id=context.user_id,
    )


@router.put("/me/profile", response_model=UserProfileResponse)
async def update_user_profile(
    payload: UserProfileUpdateRequest,
    context: TenantContext = Depends(require_tenant_context),
    repo: CRMRepository = Depends(get_crm_repo),
) -> UserProfileResponse:
    user_updates: dict[str, Any] = {}
    if payload.nombre_completo is not None:
        user_updates["nombre_completo"] = _clean_optional_text(payload.nombre_completo)
    if payload.telefono_e164 is not None:
        user_updates["telefono_e164"] = _normalize_optional_phone(payload.telefono_e164)
    if payload.timezone is not None:
        user_updates["timezone"] = _normalize_optional_timezone(payload.timezone)

    if user_updates:
        try:
            await repo.update_user_profile_by_id(
                organizacion_id=context.organizacion_id,
                usuario_id=context.user_id,
                payload=user_updates,
            )
        except CRMRepositoryError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    mail_fields_present = any(
        value is not None
        for value in (
            payload.mail_habilitado,
            payload.mail_username,
            payload.mail_password,
            payload.mail_incoming_server,
            payload.mail_incoming_port_imap,
            payload.mail_outgoing_server,
            payload.mail_outgoing_port_smtp,
            payload.mail_use_ssl,
            payload.mail_use_tls,
            payload.mail_from_name,
            payload.mail_reply_to,
        )
    )
    if mail_fields_present:
        current_mail_row = await repo.get_user_mail_config(
            organizacion_id=context.organizacion_id,
            usuario_id=context.user_id,
        )
        merged_mail: dict[str, Any] = dict(current_mail_row or {})

        if payload.mail_habilitado is not None:
            merged_mail["mail_habilitado"] = payload.mail_habilitado
        if payload.mail_username is not None:
            merged_mail["mail_username"] = _clean_optional_text(str(payload.mail_username))
        if payload.mail_incoming_server is not None:
            merged_mail["mail_incoming_server"] = _clean_optional_text(payload.mail_incoming_server)
        if payload.mail_incoming_port_imap is not None:
            merged_mail["mail_incoming_port_imap"] = payload.mail_incoming_port_imap
        if payload.mail_outgoing_server is not None:
            merged_mail["mail_outgoing_server"] = _clean_optional_text(payload.mail_outgoing_server)
        if payload.mail_outgoing_port_smtp is not None:
            merged_mail["mail_outgoing_port_smtp"] = payload.mail_outgoing_port_smtp
        if payload.mail_use_ssl is not None:
            merged_mail["mail_use_ssl"] = payload.mail_use_ssl
        if payload.mail_use_tls is not None:
            merged_mail["mail_use_tls"] = payload.mail_use_tls
        if payload.mail_from_name is not None:
            merged_mail["mail_from_name"] = _clean_optional_text(payload.mail_from_name)
        if payload.mail_reply_to is not None:
            merged_mail["mail_reply_to"] = _clean_optional_text(str(payload.mail_reply_to))

        if payload.mail_password is not None:
            password = payload.mail_password.strip()
            if password:
                aad = tenant_runtime.build_user_mail_secret_aad(
                    organizacion_id=context.organizacion_id,
                    usuario_id=context.user_id,
                    clave="mail.password",
                )
                try:
                    nonce_b64, ciphertext_b64 = encrypt_secret(
                        plaintext=password,
                        master_key=_get_master_key_for_tier("A"),
                        aad=aad,
                    )
                except SecretsCryptoError as exc:
                    raise HTTPException(status_code=500, detail=str(exc)) from exc
                merged_mail["mail_password_nonce"] = nonce_b64
                merged_mail["mail_password_ciphertext"] = ciphertext_b64

        merged_mail.setdefault("mail_habilitado", True)
        merged_mail = {
            key: value
            for key, value in merged_mail.items()
            if key
            in {
                "mail_habilitado",
                "mail_username",
                "mail_password_nonce",
                "mail_password_ciphertext",
                "mail_incoming_server",
                "mail_incoming_port_imap",
                "mail_outgoing_server",
                "mail_outgoing_port_smtp",
                "mail_use_ssl",
                "mail_use_tls",
                "mail_from_name",
                "mail_reply_to",
            }
        }
        try:
            await repo.upsert_user_mail_config(
                organizacion_id=context.organizacion_id,
                usuario_id=context.user_id,
                payload=merged_mail,
            )
        except CRMRepositoryError as exc:
            logger.exception(
                "tenant_user_mail_profile_update_failed",
                extra={
                    "organizacion_id": str(context.organizacion_id),
                    "usuario_id": str(context.user_id),
                    "mail_habilitado": merged_mail.get("mail_habilitado"),
                    "mail_username_present": bool(merged_mail.get("mail_username")),
                    "mail_incoming_server_present": bool(merged_mail.get("mail_incoming_server")),
                    "mail_outgoing_server_present": bool(merged_mail.get("mail_outgoing_server")),
                },
            )
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    return await _load_user_profile_response(
        repo=repo,
        organizacion_id=context.organizacion_id,
        usuario_id=context.user_id,
    )


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


def _tracking_site_response(
    site: dict[str, Any],
    domains: list[dict[str, Any]],
) -> TenantWebTrackingSite:
    site_id = UUID(str(site["id"]))
    site_domains = [
        TenantWebTrackingDomain.model_validate(row)
        for row in domains
        if str(row.get("tracking_site_id")) == str(site_id)
    ]
    return TenantWebTrackingSite(
        id=site_id,
        public_site_id=str(site.get("public_site_id") or ""),
        active=bool(site.get("active")),
        consent_required=bool(site.get("consent_required")),
        last_event_at=site.get("last_event_at"),
        created_at=site.get("created_at"),
        updated_at=site.get("updated_at"),
        domains=site_domains,
    )


async def _load_web_tracking_response(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
) -> TenantWebTrackingResponse:
    sites = await repo.list_web_tracking_sites(organizacion_id=organizacion_id)
    domains = await repo.list_web_tracking_domains(organizacion_id=organizacion_id)
    return TenantWebTrackingResponse(
        items=[_tracking_site_response(site, domains) for site in sites]
    )


def _tracking_http_error(exc: CRMRepositoryError) -> HTTPException:
    detail = str(exc).lower()
    if "409" in detail or "duplicate" in detail or "unique" in detail:
        return HTTPException(status_code=409, detail="web_tracking_conflict")
    return HTTPException(status_code=502, detail="web_tracking_storage_failed")


@router.get("/me/web-tracking", response_model=TenantWebTrackingResponse)
async def list_tenant_web_tracking(
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
) -> TenantWebTrackingResponse:
    await require_permission(user_token, "settings.view")
    repo = CRMRepository(user_token=user_token)
    try:
        return await _load_web_tracking_response(
            repo=repo,
            organizacion_id=context.organizacion_id,
        )
    except CRMRepositoryError as exc:
        raise _tracking_http_error(exc) from exc


@router.post("/me/web-tracking/sites", response_model=TenantWebTrackingSite, status_code=201)
async def create_tenant_web_tracking_site(
    payload: TenantWebTrackingSiteCreateRequest,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
) -> TenantWebTrackingSite:
    await require_permission(user_token, "settings.manage")
    repo = CRMRepository(user_token=user_token)
    public_site_id = f"talia_site_{uuid4().hex}"
    try:
        site = await repo.create_web_tracking_site(
            organizacion_id=context.organizacion_id,
            public_site_id=public_site_id,
            consent_required=payload.consent_required,
        )
    except CRMRepositoryError as exc:
        raise _tracking_http_error(exc) from exc
    return _tracking_site_response(site, [])


@router.patch("/me/web-tracking/sites/{site_id}", response_model=TenantWebTrackingSite)
async def update_tenant_web_tracking_site(
    site_id: UUID,
    payload: TenantWebTrackingSiteUpdateRequest,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
) -> TenantWebTrackingSite:
    await require_permission(user_token, "settings.manage")
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="nothing_to_update")
    repo = CRMRepository(user_token=user_token)
    try:
        site = await repo.update_web_tracking_site(
            organizacion_id=context.organizacion_id,
            tracking_site_id=site_id,
            updates=updates,
        )
        if not site:
            raise HTTPException(status_code=404, detail="web_tracking_site_not_found")
        domains = await repo.list_web_tracking_domains(
            organizacion_id=context.organizacion_id,
            tracking_site_id=site_id,
        )
    except HTTPException:
        raise
    except CRMRepositoryError as exc:
        raise _tracking_http_error(exc) from exc
    return _tracking_site_response(site, domains)


@router.post(
    "/me/web-tracking/sites/{site_id}/domains",
    response_model=TenantWebTrackingDomain,
    status_code=201,
)
async def create_tenant_web_tracking_domain(
    site_id: UUID,
    payload: TenantWebTrackingDomainCreateRequest,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
) -> TenantWebTrackingDomain:
    await require_permission(user_token, "settings.manage")
    domain_normalized = normalize_tracking_domain(payload.domain)
    if not domain_normalized:
        raise HTTPException(status_code=400, detail="domain_invalid")
    repo = CRMRepository(user_token=user_token)
    verification_token = f"talia_verify_{secrets.token_urlsafe(24)}"
    try:
        row = await repo.create_web_tracking_domain(
            organizacion_id=context.organizacion_id,
            tracking_site_id=site_id,
            domain=domain_normalized,
            domain_normalized=domain_normalized,
            verification_method=payload.verification_method,
            verification_token=verification_token,
        )
    except CRMRepositoryError as exc:
        raise _tracking_http_error(exc) from exc
    return TenantWebTrackingDomain.model_validate(row)


@router.post(
    "/me/web-tracking/domains/{domain_id}/verify",
    response_model=TenantWebTrackingVerificationResult,
)
async def verify_tenant_web_tracking_domain(
    domain_id: UUID,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
) -> TenantWebTrackingVerificationResult:
    await require_permission(user_token, "settings.manage")
    repo = CRMRepository(user_token=user_token)
    try:
        rows = await repo.list_web_tracking_domains(organizacion_id=context.organizacion_id)
    except CRMRepositoryError as exc:
        raise _tracking_http_error(exc) from exc
    domain = next((row for row in rows if str(row.get("id")) == str(domain_id)), None)
    if not domain:
        raise HTTPException(status_code=404, detail="web_tracking_domain_not_found")

    verification_method = str(domain.get("verification_method") or "")
    if verification_method != "dns":
        raise HTTPException(status_code=400, detail="verification_method_dns_required")
    token = str(domain.get("verification_token") or "").strip()
    domain_normalized = str(domain.get("domain_normalized") or "").strip()
    if not token or not domain_normalized:
        raise HTTPException(status_code=400, detail="verification_challenge_missing")

    result = await verify_dns_txt(domain=domain_normalized, expected_token=token)
    attempt_count = int(domain.get("verification_attempt_count") or 0) + 1
    now = datetime.now().astimezone()
    updates: dict[str, Any] = {
        "verification_last_attempt_at": now.isoformat(),
        "verification_attempt_count": attempt_count,
        "verification_error_code": result.error_code,
        "verification_error_message": result.error_message,
    }
    if result.verified:
        updates.update(
            {
                "verification_status": "verified",
                "verified_at": now.isoformat(),
                "active": True,
            }
        )
        message = "Dominio verificado y activado."
    else:
        updates.update({"verification_status": "pending", "active": False})
        message = result.error_message or "No se pudo verificar el dominio."

    try:
        updated = await repo.update_web_tracking_domain(
            organizacion_id=context.organizacion_id,
            domain_id=domain_id,
            updates=updates,
        )
    except CRMRepositoryError as exc:
        raise _tracking_http_error(exc) from exc
    if not updated:
        raise HTTPException(status_code=404, detail="web_tracking_domain_not_found")
    return TenantWebTrackingVerificationResult(
        verified=result.verified,
        verification_status=updated.get("verification_status", "pending"),
        error_code=result.error_code,
        message=message,
        domain=TenantWebTrackingDomain.model_validate(updated),
    )


@router.patch("/me/web-tracking/domains/{domain_id}", response_model=TenantWebTrackingDomain)
async def update_tenant_web_tracking_domain(
    domain_id: UUID,
    payload: TenantWebTrackingDomainUpdateRequest,
    context: TenantContext = Depends(require_tenant_context),
    user_token: str = Depends(require_user_token),
) -> TenantWebTrackingDomain:
    await require_permission(user_token, "settings.manage")
    repo = CRMRepository(user_token=user_token)
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="nothing_to_update")
    try:
        row = await repo.update_web_tracking_domain(
            organizacion_id=context.organizacion_id,
            domain_id=domain_id,
            updates=payload.model_dump(),
        )
    except CRMRepositoryError as exc:
        raise _tracking_http_error(exc) from exc
    if not row:
        raise HTTPException(status_code=404, detail="web_tracking_domain_not_found")
    return TenantWebTrackingDomain.model_validate(row)


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

    report = build_validation_report(
        organizacion_id=context.organizacion_id,
        config=config,
        routes=routes,
        secrets=secrets,
        scope=payload.scope,
    )
    scope_labels = {
        "webchat": "Webchat",
        "calendar": "Agenda",
        "mail": "Correo",
        "twilio": "Telefonía",
        "whatsapp": "WhatsApp",
        "messenger": "Messenger",
        "busqueda": "Búsquedas",
        "full": "la configuración general",
    }
    label = scope_labels[payload.scope]
    if report.missing_routes:
        report.missing_routes = [f"Activa o configura el canal de {label}."]
    if report.missing_config:
        report.missing_config = [f"Completa los datos necesarios para {label}."]
    if report.missing_secrets:
        report.missing_secrets = [f"Completa la conexión segura necesaria para {label}."]
    if report.notes:
        report.notes = [f"Revisa los datos pendientes de {label}."]
    return report
