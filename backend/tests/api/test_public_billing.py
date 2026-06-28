"""Pruebas de la ruta pública de billing Stripe."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from httpx import AsyncClient

from app.api.routes.admin import get_platform_repo
from app.core.config import settings
from app.main import app


TEST_TENANT_ID = UUID("33333333-3333-3333-3333-333333333333")
TEST_PLAN_ID = UUID("11111111-1111-1111-1111-111111111111")
TEST_PRICE_ID = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")


class DummyPublicBillingRepo:
    def __init__(self) -> None:
        self.created_organizations: list[dict[str, Any]] = []
        self.billing_accounts: list[dict[str, Any]] = []
        self.updated_accounts: list[dict[str, Any]] = []
        self.routes: list[dict[str, Any]] = []
        self.departments: list[str] = []
        self.positions: list[str] = []
        self.deleted_organizations: list[str] = []

    async def list_commercial_plans(self) -> list[dict[str, Any]]:
        return [
            {
                "id": str(TEST_PLAN_ID),
                "code": "starter",
                "name": "Starter",
                "description": "Plan starter",
                "active": True,
                "sort_order": 1,
            }
        ]

    async def list_commercial_plan_prices(self) -> list[dict[str, Any]]:
        return [
            {
                "id": str(TEST_PRICE_ID),
                "plan_id": str(TEST_PLAN_ID),
                "billing_provider": "stripe",
                "provider_product_id": "prod_starter",
                "provider_price_id": "price_starter_mxn_month",
                "currency": "MXN",
                "billing_interval": "month",
                "amount_cents": 100,
                "active": True,
            }
        ]

    async def get_commercial_plan_price_by_provider_price_id(self, *, provider_price_id: str) -> dict[str, Any] | None:
        if provider_price_id != "price_starter_mxn_month":
            return None
        return (await self.list_commercial_plan_prices())[0]

    async def get_commercial_plan(self, *, plan_id: UUID) -> dict[str, Any] | None:
        if str(plan_id) != str(TEST_PLAN_ID):
            return None
        return {"id": str(plan_id), "code": "starter", "name": "Starter", "active": True}

    async def resolve_org_for_route(self, *, canal: str, clave: str) -> str | None:
        return None

    async def create_organizacion(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        self.created_organizations.append(payload)
        return {"id": str(TEST_TENANT_ID), **payload}

    async def delete_organizacion(self, *, organizacion_id: UUID) -> None:
        self.deleted_organizations.append(str(organizacion_id))

    async def get_organizacion_config(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        return {}

    async def set_organizacion_config(self, *, organizacion_id: UUID, config: dict[str, Any]) -> dict[str, Any]:
        return {"id": str(organizacion_id), "config": config}

    async def create_calendar_resource(
        self,
        *,
        organizacion_id: UUID,
        name: str,
        slug: str,
        timezone: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {"id": "calendar-resource-1"}

    async def list_pipeline_stages(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        return []

    async def create_pipeline_stage(
        self,
        *,
        organizacion_id: UUID,
        codigo: str,
        nombre: str,
        orden: int,
        probabilidad: float | None = None,
        categoria: str = "abierta",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {"id": f"stage-{codigo}"}

    async def create_tenant_billing_account(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        self.billing_accounts.append(payload)
        return payload

    async def update_tenant_billing_account(self, *, tenant_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
        self.updated_accounts.append({"tenant_id": str(tenant_id), "payload": payload})
        return payload

    async def create_channel_route(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        self.routes.append(payload)
        return {"id": "route-1", **payload}

    async def list_tenant_bootstrap_catalog(self, *, tipo: str) -> list[str]:
        if tipo == "departamento":
            return ["Administración"]
        if tipo == "puesto":
            return ["Admin CRM"]
        return []

    async def create_department(self, *, organizacion_id: UUID, nombre: str) -> dict[str, Any]:
        self.departments.append(nombre)
        return {"id": f"dept-{nombre}"}

    async def create_position(self, *, organizacion_id: UUID, nombre: str) -> dict[str, Any]:
        self.positions.append(nombre)
        return {"id": f"pos-{nombre}"}


@pytest.fixture
def clear_overrides() -> None:
    yield
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_public_commercial_plans(async_client: AsyncClient, clear_overrides: None) -> None:
    repo = DummyPublicBillingRepo()
    app.dependency_overrides[get_platform_repo] = lambda: repo

    try:
        response = await async_client.get("/public/billing/commercial-plans")
    finally:
        app.dependency_overrides.pop(get_platform_repo, None)

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["items"][0]["code"] == "starter"
    assert body["items"][0]["prices"][0]["provider_price_id"] == "price_starter_mxn_month"


@pytest.mark.asyncio
async def test_create_public_billing_checkout(
    monkeypatch: pytest.MonkeyPatch,
    async_client: AsyncClient,
    clear_overrides: None,
) -> None:
    repo = DummyPublicBillingRepo()
    app.dependency_overrides[get_platform_repo] = lambda: repo
    monkeypatch.setattr(settings, "stripe_checkout_success_url", "https://app.test/success")
    monkeypatch.setattr(settings, "stripe_checkout_cancel_url", "https://app.test/cancel")
    monkeypatch.setattr(
        "app.api.routes.public_billing.create_stripe_customer",
        AsyncMock(return_value={"id": "cus_test_public"}),
    )
    monkeypatch.setattr(
        "app.api.routes.public_billing.create_stripe_checkout_session",
        AsyncMock(return_value={"id": "cs_test_public", "url": "https://checkout.stripe.test/session"}),
    )

    payload = {
        "provider_price_id": "price_starter_mxn_month",
        "nombre": "Cliente Público",
        "correo_contacto_principal": "hola@cliente.test",
        "dominio_principal": "cliente.test",
        "moneda": "MXN",
        "timezone": "America/Mexico_City",
        "webchat_alias": "cliente-publico",
    }

    try:
        response = await async_client.post("/public/billing/checkout", json=payload)
    finally:
        app.dependency_overrides.pop(get_platform_repo, None)

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["tenant_id"] == str(TEST_TENANT_ID)
    assert body["customer_id"] == "cus_test_public"
    assert body["checkout_session_id"] == "cs_test_public"
    assert body["checkout_url"] == "https://checkout.stripe.test/session"
    assert repo.created_organizations[0]["activo"] is False
    assert repo.billing_accounts[0]["stripe_customer_id"].startswith("pending:")
    assert repo.updated_accounts[0]["payload"]["stripe_customer_id"] == "cus_test_public"
