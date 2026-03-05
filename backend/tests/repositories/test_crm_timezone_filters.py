import uuid
from unittest.mock import AsyncMock

import pytest

from app.core.config import settings
from app.repositories.crm import CRMRepository


class DummyResponse:
    def __init__(self, payload=None):
        self._payload = payload if payload is not None else []

    def json(self):
        return self._payload


@pytest.mark.asyncio
async def test_list_opportunities_builds_combined_and_filters() -> None:
    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_service_role = "service"
    settings.supabase_anon = "anon"
    repo = CRMRepository()
    captured: dict[str, object] = {}

    async def fake_request(method: str, path: str, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["params"] = kwargs.get("params")
        return DummyResponse([])

    repo._request = AsyncMock(side_effect=fake_request)

    await repo.list_opportunities(
        organizacion_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        monto_min=10.0,
        monto_max=20.0,
        cierre_desde="2026-03-04T10:00:00+00:00",
        cierre_hasta="2026-03-05T09:59:59.999999+00:00",
        creado_desde="2026-03-04T10:00:00+00:00",
        creado_hasta="2026-03-05T09:59:59.999999+00:00",
    )

    assert captured["method"] == "GET"
    assert captured["path"] == "/rest/v1/oportunidades"
    params = captured["params"]
    assert isinstance(params, dict)
    and_clause = params.get("and")
    assert isinstance(and_clause, str)
    assert "monto_estimado.gte.10.0" in and_clause
    assert "monto_estimado.lte.20.0" in and_clause
    assert "fecha_cierre_probable.gte.2026-03-04T10:00:00+00:00" in and_clause
    assert "fecha_cierre_probable.lte.2026-03-05T09:59:59.999999+00:00" in and_clause
    assert "creado_en.gte.2026-03-04T10:00:00+00:00" in and_clause
    assert "creado_en.lte.2026-03-05T09:59:59.999999+00:00" in and_clause


@pytest.mark.asyncio
async def test_whatsapp_metrics_filters_use_raw_iso_and_and_clause() -> None:
    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_service_role = "service"
    settings.supabase_anon = "anon"
    repo = CRMRepository()
    captured: dict[str, object] = {}

    async def fake_request_with_user(method: str, path: str, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["params"] = kwargs.get("params")
        return DummyResponse([])

    repo._request_with_user = AsyncMock(side_effect=fake_request_with_user)

    await repo.list_whatsapp_atribucion_eventos_for_metrics(
        usuario_token="token",
        date_from_iso="2026-03-04T10:00:00+00:00",
        date_to_iso="2026-03-05T09:59:59.999999+00:00",
        limit=10,
    )

    assert captured["method"] == "GET"
    assert captured["path"] == "/rest/v1/prospeccion_whatsapp_atribucion_eventos"
    params = captured["params"]
    assert isinstance(params, dict)
    and_clause = params.get("and")
    assert isinstance(and_clause, str)
    assert "creado_en.gte.2026-03-04T10:00:00+00:00" in and_clause
    assert "creado_en.lte.2026-03-05T09:59:59.999999+00:00" in and_clause
    assert "%3A" not in and_clause
    assert "%2B" not in and_clause
