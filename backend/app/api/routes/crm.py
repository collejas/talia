"""Endpoints del CRM multi-tenant construidos sobre Supabase."""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
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


class CRMOpportunityUpdate(BaseModel):
    cuenta_id: UUID | None = None
    contacto_principal_id: UUID | None = None
    etapa_id: UUID | None = None
    titulo: str | None = Field(default=None, max_length=255)
    descripcion: str | None = Field(default=None, max_length=1000)
    monto_estimado: float | None = Field(default=None, ge=0)
    moneda: str | None = Field(default=None, min_length=3, max_length=3)
    probabilidad: float | None = Field(default=None, ge=0, le=100)
    fecha_cierre_probable: str | None = None
    estado: str | None = None
    motivo_perdida: str | None = None
    propietario_usuario_id: UUID | None = None
    asignado_a_usuario_id: UUID | None = None
    metadata: dict | None = Field(default=None)


class CRMOpportunitiesResponse(BaseModel):
    items: list[CRMOpportunity]
    limit: int
    offset: int


class CRMContact(BaseModel):
    id: UUID
    organizacion_id: UUID
    nombre_completo: str | None = None
    correo: str | None = None
    telefono_e164: str | None = None
    company_name: str | None = None
    notes: str | None = None
    necesidad_proposito: str | None = None
    estado: str | None = None
    metadata: dict[str, Any] | None = None
    actualizado_en: datetime | None = None


class CRMContactUpdate(BaseModel):
    nombre_completo: str | None = Field(default=None, max_length=160)
    correo: str | None = Field(default=None, max_length=255)
    telefono_e164: str | None = Field(default=None, max_length=32)
    company_name: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=2000)
    necesidad_proposito: str | None = Field(default=None, max_length=2000)
    estado: str | None = Field(default=None, max_length=80)


class CRMContactSearchItem(BaseModel):
    id: UUID
    nombre: str | None = None
    correo: str | None = None
    telefono: str | None = None
    empresa: str | None = None


class CRMContactSearchResponse(BaseModel):
    items: list[CRMContactSearchItem]
    limit: int
    offset: int


class CRMActivity(BaseModel):
    id: UUID
    organizacion_id: UUID
    tipo: str
    canal: str | None = None
    asunto: str | None = None
    descripcion: str | None = None
    estado: str
    prioridad: str
    fecha_vencimiento: datetime | None = None
    inicio_en: datetime | None = None
    fin_en: datetime | None = None
    sla_horas: int | None = None
    recordatorio_en: datetime | None = None
    cuenta_id: UUID | None = None
    contacto_id: UUID | None = None
    oportunidad_id: UUID | None = None
    creado_por_usuario_id: UUID | None = None
    asignado_a_usuario_id: UUID | None = None
    metadata: dict | None = None
    creado_en: datetime
    actualizado_en: datetime


class CRMActivityCreate(BaseModel):
    tipo: str = Field(..., max_length=50)
    canal: str | None = Field(default=None, max_length=50)
    asunto: str | None = Field(default=None, max_length=255)
    descripcion: str | None = Field(default=None, max_length=4000)
    estado: str = Field(default="pendiente")
    prioridad: str = Field(default="media")
    fecha_vencimiento: datetime | None = None
    inicio_en: datetime | None = None
    fin_en: datetime | None = None
    sla_horas: int | None = Field(default=None, ge=0)
    recordatorio_en: datetime | None = None
    cuenta_id: UUID | None = None
    contacto_id: UUID | None = None
    oportunidad_id: UUID | None = None
    creado_por_usuario_id: UUID | None = None
    asignado_a_usuario_id: UUID | None = None
    metadata: dict | None = Field(default_factory=dict)


class CRMActivitiesResponse(BaseModel):
    items: list[CRMActivity]
    limit: int
    offset: int


class CRMTicket(BaseModel):
    id: UUID
    organizacion_id: UUID
    cuenta_id: UUID | None = None
    contacto_id: UUID | None = None
    asunto: str
    descripcion: str | None = None
    estado: str
    prioridad: str
    canal_origen: str | None = None
    asignado_a_usuario_id: UUID | None = None
    metadata: dict | None = None
    creado_en: datetime
    actualizado_en: datetime
    cerrado_en: datetime | None = None


class CRMTicketCreate(BaseModel):
    asunto: str = Field(..., max_length=255)
    descripcion: str | None = Field(default=None, max_length=4000)
    estado: str = Field(default="abierto")
    prioridad: str = Field(default="media")
    canal_origen: str | None = Field(default=None, max_length=50)
    cuenta_id: UUID | None = None
    contacto_id: UUID | None = None
    asignado_a_usuario_id: UUID | None = None
    metadata: dict | None = Field(default_factory=dict)


class CRMTicketsResponse(BaseModel):
    items: list[CRMTicket]
    limit: int
    offset: int


class CRMTicketComment(BaseModel):
    id: UUID
    organizacion_id: UUID
    ticket_id: UUID
    autor_usuario_id: UUID | None = None
    autor_cliente_id: UUID | None = None
    mensaje: str
    metadata: dict | None = None
    creado_en: datetime


class CRMTicketCommentCreate(BaseModel):
    ticket_id: UUID
    mensaje: str = Field(..., max_length=4000)
    autor_usuario_id: UUID | None = None
    autor_cliente_id: UUID | None = None
    metadata: dict | None = Field(default_factory=dict)


class CRMFile(BaseModel):
    id: UUID
    organizacion_id: UUID
    relacion_tipo: str
    relacion_id: UUID
    nombre_original: str
    content_type: str | None = None
    tamano_bytes: int | None = None
    storage_path: str
    metadata: dict | None = None
    subido_por_usuario_id: UUID | None = None
    subido_en: datetime


