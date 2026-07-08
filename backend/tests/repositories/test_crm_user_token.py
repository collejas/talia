import uuid
from unittest.mock import AsyncMock

import pytest

from app.core.config import settings
from app.repositories.crm import CRMRepository


class DummyResponse:
    def __init__(self, payload=None, status_code=200):
        self._payload = payload or {}
        self.status_code = status_code

    def json(self):
        return self._payload


@pytest.mark.asyncio
async def test_request_prefers_user_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role", "service")
    monkeypatch.setattr(settings, "supabase_anon", "anon")

    repo = CRMRepository(user_token="user-token")
    calls = {}

    async def fake_request_with_user(*args, **kwargs):
        calls["args"] = args
        calls["kwargs"] = kwargs
        return DummyResponse()

    repo._request_with_user = AsyncMock(side_effect=fake_request_with_user)

    await repo._request(
        "GET",
        "/rest/v1/contactos",
        params={"limit": "1"},
        organizacion_id=uuid.uuid4(),
    )

    assert repo._request_with_user.called
    assert calls["kwargs"]["token"] == "user-token"
    assert calls["args"][1] == "/rest/v1/contactos"


@pytest.mark.asyncio
async def test_rpc_prefers_user_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role", "service")
    monkeypatch.setattr(settings, "supabase_anon", "anon")

    repo = CRMRepository(user_token="user-token")

    async def fake_request_with_user(*args, **kwargs):
        return DummyResponse({"ok": True})

    repo._request_with_user = AsyncMock(side_effect=fake_request_with_user)

    payload = {"p_example": "1"}
    result = await repo._rpc("demo_rpc", payload)

    assert repo._request_with_user.called
    assert result == {"ok": True}


@pytest.mark.asyncio
async def test_list_contactables_by_ids_uses_source_specific_columns(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role", "service")
    monkeypatch.setattr(settings, "supabase_anon", "anon")

    repo = CRMRepository(user_token="user-token")
    captured: dict[str, object] = {}

    async def fake_request_with_user(method: str, path: str, **kwargs):
        captured.setdefault("calls", []).append((method, path, kwargs))
        return DummyResponse([])

    repo._request_with_user = AsyncMock(side_effect=fake_request_with_user)

    resultado_ids = [uuid.UUID("11111111-1111-1111-1111-111111111111")]
    await repo.list_contactables_by_ids(
        usuario_token="user-token",
        fuente="denue",
        resultado_ids=resultado_ids,
    )

    assert captured["calls"]
    method, path, kwargs = captured["calls"][0]
    assert method == "GET"
    assert path == "/rest/v1/resultados"
    params = kwargs.get("params")
    assert isinstance(params, dict)
    select = params.get("select")
    assert isinstance(select, str)
    assert "google_primary_type" not in select
    assert "rating" not in select
    assert "reviews" not in select
    assert "address_full" in select
    assert params.get("fuente") == "eq.denue"
    assert "id" in params


@pytest.mark.asyncio
async def test_bulk_insert_prospectos_aligns_optional_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role", "service")
    monkeypatch.setattr(settings, "supabase_anon", "anon")

    repo = CRMRepository(user_token="user-token")
    captured: dict[str, object] = {}

    async def fake_request_with_user(method: str, path: str, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["json"] = kwargs.get("json")
        return DummyResponse([{"ok": True}])

    repo._request_with_user = AsyncMock(side_effect=fake_request_with_user)

    await repo.bulk_insert_prospectos(
        usuario_token="user-token",
        items=[
            {"nombre_comercial": "Grupo Demo", "email": "ana@ejemplo.com"},
            {"nombre": "Ana", "primer_apellido": "Lopez"},
        ],
    )

    assert captured["method"] == "POST"
    assert captured["path"] == "/rest/v1/prospeccion_prospectos"
    json_payload = captured["json"]
    assert isinstance(json_payload, list)
    assert len(json_payload) == 2
    first_keys = set(json_payload[0].keys())
    second_keys = set(json_payload[1].keys())
    assert first_keys == second_keys
    assert json_payload[0]["primer_apellido"] is None
    assert json_payload[1]["nombre_comercial"] is None
