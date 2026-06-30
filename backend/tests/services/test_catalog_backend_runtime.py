from uuid import uuid4

import pytest

from app.services import tenant_runtime


@pytest.mark.asyncio
async def test_is_catalog_inmobiliario_enabled_defaults_true(monkeypatch):
    org_id = uuid4()

    async def fake_get_org_config(*, organizacion_id):
        assert organizacion_id == org_id
        return {}

    monkeypatch.setattr(tenant_runtime, "get_org_config", fake_get_org_config)

    enabled = await tenant_runtime.is_catalog_inmobiliario_enabled(organizacion_id=org_id, channel="whatsapp")
    assert enabled is True


@pytest.mark.asyncio
async def test_is_catalog_no_inmobiliario_enabled_reads_tenant_flag(monkeypatch):
    org_id = uuid4()

    async def fake_get_org_config(*, organizacion_id):
        assert organizacion_id == org_id
        return {"features": {"catalog_no_inmobiliario": {"enabled": False}}}

    monkeypatch.setattr(tenant_runtime, "get_org_config", fake_get_org_config)

    enabled = await tenant_runtime.is_catalog_no_inmobiliario_enabled(organizacion_id=org_id, channel="webchat")
    assert enabled is False