class CRMFileCreate(BaseModel):
    relacion_tipo: str = Field(..., max_length=100)
    relacion_id: UUID
    nombre_original: str = Field(..., max_length=255)
    content_type: str | None = Field(default=None, max_length=120)
    tamano_bytes: int | None = Field(default=None, ge=0)
    storage_path: str = Field(..., max_length=500)
    metadata: dict | None = Field(default_factory=dict)
    subido_por_usuario_id: UUID | None = None


class CRMTag(BaseModel):
    id: UUID
    organizacion_id: UUID
    nombre: str
    color: str | None = None
    creado_en: datetime


class CRMTagCreate(BaseModel):
    nombre: str = Field(..., max_length=120)
    color: str | None = Field(default=None, max_length=20)


class CRMTagging(BaseModel):
    id: UUID
    organizacion_id: UUID
    tag_id: UUID
    relacion_tipo: str
    relacion_id: UUID
    creado_en: datetime


class CRMTaggingCreate(BaseModel):
    tag_id: UUID
    relacion_tipo: str = Field(..., max_length=100)
    relacion_id: UUID


class CRMProduct(BaseModel):
    id: UUID
    organizacion_id: UUID
    codigo: str
    nombre: str
    descripcion: str | None = None
    precio_base: float | None = None
    moneda: str
    activo: bool
    metadata: dict | None = None
    creado_en: datetime
    actualizado_en: datetime


class CRMProductCreate(BaseModel):
    codigo: str = Field(..., max_length=120)
    nombre: str = Field(..., max_length=255)
    descripcion: str | None = Field(default=None, max_length=1000)
    precio_base: float | None = Field(default=None, ge=0)
    moneda: str = Field(default="MXN", min_length=3, max_length=3)
    activo: bool = True
    metadata: dict | None = Field(default_factory=dict)

    @field_validator("moneda")
    @classmethod
    def uppercase_currency(cls, value: str) -> str:
        return value.upper()


class CRMQuote(BaseModel):
    id: UUID
    organizacion_id: UUID
    oportunidad_id: UUID | None = None
    cuenta_id: UUID | None = None
    contacto_id: UUID | None = None
    estatus: str
    total: float | None = None
    moneda: str
    valida_hasta: date | None = None
    creada_por_usuario_id: UUID | None = None
    metadata: dict | None = None
    creado_en: datetime
    actualizado_en: datetime


class CRMQuoteCreate(BaseModel):
    oportunidad_id: UUID | None = None
    cuenta_id: UUID | None = None
    contacto_id: UUID | None = None
    estatus: str = Field(default="borrador")
    total: float | None = Field(default=None, ge=0)
    moneda: str = Field(default="MXN", min_length=3, max_length=3)
    valida_hasta: date | None = None
    metadata: dict | None = Field(default_factory=dict)

    @field_validator("moneda")
    @classmethod
    def uppercase_currency(cls, value: str) -> str:
        return value.upper()


class CRMQuoteItem(BaseModel):
    id: UUID
    cotizacion_id: UUID
    producto_id: UUID | None = None
    descripcion: str
    cantidad: float
    precio_unitario: float | None = None
    descuento_porcentaje: float | None = None
    subtotal: float | None = None
    metadata: dict | None = None


class CRMQuoteItemCreate(BaseModel):
    cotizacion_id: UUID
    producto_id: UUID | None = None
    descripcion: str = Field(..., max_length=500)
    cantidad: float = Field(default=1, gt=0)
    precio_unitario: float | None = Field(default=None, ge=0)
    descuento_porcentaje: float | None = Field(default=None, ge=0, le=100)
    subtotal: float | None = Field(default=None, ge=0)
    metadata: dict | None = Field(default_factory=dict)


class CRMCampaign(BaseModel):
    id: UUID
    organizacion_id: UUID
    nombre: str
    tipo: str | None = None
    canal: str | None = None
    presupuesto: float | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    metadata: dict | None = None
    creado_en: datetime
    actualizado_en: datetime


class CRMCampaignCreate(BaseModel):
    nombre: str = Field(..., max_length=255)
    tipo: str | None = Field(default=None, max_length=120)
    canal: str | None = Field(default=None, max_length=120)
    presupuesto: float | None = Field(default=None, ge=0)
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    metadata: dict | None = Field(default_factory=dict)


class CRMLead(BaseModel):
    id: UUID
    organizacion_id: UUID
    campana_id: UUID | None = None
    contacto_id: UUID | None = None
    cuenta_id: UUID | None = None
    origen: str | None = None
    estado: str
    metadata: dict | None = None
    creado_en: datetime
    actualizado_en: datetime


class CRMLeadCreate(BaseModel):
    campana_id: UUID | None = None
    contacto_id: UUID | None = None
    cuenta_id: UUID | None = None
    origen: str | None = Field(default=None, max_length=120)
    estado: str = Field(default="nuevo")
    metadata: dict | None = Field(default_factory=dict)


class CRMLeadEvent(BaseModel):
    id: UUID
    lead_id: UUID
    tipo: str
    metadata: dict | None = None
    registrado_en: datetime


class CRMLeadEventCreate(BaseModel):
    lead_id: UUID
    tipo: str = Field(..., max_length=120)
    metadata: dict | None = Field(default_factory=dict)


class CRMPipelineTopSeller(BaseModel):
    id: UUID | None = None
    nombre: str | None = None
    total: int = 0


class CRMPipelineCards(BaseModel):
    total: int = 0
    abiertas: int = 0
    ganadas: int = 0
    perdidas: int = 0
    nuevas: int = 0
    monto_total: float = 0
    top_vendedor: CRMPipelineTopSeller | None = None


