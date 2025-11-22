"""Endpoints del CRM multi-tenant construidos sobre Supabase."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated
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


class CRMOpportunitiesResponse(BaseModel):
    items: list[CRMOpportunity]
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
