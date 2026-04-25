import uuid
from unittest.mock import AsyncMock

import pytest

from app.core.config import settings
from app.repositories.crm import CRMRepository, _build_prospectos_ids_cache_key


class DummyResponse:
    def __init__(self, payload=None):
        self._payload = payload if payload is not None else []
        self.headers = {}

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


@pytest.mark.asyncio
async def test_list_prospectos_scopes_request_to_organizacion_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role", "service")
    monkeypatch.setattr(settings, "supabase_anon", "anon")

    repo = CRMRepository()
    captured: dict[str, object] = {}

    async def fake_request_with_user(method: str, path: str, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["params"] = kwargs.get("params")
        return DummyResponse([])

    repo._request_with_user = AsyncMock(side_effect=fake_request_with_user)

    org_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    await repo.list_prospectos(usuario_token="token", organizacion_id=org_id, limit=10, offset=0)

    assert captured["method"] == "GET"
    assert captured["path"] == "/rest/v1/prospeccion_prospectos"
    params = captured["params"]
    assert isinstance(params, dict)
    assert params.get("organizacion_id") == f"eq.{org_id}"
    select = params.get("select")
    assert isinstance(select, str)
    assert select != "*"
    assert "display_name" in select
    assert "busqueda_ref" in select
    assert "scraper_ejecutado" not in select
    assert "scraper_ultimo_en" not in select
    assert "contact_indicators" not in select


def test_prospectos_cache_key_includes_organizacion_id() -> None:
    token = "token"
    org_a = uuid.UUID("11111111-1111-1111-1111-111111111111")
    org_b = uuid.UUID("22222222-2222-2222-2222-222222222222")

    key_a = _build_prospectos_ids_cache_key(usuario_token=token, organizacion_id=org_a, suffix="scraper")
    key_b = _build_prospectos_ids_cache_key(usuario_token=token, organizacion_id=org_b, suffix="scraper")

    assert key_a != key_b
