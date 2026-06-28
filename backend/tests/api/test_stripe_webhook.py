"""Pruebas del webhook Stripe de billing comercial."""

from __future__ import annotations

import hmac
import json
import time
from hashlib import sha256
from typing import Any
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from app.api.routes.admin import get_platform_repo
from app.core.config import settings
from app.main import app


def _build_signature(secret: str, payload: bytes, timestamp: int | None = None) -> str:
    timestamp = int(time.time()) if timestamp is None else timestamp
    signed_payload = f"{timestamp}.{payload.decode('utf-8')}".encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), signed_payload, sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


class DummyStripeRepo:
    def __init__(
        self,
        *,
        existing_event: dict[str, Any] | None = None,
        price_row: dict[str, Any] | None = None,
        account_by_customer: dict[str, Any] | None = None,
        account_by_subscription: dict[str, Any] | None = None,
    ) -> None:
        self.existing_event = existing_event
        self.price_row = price_row
        self.account_by_customer = account_by_customer
        self.account_by_subscription = account_by_subscription
        self.event_upserts: list[dict[str, Any]] = []
        self.account_updates: list[dict[str, Any]] = []
        self.event_processed: list[dict[str, Any]] = []
        self.event_failed: list[dict[str, Any]] = []

    async def get_tenant_billing_event_by_stripe_event_id(self, *, stripe_event_id: str) -> dict[str, Any] | None:
        return self.existing_event

    async def get_tenant_billing_account_by_stripe_customer(self, *, stripe_customer_id: str) -> dict[str, Any] | None:
        return self.account_by_customer

    async def get_tenant_billing_account_by_stripe_subscription(
        self, *, stripe_subscription_id: str
    ) -> dict[str, Any] | None:
        return self.account_by_subscription

    async def get_tenant_billing_account(self, *, tenant_id):  # noqa: ANN001
        return None

    async def get_commercial_plan_price_by_provider_price_id(self, *, provider_price_id: str):
        return self.price_row

    async def upsert_tenant_billing_event(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        self.event_upserts.append(payload)
        return payload

    async def update_tenant_billing_account(self, *, tenant_id, payload: dict[str, Any]):  # noqa: ANN001
        self.account_updates.append({"tenant_id": str(tenant_id), "payload": payload})
        return payload

    async def mark_tenant_billing_event_processed(self, *, stripe_event_id: str, processed_at: str) -> None:
        self.event_processed.append({"stripe_event_id": stripe_event_id, "processed_at": processed_at})

    async def mark_tenant_billing_event_failed(self, *, stripe_event_id: str, processing_error: str) -> None:
        self.event_failed.append({"stripe_event_id": stripe_event_id, "processing_error": processing_error})


@pytest.mark.asyncio
async def test_stripe_webhook_updates_billing_account(monkeypatch: pytest.MonkeyPatch, async_client: AsyncClient) -> None:
    secret = "whsec_test_secret"
    monkeypatch.setattr(settings, "stripe_webhook_secret", secret)
    repo = DummyStripeRepo(
        price_row={"plan_id": "11111111-1111-1111-1111-111111111111"},
    )
    app.dependency_overrides[get_platform_repo] = lambda: repo
    monkeypatch.setattr(
        "app.services.stripe_billing.provision_tenant_from_billing",
        AsyncMock(return_value={"ok": True}),
    )

    payload = {
        "id": "evt_test_1",
        "type": "customer.subscription.updated",
        "created": 1_700_000_000,
        "data": {
            "object": {
                "id": "sub_test_1",
                "customer": "cus_test_1",
                "status": "trialing",
                "current_period_start": 1_700_000_000,
                "current_period_end": 1_700_086_400,
                "trial_end": 1_700_086_400,
                "items": {
                    "data": [
                        {
                            "price": {
                                "id": "price_test_1",
                            }
                        }
                    ]
                },
                "metadata": {
                    "tenant_id": "22222222-2222-2222-2222-222222222222",
                },
            }
        },
    }
    raw_payload = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = _build_signature(secret, raw_payload)

    try:
        response = await async_client.post(
            "/webhooks/stripe",
            content=raw_payload,
            headers={"Stripe-Signature": signature},
        )
    finally:
        app.dependency_overrides.pop(get_platform_repo, None)

    assert response.status_code == 200
    body = response.json()
    assert body["accepted"] is True
    assert body["processed"] is True
    assert body["tenant_id"] == "22222222-2222-2222-2222-222222222222"
    assert repo.event_upserts[0]["stripe_event_id"] == "evt_test_1"
    assert repo.account_updates[0]["payload"]["plan_id"] == "11111111-1111-1111-1111-111111111111"
    assert repo.account_updates[0]["payload"]["billing_status"] == "trialing"
    assert repo.account_updates[0]["payload"]["access_status"] == "active"
    assert repo.event_processed[0]["stripe_event_id"] == "evt_test_1"


@pytest.mark.asyncio
async def test_stripe_webhook_skips_duplicate_events(
    monkeypatch: pytest.MonkeyPatch, async_client: AsyncClient
) -> None:
    secret = "whsec_test_secret"
    monkeypatch.setattr(settings, "stripe_webhook_secret", secret)
    repo = DummyStripeRepo(
        existing_event={
            "processed_at": "2026-06-28T00:00:00+00:00",
        },
        account_by_customer={
            "tenant_id": "22222222-2222-2222-2222-222222222222",
            "plan_id": "11111111-1111-1111-1111-111111111111",
            "stripe_customer_id": "cus_test_1",
        },
    )
    app.dependency_overrides[get_platform_repo] = lambda: repo
    monkeypatch.setattr(
        "app.services.stripe_billing.provision_tenant_from_billing",
        AsyncMock(return_value={"ok": True}),
    )

    payload = {
        "id": "evt_test_2",
        "type": "invoice.paid",
        "created": 1_700_000_000,
        "data": {
            "object": {
                "id": "in_test_1",
                "customer": "cus_test_1",
                "subscription": "sub_test_1",
            }
        },
    }
    raw_payload = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = _build_signature(secret, raw_payload)

    try:
        response = await async_client.post(
            "/webhooks/stripe",
            content=raw_payload,
            headers={"Stripe-Signature": signature},
        )
    finally:
        app.dependency_overrides.pop(get_platform_repo, None)

    assert response.status_code == 200
    body = response.json()
    assert body["duplicate"] is True
    assert repo.event_upserts == []
    assert repo.account_updates == []
