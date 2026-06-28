"""Rutas públicas para alta comercial y cobro Stripe."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import settings
from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError
from app.services.stripe_billing import StripeApiError, create_stripe_checkout_session, create_stripe_customer

from .admin import (
    _bootstrap_default_org_structure,
    _delete_created_tenant_best_effort,
    _ensure_tenant_calendar_bootstrap,
    _ensure_tenant_pipeline_bootstrap,
    _ensure_webchat_alias_is_available,
    get_platform_repo,
)

router = APIRouter(prefix="/public/billing", tags=["public-billing"])


class PublicPlanPriceSummary(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    plan_id: UUID
    billing_provider: str
    provider_product_id: str
    provider_price_id: str
    currency: str
    billing_interval: str
    amount_cents: int
    active: bool


class PublicCommercialPlanSummary(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    code: str
    name: str
    description: str | None = None
    active: bool
    sort_order: int
    prices: list[PublicPlanPriceSummary] = Field(default_factory=list)


class PublicCommercialPlansResponse(BaseModel):
    ok: bool = True
    items: list[PublicCommercialPlanSummary] = Field(default_factory=list)


class PublicTenantBillingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider_price_id: str = Field(..., min_length=3)
    nombre: str = Field(..., min_length=2)
    razon_social: str | None = None
    dominio_principal: str | None = None
    rfc: str | None = None
    pais: str | None = None
    estado: str | None = None
    ciudad: str | None = None
    telefono: str | None = None
    sitio_web: str | None = None
    nombre_comercial: str | None = None
    correo_contacto_principal: str | None = None
    correo_facturacion: str | None = None
    contacto_nombre: str | None = None
    contacto_telefono: str | None = None
    timezone: str | None = None
    idioma: str | None = None
    moneda: str | None = None
    logo_url: str | None = None
    direccion_fiscal: str | None = None
    codigo_postal: str | None = None
    regimen_fiscal: str | None = None
    webchat_alias: str | None = Field(
        default=None,
        description="Alias webchat opcional para activar el canal desde el alta comercial.",
    )


class PublicTenantBillingResponse(BaseModel):
    ok: bool = True
    tenant_id: UUID
    plan_id: UUID
    price_id: str
    customer_id: str
    checkout_session_id: str
    checkout_url: str


@router.get("/commercial-plans", response_model=PublicCommercialPlansResponse)
async def list_public_commercial_plans(
    repo: PlatformRepository = Depends(get_platform_repo),
) -> PublicCommercialPlansResponse:
    try:
        plans = await repo.list_commercial_plans()
        prices = await repo.list_commercial_plan_prices()
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    active_prices = [
        price
        for price in prices
        if isinstance(price, dict)
        and bool(price.get("active", False))
        and str(price.get("billing_provider") or "").strip().lower() == "stripe"
    ]
    prices_by_plan: dict[str, list[PublicPlanPriceSummary]] = {}
    for price in active_prices:
        try:
            summary = PublicPlanPriceSummary.model_validate(price)
        except Exception:
            continue
        prices_by_plan.setdefault(str(summary.plan_id), []).append(summary)

    items: list[PublicCommercialPlanSummary] = []
    for plan in plans:
        if not isinstance(plan, dict) or not bool(plan.get("active", False)):
            continue
        try:
            plan_summary = PublicCommercialPlanSummary.model_validate(plan)
        except Exception:
            continue
        plan_summary.prices = prices_by_plan.get(str(plan_summary.id), [])
        items.append(plan_summary)

    return PublicCommercialPlansResponse(items=items)


@router.post("/checkout", response_model=PublicTenantBillingResponse)
async def create_public_billing_checkout(
    payload: PublicTenantBillingRequest,
    repo: PlatformRepository = Depends(get_platform_repo),
) -> PublicTenantBillingResponse:
    tenant_id: UUID | None = None
    customer_id = ""
    checkout_url = ""
    session_id = ""
    try:
        if not settings.stripe_checkout_success_url or not settings.stripe_checkout_cancel_url:
            raise HTTPException(status_code=503, detail="stripe_checkout_return_urls_missing")
        price_row = await repo.get_commercial_plan_price_by_provider_price_id(
            provider_price_id=payload.provider_price_id.strip()
        )
        if not price_row:
            raise HTTPException(status_code=404, detail="commercial_plan_price_not_found")
        if not bool(price_row.get("active", False)):
            raise HTTPException(status_code=409, detail="commercial_plan_price_inactive")
        if str(price_row.get("billing_provider") or "").strip().lower() != "stripe":
            raise HTTPException(status_code=400, detail="price_provider_invalid")
        plan_id = UUID(str(price_row.get("plan_id")))
        plan = await repo.get_commercial_plan(plan_id=plan_id)
        if not plan or not bool(plan.get("active", False)):
            raise HTTPException(status_code=409, detail="commercial_plan_inactive")

        alias = payload.webchat_alias.strip().lower() if payload.webchat_alias else None
        await _ensure_webchat_alias_is_available(repo=repo, alias=alias)

        tenant_payload: dict[str, Any] = {
            "nombre": payload.nombre,
            "activo": False,
            "estado_onboarding": "pendiente",
            "nombre_comercial": payload.nombre_comercial or payload.nombre,
            "correo_contacto_principal": payload.correo_contacto_principal,
            "correo_facturacion": payload.correo_facturacion,
            "contacto_nombre": payload.contacto_nombre,
            "contacto_telefono": payload.contacto_telefono,
            "timezone": payload.timezone,
            "idioma": payload.idioma,
            "moneda": payload.moneda,
            "logo_url": payload.logo_url,
            "direccion_fiscal": payload.direccion_fiscal,
            "codigo_postal": payload.codigo_postal,
            "regimen_fiscal": payload.regimen_fiscal,
            "dominio_principal": payload.dominio_principal,
            "rfc": payload.rfc,
            "pais": payload.pais,
            "estado": payload.estado,
            "ciudad": payload.ciudad,
            "telefono": payload.telefono,
            "sitio_web": payload.sitio_web,
        }
        tenant_payload = {key: value for key, value in tenant_payload.items() if value is not None}
        tenant = await repo.create_organizacion(payload=tenant_payload)
        tenant_id = UUID(str(tenant["id"]))

        try:
            current_config = await repo.get_organizacion_config(organizacion_id=tenant_id)
            merged_config = await _ensure_tenant_calendar_bootstrap(
                repo=repo,
                tenant_id=tenant_id,
                tenant_name=payload.nombre,
                current_config=current_config or {},
            )
            await repo.set_organizacion_config(organizacion_id=tenant_id, config=merged_config)
            await _ensure_tenant_pipeline_bootstrap(repo=repo, organizacion_id=tenant_id)
            await repo.create_tenant_billing_account(
                payload={
                    "tenant_id": str(tenant_id),
                    "plan_id": str(plan_id),
                    "billing_provider": "stripe",
                    "stripe_customer_id": f"pending:{tenant_id}",
                    "stripe_price_id": str(price_row.get("provider_price_id")),
                    "billing_status": "incomplete",
                    "access_status": "manual_review",
                }
            )
            if alias:
                await repo.create_channel_route(
                    payload={
                        "organizacion_id": str(tenant_id),
                        "canal": "webchat",
                        "clave": alias,
                        "metadata": {"source": "public.billing.checkout"},
                        "activo": True,
                    }
                )
            await _bootstrap_default_org_structure(repo=repo, organizacion_id=tenant_id)
            customer = await create_stripe_customer(
                name=payload.nombre,
                email=payload.correo_contacto_principal,
                metadata={"tenant_id": str(tenant_id), "plan_id": str(plan_id)},
            )
            customer_id = str(customer.get("id") or "").strip()
            if not customer_id:
                raise HTTPException(status_code=502, detail="stripe_customer_create_failed")
            await repo.update_tenant_billing_account(
                tenant_id=tenant_id,
                payload={
                    "stripe_customer_id": customer_id,
                    "billing_provider": "stripe",
                    "stripe_price_id": str(price_row.get("provider_price_id")),
                },
            )
            session = await create_stripe_checkout_session(
                customer_id=customer_id,
                price_id=str(price_row.get("provider_price_id")),
                success_url=settings.stripe_checkout_success_url,
                cancel_url=settings.stripe_checkout_cancel_url,
                tenant_id=tenant_id,
                plan_id=plan_id,
            )
            checkout_url = str(session.get("url") or "").strip()
            session_id = str(session.get("id") or "").strip()
            if not checkout_url or not session_id:
                raise HTTPException(status_code=502, detail="stripe_checkout_session_invalid")
        except Exception:
            if tenant_id is not None:
                await _delete_created_tenant_best_effort(repo=repo, tenant_id=tenant_id)
            raise
    except StripeApiError as exc:
        if tenant_id is not None:
            await _delete_created_tenant_best_effort(repo=repo, tenant_id=tenant_id)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except PlatformRepositoryError as exc:
        if tenant_id is not None:
            await _delete_created_tenant_best_effort(repo=repo, tenant_id=tenant_id)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return PublicTenantBillingResponse(
        tenant_id=tenant_id,
        plan_id=plan_id,
        price_id=str(price_row["provider_price_id"]),
        customer_id=customer_id,
        checkout_session_id=session_id,
        checkout_url=checkout_url,
    )
