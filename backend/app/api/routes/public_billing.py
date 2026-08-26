"""Rutas públicas para alta comercial y cobro Stripe."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.platform_admin import PlatformRepository, PlatformRepositoryError
from app.services.stripe_billing import (
    StripeApiError,
    confirm_stripe_payment_intent,
    create_stripe_customer,
    create_stripe_payment_intent,
    prepare_stripe_payment_intent_installments,
)
from app.services.supabase_admin import SupabaseAdminError, is_email_registered

from .admin import (
    _bootstrap_default_org_structure,
    _delete_created_tenant_best_effort,
    _ensure_tenant_calendar_bootstrap,
    _ensure_tenant_pipeline_bootstrap,
    _ensure_webchat_alias_is_available,
    get_platform_repo,
)

router = APIRouter(prefix="/public/billing", tags=["public-billing"])
logger = get_logger("app.api.public_billing")
INSTALLMENT_COUNTS = (1, 3, 6, 9, 12)


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
    contract_duration_months: int | None = None
    max_installment_count: int | None = None
    pricing_model: str = "legacy"
    allowed_installment_counts: list[int] = Field(default_factory=list)
    prices: list[PublicPlanPriceSummary] = Field(default_factory=list)


class PublicCommercialPlansResponse(BaseModel):
    ok: bool = True
    items: list[PublicCommercialPlanSummary] = Field(default_factory=list)


class PublicCountrySummary(BaseModel):
    codigo_iso2: str
    nombre: str
    nombre_largo: str | None = None


class PublicCountriesResponse(BaseModel):
    ok: bool = True
    items: list[PublicCountrySummary] = Field(default_factory=list)


class PublicTenantBillingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider_price_id: str = Field(..., min_length=3)
    installment_count: int = Field(default=1, ge=1, le=12)
    nombre: str = Field(..., min_length=2)
    razon_social: str | None = None
    dominio_principal: str | None = None
    rfc: str | None = None
    pais: str | None = None
    pais_codigo_iso2: str | None = Field(default=None, min_length=2, max_length=2)
    estado: str | None = None
    ciudad: str | None = None
    telefono: str | None = None
    sitio_web: str | None = None
    nombre_comercial: str | None = None
    correo_contacto_principal: EmailStr
    correo_facturacion: EmailStr | None = None
    contacto_nombre: str = Field(..., min_length=2, max_length=160)
    contacto_apellidos: str | None = Field(default=None, min_length=2, max_length=160)
    contacto_telefono: str | None = None
    tipo_persona_fiscal: Literal["moral", "pfae"] | None = None
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


@router.get("/countries", response_model=PublicCountriesResponse)
async def list_public_billing_countries(
    repo: PlatformRepository = Depends(get_platform_repo),
) -> PublicCountriesResponse:
    try:
        rows = await repo.list_geo_paises(limit=300)
    except PlatformRepositoryError as exc:
        raise HTTPException(status_code=502, detail="public_billing_countries_unavailable") from exc

    countries: list[PublicCountrySummary] = []
    for row in rows:
        try:
            countries.append(PublicCountrySummary.model_validate(row))
        except Exception:
            continue
    countries.sort(key=lambda item: (item.codigo_iso2 != "MX", item.nombre.casefold()))
    return PublicCountriesResponse(items=countries)


class PublicTenantBillingResponse(BaseModel):
    ok: bool = True
    tenant_id: UUID
    plan_id: UUID
    price_id: str
    customer_id: str
    payment_intent_id: str
    checkout_url: str | None = None
    payment_intent_client_secret: str
    stripe_publishable_key: str
    payment_return_url: str


class PublicPaymentMethodOptionsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tenant_id: UUID
    payment_intent_id: str = Field(..., min_length=8, max_length=100)
    payment_method_id: str = Field(..., min_length=8, max_length=100)


class PublicPaymentMethodOptionsResponse(BaseModel):
    ok: bool = True
    payment_intent_id: str
    available_installment_counts: list[int] = Field(default_factory=list)


class PublicPaymentConfirmationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tenant_id: UUID
    payment_intent_id: str = Field(..., min_length=8, max_length=100)
    installment_count: int = Field(..., ge=1, le=12)


class PublicPaymentConfirmationResponse(BaseModel):
    ok: bool = True
    payment_intent_id: str
    status: str
    client_secret: str | None = None


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
        max_installments = plan_summary.max_installment_count or 1
        plan_summary.allowed_installment_counts = [
            count for count in INSTALLMENT_COUNTS if count <= max_installments
        ]
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
        if not settings.stripe_publishable_key:
            raise HTTPException(status_code=503, detail="stripe_publishable_key_missing")
        price_row = await repo.get_commercial_plan_price_by_provider_price_id(
            provider_price_id=payload.provider_price_id.strip()
        )
        if not price_row:
            raise HTTPException(status_code=404, detail="commercial_plan_price_not_found")
        if not bool(price_row.get("active", False)):
            raise HTTPException(status_code=409, detail="commercial_plan_price_inactive")
        if str(price_row.get("billing_provider") or "").strip().lower() != "stripe":
            raise HTTPException(status_code=400, detail="price_provider_invalid")
        if str(price_row.get("billing_interval") or "").strip().lower() != "one_time":
            raise HTTPException(status_code=409, detail="upfront_price_must_be_one_time")
        try:
            email_exists = await is_email_registered(
                email=str(payload.correo_contacto_principal).strip().lower()
            )
        except SupabaseAdminError as exc:
            logger.error(
                "public_billing_email_validation_failed",
                extra={"error_type": type(exc).__name__},
            )
            raise HTTPException(status_code=503, detail="email_validation_unavailable") from exc
        if email_exists:
            raise HTTPException(status_code=409, detail="email_already_registered")
        country_code = str(payload.pais_codigo_iso2 or "").strip().upper() or "MX"
        country = await repo.get_geo_pais(codigo_iso2=country_code) if payload.pais_codigo_iso2 else None
        if payload.pais_codigo_iso2 and not country:
            raise HTTPException(status_code=400, detail="pais_no_disponible")
        if country_code != "MX" and (payload.rfc or payload.tipo_persona_fiscal):
            raise HTTPException(status_code=400, detail="fiscal_fields_only_for_mexico")
        plan_id = UUID(str(price_row.get("plan_id")))
        plan = await repo.get_commercial_plan(plan_id=plan_id)
        if not plan or not bool(plan.get("active", False)):
            raise HTTPException(status_code=409, detail="commercial_plan_inactive")
        max_installments = int(plan.get("max_installment_count") or 1)
        if payload.installment_count not in INSTALLMENT_COUNTS or payload.installment_count > max_installments:
            raise HTTPException(status_code=400, detail="installment_count_not_allowed")
        license_price = await repo.get_active_commercial_license_price()
        if not license_price:
            raise HTTPException(status_code=503, detail="commercial_license_price_not_configured")

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
            "contacto_apellidos": payload.contacto_apellidos,
            "contacto_telefono": payload.contacto_telefono or payload.telefono,
            "tipo_persona_fiscal": payload.tipo_persona_fiscal if country_code == "MX" else None,
            "timezone": payload.timezone,
            "idioma": payload.idioma,
            "moneda": payload.moneda,
            "logo_url": payload.logo_url,
            "direccion_fiscal": payload.direccion_fiscal,
            "codigo_postal": payload.codigo_postal,
            "regimen_fiscal": payload.regimen_fiscal,
            "dominio_principal": payload.dominio_principal,
            "rfc": payload.rfc,
            "pais": str((country or {}).get("nombre") or payload.pais or "Mexico"),
            "pais_codigo_iso2": country_code,
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
                    "contract_duration_months": int(plan.get("contract_duration_months") or 1),
                    "selected_installment_count": payload.installment_count,
                    "license_price_id": str(license_price.get("id")),
                    "license_status": "pending",
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
            payment_intent = await create_stripe_payment_intent(
                customer_id=customer_id,
                amount_cents=int(price_row.get("amount_cents") or 0),
                currency=str(price_row.get("currency") or "MXN"),
                tenant_id=tenant_id,
                plan_id=plan_id,
                provider_price_id=str(price_row.get("provider_price_id")),
                installment_count=payload.installment_count,
            )
            session_id = str(payment_intent.get("id") or "").strip()
            client_secret = str(payment_intent.get("client_secret") or "").strip()
            if not client_secret or not session_id:
                raise HTTPException(status_code=502, detail="stripe_payment_intent_invalid")
            await repo.update_tenant_billing_account(
                tenant_id=tenant_id,
                payload={"upfront_payment_intent_id": session_id},
            )
        except Exception:
            if tenant_id is not None:
                await _delete_created_tenant_best_effort(repo=repo, tenant_id=tenant_id)
            raise
    except StripeApiError as exc:
        if tenant_id is not None:
            await _delete_created_tenant_best_effort(repo=repo, tenant_id=tenant_id)
        logger.error("public_billing_stripe_failed", extra={"tenant_id": str(tenant_id) if tenant_id else None, "error_type": type(exc).__name__})
        raise HTTPException(status_code=502, detail="stripe_checkout_unavailable") from exc
    except PlatformRepositoryError as exc:
        if tenant_id is not None:
            await _delete_created_tenant_best_effort(repo=repo, tenant_id=tenant_id)
        logger.error("public_billing_repository_failed", extra={"tenant_id": str(tenant_id) if tenant_id else None, "error_type": type(exc).__name__})
        raise HTTPException(status_code=502, detail="billing_provisioning_unavailable") from exc

    return PublicTenantBillingResponse(
        tenant_id=tenant_id,
        plan_id=plan_id,
        price_id=str(price_row["provider_price_id"]),
        customer_id=customer_id,
        payment_intent_id=session_id,
        checkout_url=None,
        payment_intent_client_secret=client_secret,
        stripe_publishable_key=str(settings.stripe_publishable_key),
        payment_return_url=settings.stripe_checkout_success_url,
    )


async def _validate_public_payment_intent_context(
    *, repo: PlatformRepository, tenant_id: UUID, payment_intent_id: str
) -> tuple[dict[str, Any], int]:
    account = await repo.get_tenant_billing_account(tenant_id=tenant_id)
    if not account or str(account.get("upfront_payment_intent_id") or "") != payment_intent_id:
        raise HTTPException(status_code=404, detail="public_payment_intent_not_found")
    plan_id = UUID(str(account.get("plan_id")))
    plan = await repo.get_commercial_plan(plan_id=plan_id)
    if not plan or not bool(plan.get("active", False)):
        raise HTTPException(status_code=409, detail="commercial_plan_inactive")
    return account, int(plan.get("max_installment_count") or 1)


def _stripe_available_installment_counts(payment_intent: dict[str, Any]) -> list[int]:
    counts = {1}
    options = payment_intent.get("payment_method_options")
    if isinstance(options, dict):
        card = options.get("card")
        if isinstance(card, dict):
            installments = card.get("installments")
            if isinstance(installments, dict):
                plans = installments.get("available_plans")
                if isinstance(plans, list):
                    for plan in plans:
                        if isinstance(plan, dict):
                            try:
                                count = int(plan.get("count"))
                            except (TypeError, ValueError):
                                continue
                            if count in INSTALLMENT_COUNTS[1:]:
                                counts.add(count)
    return sorted(counts)


@router.post("/payment-method-options", response_model=PublicPaymentMethodOptionsResponse)
async def prepare_public_payment_method_options(
    payload: PublicPaymentMethodOptionsRequest,
    repo: PlatformRepository = Depends(get_platform_repo),
) -> PublicPaymentMethodOptionsResponse:
    try:
        _, max_installments = await _validate_public_payment_intent_context(
            repo=repo, tenant_id=payload.tenant_id, payment_intent_id=payload.payment_intent_id
        )
        payment_intent = await prepare_stripe_payment_intent_installments(
            payment_intent_id=payload.payment_intent_id,
            payment_method_id=payload.payment_method_id,
        )
    except HTTPException:
        raise
    except (StripeApiError, PlatformRepositoryError) as exc:
        logger.error("public_billing_payment_method_options_failed", extra={"error_type": type(exc).__name__})
        raise HTTPException(status_code=502, detail="stripe_payment_method_options_unavailable") from exc
    counts = [count for count in _stripe_available_installment_counts(payment_intent) if count <= max_installments]
    return PublicPaymentMethodOptionsResponse(
        payment_intent_id=payload.payment_intent_id, available_installment_counts=counts
    )


@router.post("/confirm-payment", response_model=PublicPaymentConfirmationResponse)
async def confirm_public_payment(
    payload: PublicPaymentConfirmationRequest,
    repo: PlatformRepository = Depends(get_platform_repo),
) -> PublicPaymentConfirmationResponse:
    try:
        _, max_installments = await _validate_public_payment_intent_context(
            repo=repo, tenant_id=payload.tenant_id, payment_intent_id=payload.payment_intent_id
        )
        if payload.installment_count not in INSTALLMENT_COUNTS or payload.installment_count > max_installments:
            raise HTTPException(status_code=400, detail="installment_count_not_allowed")
        payment_intent = await confirm_stripe_payment_intent(
            payment_intent_id=payload.payment_intent_id,
            installment_count=payload.installment_count,
            return_url=settings.stripe_checkout_success_url,
        )
    except HTTPException:
        raise
    except (StripeApiError, PlatformRepositoryError) as exc:
        logger.error("public_billing_payment_confirmation_failed", extra={"error_type": type(exc).__name__})
        raise HTTPException(status_code=502, detail="stripe_payment_confirmation_unavailable") from exc
    return PublicPaymentConfirmationResponse(
        payment_intent_id=payload.payment_intent_id,
        status=str(payment_intent.get("status") or "unknown"),
        client_secret=str(payment_intent.get("client_secret") or "") or None,
    )
