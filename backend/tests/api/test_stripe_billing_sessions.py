"""Pruebas de generación de checkout y portal Stripe para billing comercial."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from httpx import AsyncClient

from app.api.routes.admin import get_platform_repo, require_master_tenant_owner
from app.core.config import settings
from app.main import app


TEST_PLATFORM_ADMIN_ID = UUID("00000000-0000-0000-0000-000000000001")
TEST_TENANT_ID = UUID("22222222-2222-2222-2222-222222222222")
TEST_PLAN_ID = UUID("11111111-1111-1111-1111-111111111111")


class DummyBillingRepo:
    def __init__(self, *, billing_account: dict[str, Any] | None = None, tenant: dict[str, Any] | None = None) -> None:
        self.billing_account = billing_account
        self.tenant = tenant or {"id": str(TEST_TENANT_ID), "nombre": "Cliente X"}
        self.created_accounts: list[dict[str, Any]] = []
        self.updated_accounts: list[dict[str, Any]] = []

    async def get_organizacion_details(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        if str(organizacion_id) != str(TEST_TENANT_ID):
            return None
        return self.tenant

    async def get_tenant_billing_account(self, *, tenant_id: UUID) -> dict[str, Any] | None:
        if str(tenant_id) != str(TEST_TENANT_ID):
            return None
        return self.billing_account

    async def list_commercial_plan_prices(self) -> list[dict[str, Any]]:
        return [
            {
                "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "plan_id": str(TEST_PLAN_ID),
                "billing_provider": "stripe",
                "provider_product_id": "prod_test_1",
                "provider_price_id": "price_test_1",
                "currency": "mxn",
                "billing_interval": "month",
                "amount_cents": 100,
                "active": True,
            }
        ]

    async def create_tenant_billing_account(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        self.created_accounts.append(payload)
        self.billing_account = payload
        return payload

    async def update_tenant_billing_account(self, *, tenant_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
        self.updated_accounts.append({"tenant_id": str(tenant_id), "payload": payload})
        if self.billing_account is None:
            self.billing_account = {}
        self.billing_account.update(payload)
        return self.billing_account


@pytest.fixture
def clear_overrides() -> None:
    yield
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_tenant_billing_checkout_session_bootstraps_customer(
    monkeypatch: pytest.MonkeyPatch,
    async_client: AsyncClient,
    clear_overrides: None,
) -> None:
    repo = DummyBillingRepo(
        billing_account={
            "tenant_id": str(TEST_TENANT_ID),
            "plan_id": str(TEST_PLAN_ID),
            "billing_provider": "internal",
            "stripe_customer_id": f"internal:{TEST_TENANT_ID}",
            "stripe_price_id": None,
        }
    )
    app.dependency_overrides[require_master_tenant_owner] = lambda: TEST_PLATFORM_ADMIN_ID
    app.dependency_overrides[get_platform_repo] = lambda: repo
    monkeypatch.setattr(
        "app.api.routes.admin.create_stripe_customer",
        AsyncMock(return_value={"id": "cus_test_1"}),
    )
    monkeypatch.setattr(
        "app.api.routes.admin.create_stripe_checkout_session",
        AsyncMock(return_value={"id": "cs_test_1", "url": "https://checkout.stripe.test/session"}),
    )
    monkeypatch.setattr(settings, "stripe_checkout_success_url", "https://app.test/success")
    monkeypatch.setattr(settings, "stripe_checkout_cancel_url", "https://app.test/cancel")

    response = await async_client.post(
        f"/admin/tenants/{TEST_TENANT_ID}/billing/checkout-session",
        json={},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["url"] == "https://checkout.stripe.test/session"
    assert body["session_id"] == "cs_test_1"
    assert body["customer_id"] == "cus_test_1"
    assert body["price_id"] == "price_test_1"
    assert repo.created_accounts == []
    assert repo.updated_accounts[0]["payload"]["billing_provider"] == "stripe"
    assert repo.updated_accounts[0]["payload"]["stripe_customer_id"] == "cus_test_1"
    assert repo.updated_accounts[0]["payload"]["stripe_price_id"] == "price_test_1"


@pytest.mark.asyncio
async def test_create_tenant_billing_portal_session(
    monkeypatch: pytest.MonkeyPatch,
    async_client: AsyncClient,
    clear_overrides: None,
) -> None:
    repo = DummyBillingRepo(
        billing_account={
            "tenant_id": str(TEST_TENANT_ID),
            "plan_id": str(TEST_PLAN_ID),
            "billing_provider": "stripe",
            "stripe_customer_id": "cus_test_2",
            "stripe_price_id": "price_test_2",
        }
    )
    app.dependency_overrides[require_master_tenant_owner] = lambda: TEST_PLATFORM_ADMIN_ID
    app.dependency_overrides[get_platform_repo] = lambda: repo
    monkeypatch.setattr(
        "app.api.routes.admin.create_stripe_portal_session",
        AsyncMock(return_value={"id": "bps_test_1", "url": "https://portal.stripe.test/session"}),
    )
    monkeypatch.setattr(settings, "stripe_portal_return_url", "https://app.test/account")

    response = await async_client.post(
        f"/admin/tenants/{TEST_TENANT_ID}/billing/portal-session",
        json={},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["url"] == "https://portal.stripe.test/session"
    assert body["customer_id"] == "cus_test_2"
