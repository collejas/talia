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
async def test_list_prospectos_by_ids_chunks_large_selection_and_preserves_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role", "service")
    monkeypatch.setattr(settings, "supabase_anon", "anon")

    repo = CRMRepository(user_token="user-token")
    captured: list[dict[str, object]] = []
    prospecto_ids = [uuid.uuid4() for _ in range(401)]

    async def fake_request_with_user(method: str, path: str, **kwargs):
        params = kwargs["params"]
        assert isinstance(params, dict)
        ids = str(params["id"])[4:-1].split(",")
        captured.append(params)
        return DummyResponse([{"id": value, "display_name": value} for value in reversed(ids)])

    repo._request_with_user = AsyncMock(side_effect=fake_request_with_user)

    result = await repo.list_prospectos_by_ids(
        usuario_token="user-token",
        prospecto_ids=prospecto_ids,
    )

    assert len(captured) == 3
    assert [len(str(params["id"])[4:-1].split(",")) for params in captured] == [200, 200, 1]
    assert [row["id"] for row in result] == [str(value) for value in prospecto_ids]


@pytest.mark.asyncio
async def test_contact_suppressions_chunk_large_selection(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role", "service")
    monkeypatch.setattr(settings, "supabase_anon", "anon")

    repo = CRMRepository(user_token="user-token")
    captured: list[dict[str, object]] = []
    prospecto_ids = [uuid.uuid4() for _ in range(401)]

    async def fake_request_with_user(method: str, path: str, **kwargs):
        params = kwargs["params"]
        assert isinstance(params, dict)
        captured.append(params)
        return DummyResponse([])

    repo._request_with_user = AsyncMock(side_effect=fake_request_with_user)

    result = await repo.list_active_contact_suppressions_for_prospectos(
        usuario_token="user-token",
        prospecto_ids=prospecto_ids,
        canales=["correo"],
    )

    assert result == []
    assert len(captured) == 3
    assert [len(str(params["prospecto_id"])[4:-1].split(",")) for params in captured] == [200, 200, 1]


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


@pytest.mark.asyncio
async def test_insert_contact_envios_chunks_and_ignores_retries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role", "service")
    monkeypatch.setattr(settings, "supabase_anon", "anon")

    repo = CRMRepository(user_token="user-token")
    calls: list[dict[str, object]] = []

    async def fake_request_with_user(method: str, path: str, **kwargs):
        calls.append({"method": method, "path": path, **kwargs})
        return DummyResponse(kwargs["json"])

    repo._request_with_user = AsyncMock(side_effect=fake_request_with_user)
    entries = [
        {"batch_id": "batch", "prospecto_id": str(index), "canal": "correo"}
        for index in range(401)
    ]

    result = await repo.insert_contact_envios(usuario_token="user-token", entries=entries)

    assert len(calls) == 3
    assert [len(call["json"]) for call in calls] == [200, 200, 1]
    assert all(call["params"] == {"on_conflict": "batch_id,prospecto_id,canal"} for call in calls)
    assert all(
        call["prefer"] == "resolution=ignore-duplicates,return=representation"
        for call in calls
    )
    assert len(result) == len(entries)
