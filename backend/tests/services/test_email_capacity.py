from uuid import UUID

import pytest

from app.services import email_capacity
from app.services.brevo_quota import BrevoQuotaSnapshot


ORG_ID = UUID("3dbb2a99-9d81-4233-8444-0990d53b93b3")


class FakeCRMRepository:
    async def count_pending_email_envios_for_local_day(self, **_kwargs):
        return 4


@pytest.mark.asyncio
async def test_postmark_capacity_is_monthly_and_does_not_call_brevo(monkeypatch) -> None:
    class FakePostmarkRepository:
        async def get_migration(self, **_kwargs):
            return {"status": "active", "feature_enabled": True}

        async def get_active_plan(self, **_kwargs):
            return {"period_limit": 10000}

        async def get_current_usage(self, **_kwargs):
            return {
                "period_start": "2026-09-01T00:00:00+00:00",
                "period_end": "2026-10-01T00:00:00+00:00",
                "reserved_recipients": 120,
                "released_recipients": 20,
            }

    async def fail_brevo(**_kwargs):
        raise AssertionError("Brevo no debe consultarse para un tenant Postmark")

    monkeypatch.setattr(email_capacity, "PostmarkRepository", FakePostmarkRepository)
    monkeypatch.setattr(email_capacity, "fetch_brevo_daily_quota", fail_brevo)

    result = await email_capacity.resolve_prospeccion_email_capacity(
        repo=FakeCRMRepository(),
        organizacion_id=ORG_ID,
        user_token="token",
        timezone_name="Etc/UTC",
    )

    assert result["period_kind"] == "monthly"
    assert result["limit"] == 10000
    assert result["sent"] == 100
    assert result["remaining"] == 9900


@pytest.mark.asyncio
async def test_brevo_capacity_is_daily_for_non_postmark_tenant(monkeypatch) -> None:
    class FakePostmarkRepository:
        async def get_migration(self, **_kwargs):
            return {"status": "pending", "feature_enabled": False}

    class FakeBrevoSettings:
        api_key = "configured"
        base_url = "https://api.brevo.test/v3"

    async def fake_brevo(**_kwargs):
        return BrevoQuotaSnapshot(
            sent_today=40,
            daily_limit=300,
            remaining=260,
            usage_pct=13.33,
            plan_type="free",
            plan_credits=260,
            warnings=[],
        )

    async def fake_brevo_settings(**_kwargs):
        return FakeBrevoSettings()

    monkeypatch.setattr(email_capacity, "PostmarkRepository", FakePostmarkRepository)
    monkeypatch.setattr(email_capacity, "fetch_brevo_daily_quota", fake_brevo)
    monkeypatch.setattr(email_capacity.tenant_runtime, "get_brevo_runtime_settings", fake_brevo_settings)

    result = await email_capacity.resolve_prospeccion_email_capacity(
        repo=FakeCRMRepository(),
        organizacion_id=ORG_ID,
        user_token="token",
        timezone_name="Etc/UTC",
    )

    assert result["period_kind"] == "daily"
    assert result["limit"] == 300
    assert result["sent"] == 40
    assert result["scheduled"] == 4
    assert result["remaining"] == 256
