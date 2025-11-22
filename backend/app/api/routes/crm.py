"""Endpoints del CRM multi-tenant construidos sobre Supabase."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator

from app.core.logging import get_logger
from app.repositories.crm import CRMRepository, CRMRepositoryError

router = APIRouter(prefix="/crm", tags=["crm"])
logger = get_logger(__name__)


class CRMAccount(BaseModel):
    """Representación pública de una cuenta."""

    id: UUID
    organizacion_id: UUID
    nombre: str
    alias: str | None = None
    tipo: str | None = None
    industria: str | None = None
    tamano: str | None = Field(default=None, alias="tamano")
    sitio_web: str | None = None
    telefono: str | None = None
    correo: str | None = None
    direccion: dict | None = Field(default=None)
    propietario_usuario_id: UUID | None = None
    metadata: dict | None = None
    creado_en: str
    actualizado_en: str

    model_config = {"populate_by_name": True}


class CRMAccountCreate(BaseModel):
    """Campos disponibles para crear una cuenta."""

    nombre: str = Field(..., max_length=255)
    alias: str | None = Field(default=None, max_length=255)
    tipo: str | None = Field(default=None, max_length=120)
    industria: str | None = Field(default=None, max_length=120)
    tamano: str | None = Field(default=None, max_length=120)
    sitio_web: str | None = Field(default=None, max_length=255)
    telefono: str | None = Field(default=None, max_length=64)
    correo: str | None = Field(default=None, max_length=320)
    direccion: dict | None = Field(default=None)
    propietario_usuario_id: UUID | None = None
    metadata: dict | None = Field(default_factory=dict)


class CRMAccountsResponse(BaseModel):
    """Respuesta paginada simple para cuentas."""

    items: list[CRMAccount]
    limit: int
    offset: int


def get_repository() -> CRMRepository:
    try:
        return CRMRepository()
    except CRMRepositoryError as exc:  # pragma: no cover - falla de config
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def require_organizacion_id(
    x_organizacion_id: Annotated[str, Header(alias="X-Organizacion-Id")],
) -> UUID:
    try:
        return UUID(x_organizacion_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Encabezado X-Organizacion-Id inválido",
        ) from exc


def optional_usuario_id(
    x_usuario_id: Annotated[str | None, Header(alias="X-Usuario-Id")] = None,
) -> UUID | None:
    if x_usuario_id is None:
        return None
    try:
        return UUID(x_usuario_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Encabezado X-Usuario-Id inválido",
        ) from exc


class CRMPipelineStage(BaseModel):
    id: UUID
    organizacion_id: UUID
    codigo: str
    nombre: str
    orden: int
    probabilidad: float | None = None
    categoria: str
    metadata: dict | None = None
    creado_en: str
    actualizado_en: str


class CRMOpportunity(BaseModel):
    id: UUID
    organizacion_id: UUID
    cuenta_id: UUID | None = None
    contacto_principal_id: UUID | None = None
    etapa_id: UUID
    titulo: str
    descripcion: str | None = None
    monto_estimado: float | None = None
    moneda: str
    probabilidad: float | None = None
    fecha_cierre_probable: str | None = None
    estado: str
    motivo_perdida: str | None = None
    propietario_usuario_id: UUID | None = None
    asignado_a_usuario_id: UUID | None = None
    metadata: dict | None = None
    creado_en: str
    actualizado_en: str
    cerrado_en: str | None = None


class CRMOpportunityCreate(BaseModel):
    cuenta_id: UUID | None = None
    contacto_principal_id: UUID | None = None
    etapa_id: UUID
    titulo: str = Field(..., max_length=255)
    descripcion: str | None = Field(default=None, max_length=1000)
    monto_estimado: float | None = Field(default=None, ge=0)
    moneda: str = Field(default="MXN", min_length=3, max_length=3)
    probabilidad: float | None = Field(default=None, ge=0, le=100)
    fecha_cierre_probable: str | None = None
    estado: str = Field(default="abierta")
    propietario_usuario_id: UUID | None = None
    asignado_a_usuario_id: UUID | None = None
    metadata: dict | None = Field(default_factory=dict)

    @field_validator("moneda")
    @classmethod
    def moneda_upper(cls, value: str) -> str:
        return value.upper()


class CRMOpportunitiesResponse(BaseModel):
    items: list[CRMOpportunity]
    limit: int
    offset: int


@router.get("/cuentas", response_model=CRMAccountsResponse)
async def list_accounts(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CRMAccountsResponse:
    try:
        rows = await repo.list_accounts(
            organizacion_id=organizacion_id,
            limit=limit,
            offset=offset,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    items = [CRMAccount.model_validate(row) for row in rows]
    return CRMAccountsResponse(items=items, limit=limit, offset=offset)


@router.post("/cuentas", response_model=CRMAccount, status_code=status.HTTP_201_CREATED)
async def create_account(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMAccountCreate,
) -> CRMAccount:
    try:
        row = await repo.create_account(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMAccount.model_validate(row)


@router.get("/cuentas/{cuenta_id}", response_model=CRMAccount)
async def get_account(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    cuenta_id: UUID,
) -> CRMAccount:
    try:
        row = await repo.get_account(organizacion_id=organizacion_id, account_id=cuenta_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="cuenta_no_encontrada")
    return CRMAccount.model_validate(row)


@router.get("/etapas", response_model=list[CRMPipelineStage])
async def list_pipeline_stages(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
) -> list[CRMPipelineStage]:
    try:
        rows = await repo.list_pipelines(organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMPipelineStage.model_validate(row) for row in rows]


@router.get("/oportunidades", response_model=CRMOpportunitiesResponse)
async def list_opportunities(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CRMOpportunitiesResponse:
    try:
        rows = await repo.list_opportunities(
            organizacion_id=organizacion_id,
            limit=limit,
            offset=offset,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    items = [CRMOpportunity.model_validate(row) for row in rows]
    return CRMOpportunitiesResponse(items=items, limit=limit, offset=offset)


@router.post(
    "/oportunidades",
    response_model=CRMOpportunity,
    status_code=status.HTTP_201_CREATED,
)
async def create_opportunity(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    payload: CRMOpportunityCreate,
) -> CRMOpportunity:
    body = payload.model_dump(exclude_unset=True)
    try:
        row = await repo.create_opportunity(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Registrar historial de etapa inicial (best-effort)
    if payload.etapa_id:
        history_payload: dict[str, str] = {
            "oportunidad_id": str(row["id"]),
            "etapa_destino_id": str(payload.etapa_id),
            "fuente": "api",
        }
        if usuario_id:
            history_payload["cambiado_por_usuario_id"] = str(usuario_id)
        try:
            await repo.append_stage_history(
                organizacion_id=organizacion_id,
                payload=history_payload,
            )
        except CRMRepositoryError as exc:  # pragma: no cover - no debe frenar creación
            logger.warning("crm.historial_no_registrado", extra={"error": str(exc)})

    return CRMOpportunity.model_validate(row)


@router.get("/oportunidades/{oportunidad_id}", response_model=CRMOpportunity)
async def get_opportunity(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    oportunidad_id: UUID,
) -> CRMOpportunity:
    try:
        row = await repo.get_opportunity(
            organizacion_id=organizacion_id, opportunity_id=oportunidad_id
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="oportunidad_no_encontrada"
        )
    return CRMOpportunity.model_validate(row)
