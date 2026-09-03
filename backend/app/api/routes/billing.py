"""Consulta tenant-aware del consumo de mensajes y tarifas efectivas."""

from __future__ import annotations

import csv
import io
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
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
    categoria_interna_cobro: str = "sin_clasificar"
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
    mensaje_creado_en: datetime
    organizacion_nombre: str | None = None
    periodo_label: str | None = None
    contacto_nombre: str | None = None
    contacto_telefono: str | None = None
    contacto_correo: str | None = None
    operativo_eliminado: bool = False
    operativo_eliminado_en: datetime | None = None


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


class BillingReconciliationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool = True
    scope: str
    organizacion_id: UUID | None = None
    pendiente: int = 0
    vinculado: int = 0
    no_conciliado: int = 0


class BillingUnreconciledEventItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    organizacion_id: UUID | None = None
    proveedor: str
    evento: str
    proveedor_ts: datetime | None = None
    proveedor_mensaje_id: str | None = None
    conciliacion_estado: str
    conciliacion_motivo: str | None = None
    creado_en: datetime


class BillingUnreconciledEventResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool = True
    scope: str
    organizacion_id: UUID | None = None
    items: list[BillingUnreconciledEventItem] = Field(default_factory=list)


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


class BillingTenantConfiguration(BaseModel):
    model_config = ConfigDict(extra="ignore")

    organizacion_id: UUID
    limite_mensajes_periodo: int | None = Field(default=None, ge=0)
    limite_costo_app_periodo: Decimal | None = Field(default=None, ge=0, decimal_places=4, max_digits=14)
    limite_costo_meta_periodo: Decimal | None = Field(default=None, ge=0, decimal_places=4, max_digits=14)
    porcentaje_alerta_consumo: int = Field(default=80, ge=1, le=100)
    suspension_automatica_por_limite: bool = False
    creado_en: datetime | None = None
    actualizado_en: datetime | None = None


class BillingTenantConfigurationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    limite_mensajes_periodo: int | None = Field(default=None, ge=0)
    limite_costo_app_periodo: Decimal | None = Field(default=None, ge=0, decimal_places=4, max_digits=14)
    limite_costo_meta_periodo: Decimal | None = Field(default=None, ge=0, decimal_places=4, max_digits=14)
    porcentaje_alerta_consumo: int = Field(default=80, ge=1, le=100)
    suspension_automatica_por_limite: bool = False


class BillingAlertItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    organizacion_id: UUID
    periodo_id: UUID | None = None
    tipo: str
    severidad: str
    estado: str
    umbral: Decimal | None = None
    valor_actual: Decimal | None = None
    mensaje: str
    creado_en: datetime
    resuelto_en: datetime | None = None


class BillingAlertResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool = True
    scope: str
    organizacion_id: UUID | None = None
    items: list[BillingAlertItem] = Field(default_factory=list)


class BillingAlertStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    estado: str = Field(pattern="^(acknowledged|resuelta|descartada)$")


class BillingAdjustmentItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    organizacion_id: UUID
    periodo_id: UUID
    tipo: str
    importe: Decimal
    moneda: str
    motivo: str
    referencia: str | None = None
    creado_por_usuario_id: UUID
    creado_en: datetime


class BillingAdjustmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    organizacion_id: UUID
    periodo_id: UUID
    tipo: str = Field(pattern="^(credito|cargo|reversa)$")
    importe: Decimal = Field(max_digits=12, decimal_places=4)
    motivo: str = Field(min_length=3, max_length=1000)
    referencia: str | None = Field(default=None, max_length=255)


class BillingAdjustmentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool = True
    scope: str
    organizacion_id: UUID | None = None
    items: list[BillingAdjustmentItem] = Field(default_factory=list)


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
    categoria_meta: str | None = Query(default=None, max_length=40, pattern="^(marketing|utility|authentication|service|referral_conversion|unknown|conversacion_sin_tarifa_meta)$"),
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
    categoria_meta: str | None = Query(default=None, max_length=40, pattern="^(marketing|utility|authentication|service|referral_conversion|unknown|conversacion_sin_tarifa_meta)$"),
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