class CRMPipelineChartPoint(BaseModel):
    date: str
    nuevos: int = 0
    ganados: int = 0
    perdidos: int = 0


class CRMPipelineTableRow(BaseModel):
    id: int
    header: str
    type: str
    status: str
    target: str
    limit: str
    reviewer: str
    raw: dict[str, Any] | None = None


class CRMPipelineOverview(BaseModel):
    cards: CRMPipelineCards
    chart: list[CRMPipelineChartPoint]
    table: list[CRMPipelineTableRow]
    total_rows: int


class CRMPipelineBoardCard(BaseModel):
    tarjeta_id: UUID
    contacto_id: UUID | None = None
    conversacion_id: UUID | None = None
    nombre: str
    correo: str | None = None
    telefono: str | None = None
    empresa: str | None = None
    notas: str | None = None
    necesidad_proposito: str | None = None
    canal: str | None = None
    estado: str | None = None
    etapa_id: UUID
    etapa_nombre: str
    monto: float | None = None
    moneda: str | None = None
    probabilidad: float | None = None
    proyecto_nombre: str | None = None
    proyecto_necesidades: str | None = None
    asignado_id: UUID | None = None
    asignado_nombre: str | None = None
    prioridad: float | None = None
    actualizado_en: datetime | None = None
    etiquetas: list[str] | None = None
    metadata: dict[str, Any] | None = None


class CRMPipelineBoardStage(BaseModel):
    id: UUID
    nombre: str
    codigo: str
    categoria: str
    orden: int
    tablero_id: str | None = None
    metadatos: dict[str, Any]
    tarjetas: list[CRMPipelineBoardCard]


class CRMPipelineBoard(BaseModel):
    stages: list[CRMPipelineBoardStage]
    sin_conversacion: list[CRMPipelineBoardCard]
    visitantes_sin_chat: int = 0


class CRMPipelineCardResponse(BaseModel):
    stage: CRMPipelineBoardStage
    card: CRMPipelineBoardCard


class CRMPipelineOpportunityPatch(CRMOpportunityUpdate):
    expected_etapa_id: UUID | None = None
    motivo: str | None = None
    fuente: str | None = Field(default=None, max_length=50)


class CRMNote(BaseModel):
    id: UUID
    organizacion_id: UUID
    relacion_tipo: str
    relacion_id: UUID
    texto: str
    visible_para_cliente: bool
    tipo: str
    creado_por_usuario_id: UUID | None = None
    creado_en: datetime
    actualizado_en: datetime


class CRMNoteCreate(BaseModel):
    relacion_tipo: str = Field(..., max_length=100)
    relacion_id: UUID
    texto: str = Field(..., max_length=4000)
    visible_para_cliente: bool = False
    tipo: str = Field(default="interna", max_length=50)
    creado_por_usuario_id: UUID | None = None


class CRMAuditLog(BaseModel):
    id: UUID
    organizacion_id: UUID
    usuario_id: UUID | None = None
    accion: str
    tabla: str
    registro_id: UUID | None = None
    cambios: dict | None = None
    ip: str | None = None
    user_agent: str | None = None
    creado_en: datetime


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
            payload=payload.model_dump(mode="json", exclude_unset=True),
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
    body = payload.model_dump(mode="json", exclude_unset=True)
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


