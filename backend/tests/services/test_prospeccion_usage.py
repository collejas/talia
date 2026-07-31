"""Pruebas del runtime comercial mensual de prospección."""

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import pytest

from app.services.prospeccion_usage import (
    CREDITS_KEY,
    RAW_RESULTS_KEY,
    ProspeccionUsageError,
    resolve_prospeccion_usage,
)

TENANT_ID = UUID("cc0b0c64-ef9c-4dbd-bf6a-faeb401922b8")
NOW = datetime(2026, 7, 15, 12, tzinfo=timezone.utc)


class FakeProspeccionUsageRepository:
    def __init__(self, context: dict[str, Any]) -> None:
        self.context = context
        self.calls: list[dict[str, Any]] = []

    async def get_prospeccion_commercial_context(
        self,
        *,
        organizacion_id: UUID,
        now: datetime,
    ) -> dict[str, Any]:
        self.calls.append({"organizacion_id": organizacion_id, "now": now})
        return self.context


def _context() -> dict[str, Any]:
    return {
        "billing": {
            "plan_id": "8f386e33-e69f-4380-ae67-f0ceaa1a4130",
            "access_status": "active",
            "current_period_start": "2026-07-05T00:00:00+00:00",
            "current_period_end": "2026-08-05T00:00:00+00:00",
        },
        "plan": {"code": "starter", "name": "Starter", "active": True},
        "entitlements": [
            {
                "entitlement_key": CREDITS_KEY,
                "enabled": True,
                "limit_value": 9000,
            },
            {
                "entitlement_key": RAW_RESULTS_KEY,
                "enabled": True,
                "limit_value": 50000,
            },
        ],
        "policy": {"required_contact_mode": "both"},
        "overrides": [],
        "usage_period": {
            "credits_consumed": 3210,
            "raw_results_consumed": 12000,
        },
    }


@pytest.mark.asyncio
async def test_resolves_billing_period_and_persisted_usage() -> None:
    repo = FakeProspeccionUsageRepository(_context())

    result = await resolve_prospeccion_usage(
        repo=repo,
        organizacion_id=TENANT_ID,
        now=NOW,
    )

    assert result["plan"]["code"] == "starter"
    assert result["required_contact_mode"] == "any"
    assert result["period"] == {
        "start": "2026-07-05T00:00:00+00:00",
        "end": "2026-08-05T00:00:00+00:00",
        "source": "billing",
        "persisted": True,
    }
    assert result["credits"] == {
        "limit": 9000,
        "consumed": 3210,
        "remaining": 5790,
        "usage_percentage": 35.67,
    }
    assert result["raw_results"]["remaining"] == 38000
    assert repo.calls[0]["organizacion_id"] == TENANT_ID


@pytest.mark.asyncio
async def test_active_override_takes_precedence_and_calendar_is_fallback() -> None:
    context = _context()
    context["billing"]["current_period_start"] = None
    context["billing"]["current_period_end"] = None
    context["overrides"] = [
        {"override_key": CREDITS_KEY, "override_value": "12000"},
    ]
    context["usage_period"] = None
    repo = FakeProspeccionUsageRepository(context)

    result = await resolve_prospeccion_usage(
        repo=repo,
        organizacion_id=TENANT_ID,
        now=NOW,
    )

    assert result["credits"]["limit"] == 12000
    assert result["credits"]["remaining"] == 12000
    assert result["period"]["source"] == "calendar_utc"
    assert result["period"]["start"] == "2026-07-01T00:00:00+00:00"
    assert result["period"]["end"] == "2026-08-01T00:00:00+00:00"


@pytest.mark.asyncio
async def test_missing_plan_is_reported_as_commercial_configuration_error() -> None:
    context = _context()
    context["billing"] = None
    repo = FakeProspeccionUsageRepository(context)

    with pytest.raises(ProspeccionUsageError, match="prospeccion_plan_not_configured"):
        await resolve_prospeccion_usage(
            repo=repo,
            organizacion_id=TENANT_ID,
            now=NOW,
        )


@pytest.mark.asyncio
async def test_fractional_monthly_limit_is_rejected() -> None:
    context = _context()
    context["entitlements"][0]["limit_value"] = "9000.5"
    repo = FakeProspeccionUsageRepository(context)

    with pytest.raises(ProspeccionUsageError, match="prospeccion_entitlement_invalid"):
        await resolve_prospeccion_usage(
            repo=repo,
            organizacion_id=TENANT_ID,
            now=NOW,
        )