async def _reconciliation_response(
    *, repo: CRMRepository, scope: str, organizacion_id: UUID | None, desde: datetime | None, hasta: datetime | None
) -> BillingReconciliationResponse:
    try:
        counts = await repo.get_billing_reconciliation_counts(
            organizacion_id=organizacion_id,
            fecha_desde=desde,
            fecha_hasta=hasta,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_reconciliation_unavailable") from exc
    return BillingReconciliationResponse(
        scope=scope,
        organizacion_id=organizacion_id,
        pendiente=counts.get("pendiente", 0),
        vinculado=counts.get("vinculado", 0),
        no_conciliado=counts.get("no_conciliado", 0),
    )


@router.get("/reconciliation", response_model=BillingReconciliationResponse)
async def get_tenant_billing_reconciliation(
    desde: datetime | None = Query(default=None),
    hasta: datetime | None = Query(default=None),
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingReconciliationResponse:
    organizacion_id = await _tenant_scope(repo)
    return await _reconciliation_response(
        repo=repo, scope="tenant", organizacion_id=organizacion_id, desde=desde, hasta=hasta
    )


@router.get("/master/reconciliation", response_model=BillingReconciliationResponse)
async def get_master_billing_reconciliation(
    organizacion_id: UUID | None = Query(default=None),
    desde: datetime | None = Query(default=None),
    hasta: datetime | None = Query(default=None),
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingReconciliationResponse:
    await _owner_scope(repo)
    return await _reconciliation_response(
        repo=repo, scope="master", organizacion_id=organizacion_id, desde=desde, hasta=hasta
    )


async def _unreconciled_events_response(
    *, repo: CRMRepository, scope: str, organizacion_id: UUID | None, desde: datetime | None, hasta: datetime | None
) -> BillingUnreconciledEventResponse:
    try:
        rows = await repo.list_billing_unreconciled_events(
            organizacion_id=organizacion_id,
            fecha_desde=desde,
            fecha_hasta=hasta,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_unreconciled_events_unavailable") from exc
    return BillingUnreconciledEventResponse(
        scope=scope,
        organizacion_id=organizacion_id,
        items=[BillingUnreconciledEventItem.model_validate(row) for row in rows],
    )


@router.get("/reconciliation/events", response_model=BillingUnreconciledEventResponse)
async def list_tenant_unreconciled_events(
    desde: datetime | None = Query(default=None),
    hasta: datetime | None = Query(default=None),
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingUnreconciledEventResponse:
    organizacion_id = await _tenant_scope(repo)
    return await _unreconciled_events_response(
        repo=repo, scope="tenant", organizacion_id=organizacion_id, desde=desde, hasta=hasta
    )


@router.get("/master/reconciliation/events", response_model=BillingUnreconciledEventResponse)
async def list_master_unreconciled_events(
    organizacion_id: UUID | None = Query(default=None),
    desde: datetime | None = Query(default=None),
    hasta: datetime | None = Query(default=None),
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingUnreconciledEventResponse:
    await _owner_scope(repo)
    return await _unreconciled_events_response(
        repo=repo, scope="master", organizacion_id=organizacion_id, desde=desde, hasta=hasta
    )


@router.get("/messages", response_model=BillingMessageListResponse)
async def list_tenant_billing_messages(
    periodo_id: UUID | None = Query(default=None),
    desde: datetime | None = Query(default=None),
    hasta: datetime | None = Query(default=None),
    categoria_meta: str | None = Query(default=None, max_length=40, pattern="^(marketing|utility|authentication|service|referral_conversion|unknown|conversacion_sin_tarifa_meta)$"),
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
            fecha_desde=desde,
            fecha_hasta=hasta,
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
    desde: datetime | None = Query(default=None),
    hasta: datetime | None = Query(default=None),
    categoria_meta: str | None = Query(default=None, max_length=40, pattern="^(marketing|utility|authentication|service|referral_conversion|unknown|conversacion_sin_tarifa_meta)$"),
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
            fecha_desde=desde,
            fecha_hasta=hasta,
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


def _billing_messages_csv(rows: list[dict[str, Any]]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "fecha", "tenant", "periodo", "contacto", "telefono", "correo", "proveedor", "canal",
        "direccion", "categoria_meta", "clasificacion_interna", "estado_operativo", "estado_proveedor", "facturable", "cargo_geoactiv_mxn",
        "costo_meta_mxn", "total_consumo_mxn", "conciliacion_estado", "fuente_registro",
        "mensaje_id_ref", "conversacion_id_ref", "periodo_id_ref", "tenant_id_ref",
    ])
    for row in rows:
        writer.writerow([
            row.get("creado_en"), row.get("organizacion_nombre") or "Tenant no identificado",
            row.get("periodo_label") or "Periodo no disponible", row.get("contacto_nombre") or "Contacto no identificado",
            row.get("contacto_telefono") or "", row.get("contacto_correo") or "", row.get("proveedor"), row.get("canal"),
            row.get("direccion"), "Sin categoría Meta" if row.get("categoria_meta") == "unknown" else row.get("categoria_meta"),
            "Conversación sin tarifa Meta" if row.get("categoria_interna_cobro") == "conversacion_sin_tarifa_meta" else "",
            "Eliminado" if row.get("operativo_eliminado") else "Activo",
            row.get("estado_proveedor"), row.get("facturable"),
            row.get("cargo_app_importe"), row.get("costo_meta_importe"), row.get("costo_total_mensaje"),
            row.get("conciliacion_estado"), row.get("fuente_registro"), row.get("mensaje_id"),
            row.get("conversacion_id"), row.get("periodo_id"), row.get("organizacion_id"),
        ])
    return "\ufeff" + output.getvalue()


async def _export_billing_messages_csv(
    *,
    repo: CRMRepository,
    organizacion_id: UUID | None,
    desde: datetime | None,
    hasta: datetime | None,
    categoria_meta: str | None,
    direccion: str | None,
) -> Response:
    try:
        rows = await repo.export_billing_messages(
            organizacion_id=organizacion_id,
            fecha_desde=desde,
            fecha_hasta=hasta,
            categoria_meta=categoria_meta,
            direccion=direccion,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_export_unavailable") from exc
    return Response(
        content=_billing_messages_csv(rows),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="cobro-mensajes.csv"'},
    )


@router.get("/messages/export")
async def export_tenant_billing_messages(
    desde: datetime | None = Query(default=None),
    hasta: datetime | None = Query(default=None),
    categoria_meta: str | None = Query(default=None, max_length=40, pattern="^(marketing|utility|authentication|service|referral_conversion|unknown|conversacion_sin_tarifa_meta)$"),
    direccion: str | None = Query(default=None, pattern="^(entrante|saliente)$"),
    repo: CRMRepository = Depends(get_billing_repository),
) -> Response:
    organizacion_id = await _tenant_scope(repo)
    return await _export_billing_messages_csv(
        repo=repo, organizacion_id=organizacion_id, desde=desde, hasta=hasta,
        categoria_meta=categoria_meta, direccion=direccion,
    )


@router.get("/master/messages/export")
async def export_master_billing_messages(
    organizacion_id: UUID | None = Query(default=None),
    desde: datetime | None = Query(default=None),
    hasta: datetime | None = Query(default=None),
    categoria_meta: str | None = Query(default=None, max_length=40, pattern="^(marketing|utility|authentication|service|referral_conversion|unknown|conversacion_sin_tarifa_meta)$"),
    direccion: str | None = Query(default=None, pattern="^(entrante|saliente)$"),
    repo: CRMRepository = Depends(get_billing_repository),
) -> Response:
    await _owner_scope(repo)
    return await _export_billing_messages_csv(
        repo=repo, organizacion_id=organizacion_id, desde=desde, hasta=hasta,
        categoria_meta=categoria_meta, direccion=direccion,
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


@router.get("/configuration", response_model=BillingTenantConfiguration | None)
async def get_billing_configuration(
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingTenantConfiguration | None:
    organizacion_id = await _tenant_scope(repo)
    try:
        row = await repo.get_billing_tenant_configuration(organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_configuration_unavailable") from exc
    return BillingTenantConfiguration.model_validate(row) if row else None


@router.get("/master/configuration", response_model=BillingTenantConfiguration | None)
async def get_master_billing_configuration(
    organizacion_id: UUID = Query(...),
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingTenantConfiguration | None:
    await _owner_scope(repo)
    try:
        row = await repo.get_billing_tenant_configuration(organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_master_configuration_unavailable") from exc
    return BillingTenantConfiguration.model_validate(row) if row else None


@router.put("/master/configuration", response_model=BillingTenantConfiguration)
async def update_master_billing_configuration(
    payload: BillingTenantConfigurationUpdate,
    organizacion_id: UUID = Query(...),
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingTenantConfiguration:
    await _owner_scope(repo)
    try:
        row = await repo.upsert_billing_tenant_configuration(
            organizacion_id=organizacion_id,
            limite_mensajes_periodo=payload.limite_mensajes_periodo,
            limite_costo_app_periodo=payload.limite_costo_app_periodo,
            limite_costo_meta_periodo=payload.limite_costo_meta_periodo,
            porcentaje_alerta_consumo=payload.porcentaje_alerta_consumo,
            suspension_automatica_por_limite=payload.suspension_automatica_por_limite,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_configuration_update_unavailable") from exc
    return BillingTenantConfiguration.model_validate(row)


@router.get("/alerts", response_model=BillingAlertResponse)
async def list_tenant_billing_alerts(
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingAlertResponse:
    organizacion_id = await _tenant_scope(repo)
    try:
        rows = await repo.list_billing_alerts(organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_alerts_unavailable") from exc
    return BillingAlertResponse(scope="tenant", organizacion_id=organizacion_id, items=[BillingAlertItem.model_validate(row) for row in rows])


@router.get("/master/alerts", response_model=BillingAlertResponse)
async def list_master_billing_alerts(
    organizacion_id: UUID | None = Query(default=None),
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingAlertResponse:
    await _owner_scope(repo)
    try:
        rows = await repo.list_billing_alerts(organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_master_alerts_unavailable") from exc
    return BillingAlertResponse(scope="master", organizacion_id=organizacion_id, items=[BillingAlertItem.model_validate(row) for row in rows])


@router.put("/master/alerts/status", response_model=BillingAlertItem)
async def update_master_billing_alert_status(
    payload: BillingAlertStatusUpdate,
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingAlertItem:
    await _owner_scope(repo)
    try:
        row = await repo.update_billing_alert_status(alert_id=payload.id, estado=payload.estado)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_alert_status_update_unavailable") from exc
    return BillingAlertItem.model_validate(row)


@router.get("/adjustments", response_model=BillingAdjustmentResponse)
async def list_tenant_billing_adjustments(
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingAdjustmentResponse:
    organizacion_id = await _tenant_scope(repo)
    try:
        rows = await repo.list_billing_adjustments(organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_adjustments_unavailable") from exc
    return BillingAdjustmentResponse(scope="tenant", organizacion_id=organizacion_id, items=[BillingAdjustmentItem.model_validate(row) for row in rows])


@router.get("/master/adjustments", response_model=BillingAdjustmentResponse)
async def list_master_billing_adjustments(
    organizacion_id: UUID | None = Query(default=None),
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingAdjustmentResponse:
    await _owner_scope(repo)
    try:
        rows = await repo.list_billing_adjustments(organizacion_id=organizacion_id)
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_master_adjustments_unavailable") from exc
    return BillingAdjustmentResponse(scope="master", organizacion_id=organizacion_id, items=[BillingAdjustmentItem.model_validate(row) for row in rows])


@router.post("/master/adjustments", response_model=BillingAdjustmentItem, status_code=status.HTTP_201_CREATED)
async def create_master_billing_adjustment(
    payload: BillingAdjustmentCreate,
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingAdjustmentItem:
    await _owner_scope(repo)
    if payload.importe == 0:
        raise HTTPException(status_code=400, detail="billing_adjustment_amount_cannot_be_zero")
    context, _ = await _billing_context(repo)
    try:
        permission_context = await repo.get_permission_context()
        usuario_id = UUID(str(permission_context.get("usuario_id")))
    except (CRMRepositoryError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=403, detail="billing_adjustment_user_required") from exc
    if context is None:
        raise HTTPException(status_code=403, detail="tenant_context_required")
    try:
        row = await repo.create_billing_adjustment(
            organizacion_id=payload.organizacion_id,
            periodo_id=payload.periodo_id,
            tipo=payload.tipo,
            importe=payload.importe,
            motivo=payload.motivo,
            referencia=payload.referencia,
            creado_por_usuario_id=usuario_id,
        )
    except CRMRepositoryError as exc:
        raise HTTPException(status_code=502, detail="billing_adjustment_create_unavailable") from exc
    return BillingAdjustmentItem.model_validate(row)


@router.post("/master/periods/{period_id}/close", response_model=BillingPeriodItem)
async def close_master_billing_period(
    period_id: UUID,
    repo: CRMRepository = Depends(get_billing_repository),
) -> BillingPeriodItem:
    await _owner_scope(repo)
    try:
        permission_context = await repo.get_permission_context()
        usuario_id = UUID(str(permission_context.get("usuario_id")))
        row = await repo.close_billing_period(period_id=period_id, user_id=usuario_id)
    except CRMRepositoryError as exc:
        if "billing_period_not_closable" in str(exc):
            raise HTTPException(status_code=409, detail="billing_period_not_closable") from exc
        raise HTTPException(status_code=502, detail="billing_period_close_unavailable") from exc
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=403, detail="billing_close_user_required") from exc
    return BillingPeriodItem.model_validate(row)


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