@router.post(
    "/pipeline/opportunities",
    response_model=CRMPipelineCardResponse,
    status_code=status.HTTP_201_CREATED,
)
async def pipeline_create_opportunity(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMOpportunityCreate,
) -> CRMPipelineCardResponse:
    try:
        row = await repo.create_opportunity(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    opportunity_id = row.get("id")
    if not opportunity_id:
        raise HTTPException(status_code=502, detail="opportunity_create_without_id")
    return await _build_pipeline_card_response(
        repo=repo,
        organizacion_id=organizacion_id,
        oportunidad_id=UUID(str(opportunity_id)),
    )


@router.patch(
    "/pipeline/opportunities/{oportunidad_id}",
    response_model=CRMPipelineCardResponse,
)
async def pipeline_update_opportunity(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    oportunidad_id: UUID,
    payload: CRMPipelineOpportunityPatch,
) -> CRMPipelineCardResponse:
    current = await repo.get_pipeline_opportunity(
        organizacion_id=organizacion_id,
        oportunidad_id=oportunidad_id,
    )
    if current is None:
        raise HTTPException(status_code=404, detail="opportunity_not_found")
    current_stage = _safe_uuid(current.get("etapa_id"))
    if payload.expected_etapa_id and current_stage and payload.expected_etapa_id != current_stage:
        raise HTTPException(status_code=409, detail="opportunity_stage_conflict")
    update_body = payload.model_dump(
        mode="json",
        exclude_none=True,
        exclude={"expected_etapa_id", "motivo", "fuente"},
    )
    if "metadata" in update_body:
        current_metadata = _ensure_dict(current.get("metadata"), default={})
        new_metadata = _ensure_dict(update_body.get("metadata"), default={})
        merged_metadata = {**current_metadata, **new_metadata}
        update_body["metadata"] = merged_metadata
    try:
        await repo.update_opportunity(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
            payload=update_body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if payload.etapa_id and current_stage and payload.etapa_id != current_stage:
        history_payload = {
            "oportunidad_id": str(oportunidad_id),
            "etapa_origen_id": str(current_stage),
            "etapa_destino_id": str(payload.etapa_id),
            "cambiado_por_usuario_id": str(usuario_id) if usuario_id else None,
            "motivo": payload.motivo,
            "fuente": payload.fuente or "humano",
            "metadata": payload.metadata or {},
        }
        await repo.append_stage_history(
            organizacion_id=organizacion_id,
            payload={k: v for k, v in history_payload.items() if v is not None},
        )
    return await _build_pipeline_card_response(
        repo=repo,
        organizacion_id=organizacion_id,
        oportunidad_id=oportunidad_id,
    )


@router.delete(
    "/pipeline/opportunities/{oportunidad_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def pipeline_delete_opportunity(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    oportunidad_id: UUID,
) -> Response:
    try:
        await repo.delete_opportunity(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/pipeline/cards/{oportunidad_id}",
    response_model=CRMPipelineCardResponse,
)
async def pipeline_get_card(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    oportunidad_id: UUID,
) -> CRMPipelineCardResponse:
    return await _build_pipeline_card_response(
        repo=repo,
        organizacion_id=organizacion_id,
        oportunidad_id=oportunidad_id,
    )


@router.get("/contacts/search", response_model=CRMContactSearchResponse)
async def search_contacts(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    query: Annotated[str, Query(min_length=2, alias="q")],
    limit: Annotated[int, Query(ge=1, le=25)] = 8,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CRMContactSearchResponse:
    rows = await repo.search_contacts(
        organizacion_id=organizacion_id,
        query=query,
        limit=limit,
        offset=offset,
    )
    items: list[CRMContactSearchItem] = []
    for row in rows:
        contacto_id = _safe_uuid(row.get("id"))
        if not contacto_id:
            continue
        items.append(
            CRMContactSearchItem(
                id=contacto_id,
                nombre=row.get("nombre_completo"),
                correo=row.get("correo"),
                telefono=row.get("telefono_e164"),
                empresa=row.get("company_name"),
            )
        )
    return CRMContactSearchResponse(items=items, limit=limit, offset=offset)


@router.patch(
    "/contacts/{contacto_id}",
    response_model=CRMContact,
)
async def update_contact(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    contacto_id: UUID,
    payload: CRMContactUpdate,
) -> CRMContact:
    body = payload.model_dump(mode="json", exclude_unset=True)
    try:
        row = await repo.update_contact(
            organizacion_id=organizacion_id,
            contacto_id=contacto_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        if "contacto_no_encontrado" in str(exc):
            raise HTTPException(status_code=404, detail="contacto_no_encontrado") from exc
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMContact.model_validate(row)


@router.get("/actividades", response_model=CRMActivitiesResponse)
async def list_activities(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    oportunidad_id: UUID | None = Query(default=None),
    cuenta_id: UUID | None = Query(default=None),
    contacto_id: UUID | None = Query(default=None),
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CRMActivitiesResponse:
    try:
        rows = await repo.list_activities(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
            cuenta_id=cuenta_id,
            contacto_id=contacto_id,
            limit=limit,
            offset=offset,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    items = [CRMActivity.model_validate(row) for row in rows]
    return CRMActivitiesResponse(items=items, limit=limit, offset=offset)


@router.post("/actividades", response_model=CRMActivity, status_code=status.HTTP_201_CREATED)
async def create_activity(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    payload: CRMActivityCreate,
) -> CRMActivity:
    body = payload.model_dump(mode="json", exclude_unset=True)
    if "creado_por_usuario_id" not in body and usuario_id:
        body["creado_por_usuario_id"] = str(usuario_id)
    try:
        row = await repo.create_activity(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMActivity.model_validate(row)


@router.get("/actividades/{actividad_id}", response_model=CRMActivity)
async def get_activity(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    actividad_id: UUID,
) -> CRMActivity:
    try:
        row = await repo.get_activity(organizacion_id=organizacion_id, activity_id=actividad_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="actividad_no_encontrada")
    return CRMActivity.model_validate(row)


@router.get("/tickets", response_model=CRMTicketsResponse)
async def list_tickets(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    estado: str | None = Query(default=None),
    prioridad: str | None = Query(default=None),
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CRMTicketsResponse:
    try:
        rows = await repo.list_tickets(
            organizacion_id=organizacion_id,
            estado=estado,
            prioridad=prioridad,
            limit=limit,
            offset=offset,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    items = [CRMTicket.model_validate(row) for row in rows]
    return CRMTicketsResponse(items=items, limit=limit, offset=offset)


@router.post("/tickets", response_model=CRMTicket, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMTicketCreate,
) -> CRMTicket:
    body = payload.model_dump(mode="json", exclude_unset=True)
    try:
        row = await repo.create_ticket(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMTicket.model_validate(row)


@router.get("/tickets/{ticket_id}", response_model=CRMTicket)
async def get_ticket(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    ticket_id: UUID,
) -> CRMTicket:
    try:
        row = await repo.get_ticket(organizacion_id=organizacion_id, ticket_id=ticket_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ticket_no_encontrado")
    return CRMTicket.model_validate(row)


@router.get(
    "/tickets/{ticket_id}/comentarios",
    response_model=list[CRMTicketComment],
)
async def list_ticket_comments(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    ticket_id: UUID,
) -> list[CRMTicketComment]:
    try:
        rows = await repo.list_ticket_comments(
            organizacion_id=organizacion_id,
            ticket_id=ticket_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMTicketComment.model_validate(row) for row in rows]


@router.post(
    "/tickets/{ticket_id}/comentarios",
    response_model=CRMTicketComment,
    status_code=status.HTTP_201_CREATED,
)
async def create_ticket_comment(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    ticket_id: UUID,
    payload: CRMTicketCommentCreate,
) -> CRMTicketComment:
    if payload.ticket_id != ticket_id:
        raise HTTPException(status_code=400, detail="ticket_id_mismatch")
    body = payload.model_dump(mode="json", exclude_unset=True)
    if not body.get("autor_usuario_id") and usuario_id:
        body["autor_usuario_id"] = str(usuario_id)
    try:
        row = await repo.create_ticket_comment(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMTicketComment.model_validate(row)


@router.get("/archivos", response_model=list[CRMFile])
async def list_files(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    relacion_tipo: str | None = Query(default=None),
    relacion_id: UUID | None = Query(default=None),
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[CRMFile]:
    try:
        rows = await repo.list_files(
            organizacion_id=organizacion_id,
            relacion_tipo=relacion_tipo,
            relacion_id=relacion_id,
            limit=limit,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMFile.model_validate(row) for row in rows]


@router.post("/archivos", response_model=CRMFile, status_code=status.HTTP_201_CREATED)
async def create_file(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    payload: CRMFileCreate,
) -> CRMFile:
    body = payload.model_dump(mode="json", exclude_unset=True)
    if not body.get("subido_por_usuario_id") and usuario_id:
        body["subido_por_usuario_id"] = str(usuario_id)
    try:
        row = await repo.create_file(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMFile.model_validate(row)


@router.get("/tags", response_model=list[CRMTag])
async def list_tags(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
) -> list[CRMTag]:
    try:
        rows = await repo.list_tags(organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMTag.model_validate(row) for row in rows]


@router.post("/tags", response_model=CRMTag, status_code=status.HTTP_201_CREATED)
async def create_tag(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMTagCreate,
) -> CRMTag:
    try:
        row = await repo.create_tag(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMTag.model_validate(row)


@router.post("/taggings", response_model=CRMTagging, status_code=status.HTTP_201_CREATED)
async def create_tagging(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMTaggingCreate,
) -> CRMTagging:
    try:
        row = await repo.create_tagging(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMTagging.model_validate(row)


@router.delete(
    "/taggings/{tagging_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_tagging(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    tagging_id: UUID,
) -> Response:
    try:
        await repo.delete_tagging(organizacion_id=organizacion_id, tagging_id=tagging_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/productos", response_model=list[CRMProduct])
async def list_products(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    activos: bool | None = Query(default=None),
) -> list[CRMProduct]:
    try:
        rows = await repo.list_products(organizacion_id=organizacion_id, activos=activos)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMProduct.model_validate(row) for row in rows]


@router.post("/productos", response_model=CRMProduct, status_code=status.HTTP_201_CREATED)
async def create_product(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMProductCreate,
) -> CRMProduct:
    try:
        row = await repo.create_product(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMProduct.model_validate(row)


@router.get("/cotizaciones", response_model=list[CRMQuote])
async def list_quotes(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    oportunidad_id: UUID | None = Query(default=None),
) -> list[CRMQuote]:
    try:
        rows = await repo.list_quotes(
            organizacion_id=organizacion_id,
            oportunidad_id=oportunidad_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMQuote.model_validate(row) for row in rows]


@router.post("/cotizaciones", response_model=CRMQuote, status_code=status.HTTP_201_CREATED)
async def create_quote(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    payload: CRMQuoteCreate,
) -> CRMQuote:
    body = payload.model_dump(mode="json", exclude_unset=True)
    if not body.get("creada_por_usuario_id") and usuario_id:
        body["creada_por_usuario_id"] = str(usuario_id)
    try:
        row = await repo.create_quote(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMQuote.model_validate(row)


@router.get("/cotizaciones/{cotizacion_id}/items", response_model=list[CRMQuoteItem])
async def list_quote_items(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    cotizacion_id: UUID,
) -> list[CRMQuoteItem]:
    try:
        rows = await repo.list_quote_items(
            organizacion_id=organizacion_id,
            cotizacion_id=cotizacion_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMQuoteItem.model_validate(row) for row in rows]


@router.post(
    "/cotizaciones/{cotizacion_id}/items",
    response_model=CRMQuoteItem,
    status_code=status.HTTP_201_CREATED,
)
async def create_quote_item(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    cotizacion_id: UUID,
    payload: CRMQuoteItemCreate,
) -> CRMQuoteItem:
    if payload.cotizacion_id != cotizacion_id:
        raise HTTPException(status_code=400, detail="cotizacion_id_mismatch")
    try:
        row = await repo.add_quote_item(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMQuoteItem.model_validate(row)


@router.get("/campanas", response_model=list[CRMCampaign])
async def list_campaigns(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
) -> list[CRMCampaign]:
    try:
        rows = await repo.list_campaigns(organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMCampaign.model_validate(row) for row in rows]


@router.post("/campanas", response_model=CRMCampaign, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMCampaignCreate,
) -> CRMCampaign:
    try:
        row = await repo.create_campaign(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMCampaign.model_validate(row)


@router.get("/leads", response_model=list[CRMLead])
async def list_leads(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    estado: str | None = Query(default=None),
) -> list[CRMLead]:
    try:
        rows = await repo.list_leads(organizacion_id=organizacion_id, estado=estado)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMLead.model_validate(row) for row in rows]


@router.post("/leads", response_model=CRMLead, status_code=status.HTTP_201_CREATED)
async def create_lead(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    payload: CRMLeadCreate,
) -> CRMLead:
    try:
        row = await repo.create_lead(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMLead.model_validate(row)


@router.get("/leads/{lead_id}/eventos", response_model=list[CRMLeadEvent])
async def list_lead_events(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    lead_id: UUID,
) -> list[CRMLeadEvent]:
    try:
        rows = await repo.list_lead_events(
            organizacion_id=organizacion_id,
            lead_id=lead_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMLeadEvent.model_validate(row) for row in rows]


@router.post(
    "/leads/{lead_id}/eventos",
    response_model=CRMLeadEvent,
    status_code=status.HTTP_201_CREATED,
)
async def create_lead_event(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    lead_id: UUID,
    payload: CRMLeadEventCreate,
) -> CRMLeadEvent:
    if payload.lead_id != lead_id:
        raise HTTPException(status_code=400, detail="lead_id_mismatch")
    try:
        row = await repo.create_lead_event(
            organizacion_id=organizacion_id,
            payload=payload.model_dump(mode="json", exclude_unset=True),
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMLeadEvent.model_validate(row)


@router.get("/notas", response_model=list[CRMNote])
async def list_notes(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    relacion_tipo: str | None = Query(default=None),
    relacion_id: UUID | None = Query(default=None),
) -> list[CRMNote]:
    try:
        rows = await repo.list_notes(
            organizacion_id=organizacion_id,
            relacion_tipo=relacion_tipo,
            relacion_id=relacion_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMNote.model_validate(row) for row in rows]


@router.post("/notas", response_model=CRMNote, status_code=status.HTTP_201_CREATED)
async def create_note(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    usuario_id: UUID | None = Depends(optional_usuario_id),
    payload: CRMNoteCreate,
) -> CRMNote:
    body = payload.model_dump(mode="json", exclude_unset=True)
    if not body.get("creado_por_usuario_id") and usuario_id:
        body["creado_por_usuario_id"] = str(usuario_id)
    try:
        row = await repo.create_note(
            organizacion_id=organizacion_id,
            payload=body,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CRMNote.model_validate(row)


@router.get("/audit_logs", response_model=list[CRMAuditLog])
async def list_audit_logs(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
) -> list[CRMAuditLog]:
    try:
        rows = await repo.list_audit_logs(organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [CRMAuditLog.model_validate(row) for row in rows]


@router.get("/pipeline/overview", response_model=CRMPipelineOverview)
async def pipeline_overview(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    limit: Annotated[int, Query(ge=10, le=500)] = 200,
    days: Annotated[int, Query(ge=7, le=90)] = 30,
) -> CRMPipelineOverview:
    created_from = datetime.now(timezone.utc) - timedelta(days=days)
    fetch_limit = max(limit, 500)
    try:
        rows, total_rows = await repo.list_pipeline_opportunities(
            organizacion_id=organizacion_id,
            limit=fetch_limit,
            created_from=created_from,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    overview = _build_pipeline_overview(rows, total_rows, limit, days)
    return overview


@router.get("/pipeline/board", response_model=CRMPipelineBoard)
async def pipeline_board(
    *,
    repo: CRMRepository = Depends(get_repository),
    organizacion_id: UUID = Depends(require_organizacion_id),
    limit: Annotated[int, Query(ge=50, le=1000)] = 400,
) -> CRMPipelineBoard:
    try:
        stages = await repo.list_pipelines(organizacion_id=organizacion_id)
        rows, _ = await repo.list_pipeline_opportunities(
            organizacion_id=organizacion_id,
            limit=limit,
        )
        visitors = await repo.count_pipeline_visitors(
            closed_after=datetime.now(timezone.utc) - timedelta(days=30)
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    board = _build_pipeline_board(stages, rows)
    return CRMPipelineBoard(
        stages=board.stages,
        sin_conversacion=board.sin_conversacion,
        visitantes_sin_chat=visitors,
    )


def _build_pipeline_overview(
    rows: list[dict[str, Any]],
    total_rows: int,
    table_limit: int,
    days_range: int,
) -> CRMPipelineOverview:
    cards = _build_pipeline_cards(rows)
    chart = _build_pipeline_chart(rows, days_range)
    table = _build_pipeline_table(rows, table_limit)
    return CRMPipelineOverview(cards=cards, chart=chart, table=table, total_rows=total_rows)


def _build_pipeline_cards(rows: list[dict[str, Any]]) -> CRMPipelineCards:
    now = datetime.now(timezone.utc)
    nuevas_threshold = now - timedelta(days=1)
    abiertas = ganadas = perdidas = nuevas = 0
    monto_total = 0.0
    top_counter: Counter[str] = Counter()
    top_names: dict[str, str] = {}

    for row in rows:
        estado = (row.get("estado") or "").lower()
        if estado == "ganada":
            ganadas += 1
        elif estado == "perdida":
            perdidas += 1
        else:
            abiertas += 1
        monto = row.get("monto_estimado")
        if isinstance(monto, (int, float)):
            monto_total += float(monto)
        created_at = _parse_datetime(row.get("creado_en"))
        if created_at and created_at >= nuevas_threshold:
            nuevas += 1
        asignado = row.get("asignado") or {}
        user_id = asignado.get("id") or row.get("asignado_a_usuario_id")
        display_name = asignado.get("nombre_completo") or asignado.get("correo")
        if user_id:
            key = str(user_id)
            top_counter[key] += 1
            if display_name:
                top_names[key] = display_name

    top_vendedor = None
    if top_counter:
        user_key, total = top_counter.most_common(1)[0]
        top_vendedor = CRMPipelineTopSeller(
            id=_safe_uuid(user_key),
            nombre=top_names.get(user_key),
            total=total,
        )

    return CRMPipelineCards(
        total=len(rows),
        abiertas=abiertas,
        ganadas=ganadas,
        perdidas=perdidas,
        nuevas=nuevas,
        monto_total=monto_total,
        top_vendedor=top_vendedor,
    )


def _build_pipeline_chart(
    rows: list[dict[str, Any]], days_range: int
) -> list[CRMPipelineChartPoint]:
    if days_range < 1:
        days_range = 1
    today = datetime.now(timezone.utc).date()
    start_date = today - timedelta(days=days_range - 1)
    buckets: dict[date, CRMPipelineChartPoint] = {}
    for offset in range(days_range):
        bucket_date = start_date + timedelta(days=offset)
        buckets[bucket_date] = CRMPipelineChartPoint(
            date=bucket_date.isoformat(),
            nuevos=0,
            ganados=0,
            perdidos=0,
        )

    for row in rows:
        created_at = _parse_datetime(row.get("creado_en"))
        if created_at:
            bucket = buckets.get(created_at.date())
            if bucket:
                bucket.nuevos += 1
        estado = (row.get("estado") or "").lower()
        cerrado_at = _parse_datetime(row.get("cerrado_en"))
        if not cerrado_at:
            continue
        bucket = buckets.get(cerrado_at.date())
        if not bucket:
            continue
        if estado == "ganada":
            bucket.ganados += 1
        elif estado == "perdida":
            bucket.perdidos += 1

    return [buckets[bucket_date] for bucket_date in sorted(buckets)]


def _build_pipeline_table(
    rows: list[dict[str, Any]], table_limit: int
) -> list[CRMPipelineTableRow]:
    sorted_rows = sorted(
        rows,
        key=lambda r: _parse_datetime(r.get("creado_en"))
        or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    table: list[CRMPipelineTableRow] = []
    for index, row in enumerate(sorted_rows[:table_limit], start=1):
        etapa = row.get("etapa") or {}
        contacto = row.get("contacto") or {}
        asignado = row.get("asignado") or {}
        propietario = row.get("propietario") or {}
        cuenta = row.get("cuenta") or {}
        categoria = (etapa.get("categoria") or row.get("estado") or "abierta").lower()
        cerrado_dt = _parse_datetime(row.get("cerrado_en"))
        monto_estimado = row.get("monto_estimado")
        moneda = row.get("moneda") or "MXN"
        metric_meta = {
            "value": monto_estimado,
            "currency": moneda,
            "formatted": _format_currency(monto_estimado, moneda),
        }
        status_meta = _build_status_meta(categoria, cerrado_dt)
        header = (
            row.get("titulo")
            or contacto.get("nombre_completo")
            or cuenta.get("nombre")
            or "Oportunidad sin nombre"
        )
        reviewer = asignado.get("nombre_completo") or "Sin asignar"
        table.append(
            CRMPipelineTableRow(
                id=index,
                header=header,
                type=etapa.get("nombre") or "Sin etapa",
                status=categoria,
                target=str(monto_estimado or 0),
                limit=contacto.get("correo") or "—",
                reviewer=reviewer,
                raw={
                    "lead_id": row.get("id"),
                    "contacto_id": contacto.get("id"),
                    "etapa_id": row.get("etapa_id"),
                    "etapa_nombre": etapa.get("nombre"),
                    "etapa_codigo": etapa.get("codigo"),
                    "etapa_metadatos": etapa.get("metadata"),
                    "categoria": categoria,
                    "canal": (row.get("metadata") or {}).get("canal"),
                    "creado_en": row.get("creado_en"),
                    "actualizado_en": row.get("actualizado_en"),
                    "cerrado_en": row.get("cerrado_en"),
                    "monto_estimado": monto_estimado,
                    "moneda": moneda,
                    "probabilidad": row.get("probabilidad"),
                    "proyecto_nombre": row.get("descripcion"),
                    "lead_score": (row.get("metadata") or {}).get("lead_score"),
                    "asignado_id": row.get("asignado_a_usuario_id"),
                    "asignado_nombre": reviewer,
                    "propietario_id": row.get("propietario_usuario_id"),
                    "propietario_nombre": propietario.get("nombre_completo"),
                    "contacto_correo": contacto.get("correo"),
                    "contacto_telefono": contacto.get("telefono_e164"),
                    "contacto_empresa": contacto.get("company_name"),
                    "contacto_notas": contacto.get("notes"),
                    "contacto_estado": contacto.get("estado") or contacto.get("captura_estado"),
                    "motivo_cierre": row.get("motivo_perdida"),
                    "tags": (row.get("metadata") or {}).get("tags"),
                    "metadata": row.get("metadata"),
                    "status_meta": status_meta,
                    "metric_meta": metric_meta,
                },
            )
        )
    return table


def _build_status_meta(categoria: str, cerrado_en: datetime | None) -> dict[str, str]:
    if categoria == "ganada":
        return {"label": "Ganado", "variant": "default"}
    if categoria == "perdida":
        return {"label": "Perdido", "variant": "destructive"}
    if cerrado_en:
        return {"label": "Cerrado", "variant": "secondary"}
    return {"label": "En proceso", "variant": "outline"}


def _format_currency(value: Any, currency: str) -> str:
    if not isinstance(value, (int, float)):
        return "—"
    formatted = f"{value:,.0f}"
    return f"{formatted} {currency}".strip()


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            normalized = value.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(normalized)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _safe_uuid(value: str | UUID | None) -> UUID | None:
    if isinstance(value, UUID):
        return value
    if isinstance(value, str):
        try:
            return UUID(value)
        except ValueError:
            return None
    return None


def _build_pipeline_board(
    stage_rows: list[dict[str, Any]],
    opportunity_rows: list[dict[str, Any]],
) -> CRMPipelineBoard:
    stage_map: dict[UUID, CRMPipelineBoardStage] = {}
    for stage_row in stage_rows:
        stage = _stage_from_row(stage_row)
        if stage:
            stage_map[stage.id] = stage

    sin_conversacion: list[CRMPipelineBoardCard] = []

    for row in opportunity_rows:
        card = _card_from_opportunity(row)
        if card is None:
            continue
        stage = stage_map.get(card.etapa_id)
        if stage is None:
            stage = _stage_from_opportunity(row)
            if stage:
                stage_map[stage.id] = stage
        if stage:
            stage.tarjetas.append(card)
        if not card.conversacion_id and not _is_manual_card(card.metadata):
            sin_conversacion.append(card)

    for stage in stage_map.values():
        stage.tarjetas.sort(
            key=lambda card: card.actualizado_en or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )

    ordered_stages = sorted(
        stage_map.values(),
        key=lambda stage: (stage.orden, stage.nombre.lower()),
    )

    sin_conversacion.sort(
        key=lambda card: card.actualizado_en or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )

    return CRMPipelineBoard(
        stages=ordered_stages,
        sin_conversacion=sin_conversacion,
        visitantes_sin_chat=0,
    )


async def _build_pipeline_card_response(
    *,
    repo: CRMRepository,
    organizacion_id: UUID,
    oportunidad_id: UUID,
) -> CRMPipelineCardResponse:
    row = await repo.get_pipeline_opportunity(
        organizacion_id=organizacion_id,
        oportunidad_id=oportunidad_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="opportunity_not_found")
    stage = _stage_from_opportunity(row)
    card = _card_from_opportunity(row)
    if stage is None or card is None:
        raise HTTPException(status_code=404, detail="pipeline_card_unavailable")
    return CRMPipelineCardResponse(stage=stage, card=card)


def _stage_from_row(row: dict[str, Any]) -> CRMPipelineBoardStage | None:
    stage_id = _safe_uuid(row.get("id"))
    if not stage_id:
        return None
    metadata = _ensure_dict(row.get("metadata") or row.get("metadatos"), default={})
    tablero_id = metadata.get("tablero_id")
    return CRMPipelineBoardStage(
        id=stage_id,
        nombre=row.get("nombre") or "Sin etapa",
        codigo=row.get("codigo") or "",
        categoria=row.get("categoria") or "abierta",
        orden=int(row.get("orden") or 0),
        tablero_id=str(tablero_id) if tablero_id else None,
        metadatos=metadata,
        tarjetas=[],
    )


def _stage_from_opportunity(row: dict[str, Any]) -> CRMPipelineBoardStage | None:
    etapa = row.get("etapa") or {}
    etapa_id = _safe_uuid(row.get("etapa_id") or etapa.get("id"))
    if not etapa_id:
        return None
    metadata = _ensure_dict(etapa.get("metadata"), default={})
    tablero_id = metadata.get("tablero_id")
    return CRMPipelineBoardStage(
        id=etapa_id,
        nombre=etapa.get("nombre") or "Sin etapa",
        codigo=etapa.get("codigo") or "",
        categoria=etapa.get("categoria") or row.get("estado") or "abierta",
        orden=int(etapa.get("orden") or 0),
        tablero_id=str(tablero_id) if tablero_id else None,
        metadatos=metadata,
        tarjetas=[],
    )


def _card_from_opportunity(row: dict[str, Any]) -> CRMPipelineBoardCard | None:
    oportunidad_id = _safe_uuid(row.get("id"))
    etapa_id = _safe_uuid(row.get("etapa_id"))
    if not oportunidad_id or not etapa_id:
        return None
    metadata = _ensure_dict(row.get("metadata"), default={})
    contacto = _ensure_dict(row.get("contacto"), default={})
    cuenta = _ensure_dict(row.get("cuenta"), default={})
    asignado = _ensure_dict(row.get("asignado"), default={})
    nombre = (
        row.get("titulo")
        or contacto.get("nombre_completo")
        or cuenta.get("nombre")
        or "Oportunidad sin nombre"
    )
    conversacion_id = _safe_uuid(metadata.get("conversacion_id"))
    asignado_nombre = asignado.get("nombre_completo") or asignado.get("correo")
    prioridad = metadata.get("lead_score")
    tags_value = metadata.get("tags")
    etiquetas = (
        [str(tag) for tag in tags_value if isinstance(tag, str)]
        if isinstance(tags_value, list)
        else None
    )
    actualizado_en = _parse_datetime(row.get("actualizado_en"))
    return CRMPipelineBoardCard(
        tarjeta_id=oportunidad_id,
        contacto_id=_safe_uuid(contacto.get("id")),
        conversacion_id=conversacion_id,
        nombre=nombre,
        correo=contacto.get("correo"),
        telefono=contacto.get("telefono_e164"),
        empresa=contacto.get("company_name"),
        notas=contacto.get("notes"),
        necesidad_proposito=contacto.get("necesidad_proposito"),
        canal=metadata.get("canal"),
        estado=contacto.get("estado") or contacto.get("captura_estado"),
        etapa_id=etapa_id,
        etapa_nombre=(row.get("etapa") or {}).get("nombre") or "Sin etapa",
        monto=row.get("monto_estimado"),
        moneda=row.get("moneda"),
        probabilidad=row.get("probabilidad"),
        proyecto_nombre=row.get("descripcion"),
        proyecto_necesidades=metadata.get("proyecto_necesidades"),
        asignado_id=_safe_uuid(row.get("asignado_a_usuario_id")),
        asignado_nombre=asignado_nombre,
        prioridad=float(prioridad) if isinstance(prioridad, (int, float)) else None,
        actualizado_en=actualizado_en,
        etiquetas=etiquetas,
        metadata=metadata,
    )


def _ensure_dict(value: Any, default: dict[str, Any]) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return dict(default)


def _is_manual_card(metadata: dict[str, Any] | None) -> bool:
    if not metadata:
        return False
    created_via = metadata.get("created_via")
    return isinstance(created_via, str) and created_via == "embudo_manual"
