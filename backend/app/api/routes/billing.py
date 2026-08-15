"""Consulta tenant-aware del consumo de mensajes y tarifas efectivas."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.routes.crm import require_user_token
from app.repositories.crm import CRMRepository, CRMRepositoryError

router = APIRouter(prefix="/billing", tags=["message-billing"])

MASTER_ORGANIZACION_ID = UUID("00000000-0000-0000-0000-000000000001")


class BillingPeriodItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    organizacion_id: UUID | None
    fecha_inicio: datetime
    fecha_fin: datetime
    estado: str
    mensajes_cantidad: int
    mensajes_entrantes_cantidad: int
    mensajes_salientes_cantidad: int
    hilos_con_actividad_cantidad: int
    conversiones_cantidad: int
    subtotal_mensajes: Decimal
    costo_meta_periodo: Decimal
    costo_mensaje_periodo: Decimal
    ajustes_total: Decimal
    total: Decimal
    moneda: str
    cerrado_en: datetime | None = None
    creado_en: datetime


class BillingSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool = True
    scope: str
    organizacion_id: UUID | None = None
    periodos: list[BillingPeriodItem] = Field(default_factory=list)
    mensajes_cantidad: int = 0
    mensajes_entrantes_cantidad: int = 0
    mensajes_salientes_cantidad: int = 0
    hilos_con_actividad_cantidad: int = 0
    conversiones_cantidad: int = 0
    cargo_app_total: Decimal = Decimal("0")
    costo_meta_total: Decimal = Decimal("0")
    total_consumo: Decimal = Decimal("0")


class BillingMessageItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    organizacion_id: UUID
    periodo_id: UUID
    mensaje_id: UUID
    conversacion_id: UUID
    proveedor: str
    canal: str
    proveedor_mensaje_id: str
    direccion: str
    tipo_contenido: str
    origen_mensaje: str
    es_plantilla: bool
    nombre_plantilla: str | None = None
    idioma_plantilla: str | None = None
    categoria_meta: str
    tipo_pricing_meta: str | None = None
    billable_meta: bool | None = None
    estado_proveedor: str
    aceptado_proveedor_en: datetime | None = None
    facturable: bool
    motivo_no_facturable: str | None = None
    origen_tarifa_app: str
    cargo_app_unitario: Decimal
    cargo_app_importe: Decimal
    costo_meta_aplica: bool
    costo_meta_unitario: Decimal
    costo_meta_importe: Decimal
    costo_total_mensaje: Decimal
    tipo_cargo: str
    fuente_registro: str
    conciliacion_estado: str
    creado_en: datetime


class BillingMessageListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool = True
    scope: str
    total: int
    page: int
    page_size: int
    items: list[BillingMessageItem] = Field(default_factory=list)


class BillingTenantOption(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    nombre: str | None = None
    nombre_comercial: str | None = None
    activo: bool = True


class BillingTenantListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool = True
    items: list[BillingTenantOption] = Field(default_factory=list)


class BillingEffectiveRateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool = True
    organizacion_id: UUID
    tarifa: dict[str, Any] | None = None


class BillingAppRateCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alcance: str = Field(pattern="^(global|tenant)$")
    organizacion_id: UUID | None = None
    precio_mensaje: Decimal = Field(ge=0, decimal_places=4, max_digits=12)
    motivo: str | None = Field(default=None, max_length=500)
    vigente_desde: datetime | None = None


class BillingProviderRateCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    proveedor: str = Field(min_length=2, max_length=32)
    canal: str = Field(min_length=2, max_length=32)
    pais_codigo_iso2: str = Field(default="MX", min_length=2, max_length=2)
    categoria_meta: str = Field(pattern="^(marketing|utility|authentication|service|referral_conversion|unknown)$")
    iniciador_hilo: str = Field(pattern="^(cliente|empresa|desconocido)$")
    precio_unitario: Decimal = Field(ge=0, decimal_places=4, max_digits=12)
    motivo: str | None = Field(default=None, max_length=500)
    vigente_desde: datetime | None = None


def get_billing_repository(user_token: str = Depends(require_user_token)) -> CRMRepository:
    try:
        return CRMRepository(user_token=user_token)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=500, detail="billing_repository_unavailable") from exc


async def _billing_context(repo: CRMRepository) -> tuple[UUID | None, bool]:
    try:
        context = await repo.get_permission_context()
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_permission_context_unavailable") from exc
    raw_org = context.get("organizacion_id") if isinstance(context, dict) else None
    try:
        org_id = UUID(str(raw_org)) if raw_org else None
    except (TypeError, ValueError):
        org_id = None
    is_owner = bool(isinstance(context, dict) and context.get("es_owner") is True)
    return org_id, is_owner


async def _tenant_scope(repo: CRMRepository) -> UUID:
    org_id, _ = await _billing_context(repo)
    if org_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="tenant_context_required")
    return org_id


async def _owner_scope(repo: CRMRepository) -> None:
    organizacion_id, is_owner = await _billing_context(repo)
    if not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="owner_required")
    if organizacion_id != MASTER_ORGANIZACION_ID:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="master_tenant_context_required",
        )


def _summary(*, scope: str, organizacion_id: UUID | None, rows: list[dict[str, Any]]) -> BillingSummaryResponse:
    periods = [BillingPeriodItem.model_validate(row) for row in rows]
    return BillingSummaryResponse(
        scope=scope,
        organizacion_id=organizacion_id,
        periodos=periods,
        mensajes_cantidad=sum(item.mensajes_cantidad for item in periods),
        mensajes_entrantes_cantidad=sum(item.mensajes_entrantes_cantidad for item in periods),
        mensajes_salientes_cantidad=sum(item.mensajes_salientes_cantidad for item in periods),
        hilos_con_actividad_cantidad=sum(item.hilos_con_actividad_cantidad for item in periods),
        conversiones_cantidad=sum(item.conversiones_cantidad for item in periods),
        cargo_app_total=sum((item.subtotal_mensajes for item in periods), Decimal("0")),
        costo_meta_total=sum((item.costo_meta_periodo for item in periods), Decimal("0")),
        total_consumo=sum((item.total for item in periods), Decimal("0")),
    )


@router.get("/summary", response_model=BillingSummaryResponse)
async def get_billing_summary(
    desde: datetime | None = Query(default=None),
    hasta: datetime | None = Query(default=None),
    categoria_meta: str | None = Query(default=None, max_length=32),
    direccion: str | None = Query(default=None, pattern="^(entrante|saliente)$"),
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingSummaryResponse:
    organizacion_id = await _tenant_scope(repo)
    try:
        rows = await repo.list_billing_periods(
            organizacion_id=organizacion_id,
            fecha_inicio=desde,
            fecha_fin=hasta,
            categoria_meta=categoria_meta,
            direccion=direccion,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_summary_unavailable") from exc
    return _summary(scope="tenant", organizacion_id=organizacion_id, rows=rows)


@router.get("/master/summary", response_model=BillingSummaryResponse)
async def get_master_billing_summary(
    organizacion_id: UUID | None = Query(default=None),
    desde: datetime | None = Query(default=None),
    hasta: datetime | None = Query(default=None),
    categoria_meta: str | None = Query(default=None, max_length=32),
    direccion: str | None = Query(default=None, pattern="^(entrante|saliente)$"),
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingSummaryResponse:
    await _owner_scope(repo)
    try:
        rows = await repo.list_billing_periods(
            organizacion_id=organizacion_id,
            fecha_inicio=desde,
            fecha_fin=hasta,
            categoria_meta=categoria_meta,
            direccion=direccion,
            limit=120,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_master_summary_unavailable") from exc
    return _summary(scope="master", organizacion_id=organizacion_id, rows=rows)


@router.get("/master/tenants", response_model=BillingTenantListResponse)
async def list_master_billing_tenants(
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingTenantListResponse:
    await _owner_scope(repo)
    try:
        rows = await repo.list_billing_tenants()
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_master_tenants_unavailable") from exc
    return BillingTenantListResponse(
        items=[BillingTenantOption.model_validate(row) for row in rows]
    )


@router.get("/messages", response_model=BillingMessageListResponse)
async def list_tenant_billing_messages(
    periodo_id: UUID | None = Query(default=None),
    categoria_meta: str | None = Query(default=None, max_length=32),
    direccion: str | None = Query(default=None, pattern="^(entrante|saliente)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingMessageListResponse:
    organizacion_id = await _tenant_scope(repo)
    try:
        rows, total = await repo.list_billing_messages(
            organizacion_id=organizacion_id,
            periodo_id=periodo_id,
            categoria_meta=categoria_meta,
            direccion=direccion,
            page=page,
            page_size=page_size,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_messages_unavailable") from exc
    return BillingMessageListResponse(
        scope="tenant",
        total=total,
        page=page,
        page_size=page_size,
        items=[BillingMessageItem.model_validate(row) for row in rows],
    )


@router.get("/master/messages", response_model=BillingMessageListResponse)
async def list_master_billing_messages(
    organizacion_id: UUID | None = Query(default=None),
    periodo_id: UUID | None = Query(default=None),
    categoria_meta: str | None = Query(default=None, max_length=32),
    direccion: str | None = Query(default=None, pattern="^(entrante|saliente)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingMessageListResponse:
    await _owner_scope(repo)
    try:
        rows, total = await repo.list_billing_messages(
            organizacion_id=organizacion_id,
            periodo_id=periodo_id,
            categoria_meta=categoria_meta,
            direccion=direccion,
            page=page,
            page_size=page_size,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_master_messages_unavailable") from exc
    return BillingMessageListResponse(
        scope="master",
        total=total,
        page=page,
        page_size=page_size,
        items=[BillingMessageItem.model_validate(row) for row in rows],
    )


@router.get("/tariff/effective", response_model=BillingEffectiveRateResponse)
async def get_effective_billing_tariff(
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingEffectiveRateResponse:
    organizacion_id = await _tenant_scope(repo)
    try:
        tariff = await repo.get_billing_effective_app_rate(organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_tariff_unavailable") from exc
    return BillingEffectiveRateResponse(organizacion_id=organizacion_id, tarifa=tariff)


@router.post("/master/tariff/app", response_model=BillingEffectiveRateResponse)
async def create_master_billing_app_tariff(
    payload: BillingAppRateCreate,
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingEffectiveRateResponse:
    await _owner_scope(repo)
    if payload.alcance == "global" and payload.organizacion_id is not None:
        raise HTTPException(status_code=400, detail="global_tariff_cannot_have_tenant")
    if payload.alcance == "tenant" and payload.organizacion_id is None:
        raise HTTPException(status_code=400, detail="tenant_tariff_requires_organization")
    try:
        tariff = await repo.create_billing_app_rate(
            alcance=payload.alcance,
            organizacion_id=payload.organizacion_id,
            precio_mensaje=payload.precio_mensaje,
            motivo=payload.motivo,
            vigente_desde=payload.vigente_desde,
        )
    except CRMRepositoryError as exc:
        message = str(exc).lower()
        if "future_date" in message or "price_invalid" in message:
            raise HTTPException(status_code=400, detail="billing_tariff_values_invalid") from exc
        raise HTTPException(status_code=502, detail="billing_tariff_update_unavailable") from exc
    return BillingEffectiveRateResponse(
        organizacion_id=payload.organizacion_id,
        tarifa=tariff,
    )


@router.post("/master/tariff/provider", response_model=BillingEffectiveRateResponse)
async def create_master_billing_provider_tariff(
    payload: BillingProviderRateCreate,
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingEffectiveRateResponse:
    await _owner_scope(repo)
    try:
        tariff = await repo.create_billing_provider_rate(
            proveedor=payload.proveedor,
            canal=payload.canal,
            pais_codigo_iso2=payload.pais_codigo_iso2,
            categoria_meta=payload.categoria_meta,
            iniciador_hilo=payload.iniciador_hilo,
            precio_unitario=payload.precio_unitario,
            motivo=payload.motivo,
            vigente_desde=payload.vigente_desde,
        )
    except CRMRepositoryError as exc:
        message = str(exc).lower()
        if "invalid" in message or "future_date" in message:
            raise HTTPException(status_code=400, detail="billing_provider_tariff_values_invalid") from exc
        raise HTTPException(status_code=502, detail="billing_provider_tariff_update_unavailable") from exc
    return BillingEffectiveRateResponse(organizacion_id=None, tarifa=tariff)
