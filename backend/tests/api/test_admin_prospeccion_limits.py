from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient

from app.api.routes.admin import get_platform_repo, require_platform_admin
from app.main import app

ACTOR_ID = UUID("00000000-0000-0000-0000-000000000001")


class ProspeccionAdminRepo:
    def __init__(self) -> None:
        self.plan_id = uuid4()
        self.tenant_id = uuid4()
        self.plan_payload: dict[str, Any] | None = None
        self.tenant_payload: dict[str, Any] | None = None

    async def get_commercial_plan(self, *, plan_id: UUID) -> dict[str, Any] | None:
        return {
            "id": str(plan_id),
            "code": "starter",
            "name": "Starter",
            "description": None,
            "active": True,
            "sort_order": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

    async def list_commercial_plan_entitlements(self) -> list[dict[str, Any]]:
        return [
            {
                "plan_id": str(self.plan_id),
                "entitlement_key": "limit.prospeccion.credits_month",
                "enabled": True,
                "limit_value": 9000,
            },
            {
                "plan_id": str(self.plan_id),
                "entitlement_key": "limit.prospeccion.denue_raw_results_month",
                "enabled": True,
                "limit_value": 50000,
            },
        ]

    async def set_prospeccion_plan_limits(self, **payload: Any) -> None:
        self.plan_payload = payload

    async def set_tenant_prospeccion_limits(self, **payload: Any) -> None:
        self.tenant_payload = payload

    async def get_tenant_prospeccion_settings(self, *, tenant_id: UUID) -> dict[str, Any]:
        return {
            "plan": await self.get_commercial_plan(plan_id=self.plan_id),
            "entitlements": await self.list_commercial_plan_entitlements(),
            "overrides": [],
            "policy": {"required_contact_mode": "both"},
            "period": {
                "period_start": datetime(2026, 7, 1, tzinfo=UTC).isoformat(),
                "period_end": datetime(2026, 8, 1, tzinfo=UTC).isoformat(),
                "credits_limit": 9000,
                "credits_consumed": 125,
                "raw_results_limit": 50000,
                "raw_results_consumed": 800,
            },
        }


@pytest.fixture
def prospeccion_repo() -> ProspeccionAdminRepo:
    repo = ProspeccionAdminRepo()
    app.dependency_overrides[require_platform_admin] = lambda: ACTOR_ID
    app.dependency_overrides[get_platform_repo] = lambda: repo
    yield repo
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_update_plan_prospeccion_limits(
    async_client: AsyncClient,
    prospeccion_repo: ProspeccionAdminRepo,
) -> None:
    response = await async_client.put(
        f"/admin/commercial-plans/{prospeccion_repo.plan_id}/prospeccion-limits",
        json={"credits_month": 12000, "denue_raw_results_month": 60000},
    )

    assert response.status_code == 200
    assert response.json()["credits_month"] == 12000
    assert prospeccion_repo.plan_payload == {
        "actor_id": ACTOR_ID,
        "plan_id": prospeccion_repo.plan_id,
        "credits_month": 12000,
        "denue_raw_results_month": 60000,
    }


@pytest.mark.asyncio
async def test_update_tenant_prospeccion_override_requires_reason(
    async_client: AsyncClient,
    prospeccion_repo: ProspeccionAdminRepo,
) -> None:
    response = await async_client.put(
        f"/admin/tenants/{prospeccion_repo.tenant_id}/prospeccion-limits",
        json={
            "required_contact_mode": "email",
            "credits_month_override": 12000,
            "denue_raw_results_month_override": None,
            "reason": None,
        },
    )

    assert response.status_code == 422
    assert prospeccion_repo.tenant_payload is None


@pytest.mark.asyncio
async def test_update_tenant_prospeccion_limits_returns_usage(
    async_client: AsyncClient,
    prospeccion_repo: ProspeccionAdminRepo,
) -> None:
    response = await async_client.put(
        f"/admin/tenants/{prospeccion_repo.tenant_id}/prospeccion-limits",
        json={
            "required_contact_mode": "both",
            "credits_month_override": None,
            "denue_raw_results_month_override": None,
            "reason": None,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["required_contact_mode"] == "both"
    assert payload["usage"]["credits_remaining"] == 8875
    assert prospeccion_repo.tenant_payload is not None
