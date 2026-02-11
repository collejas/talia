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
