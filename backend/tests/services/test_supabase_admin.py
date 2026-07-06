from __future__ import annotations

from collections import deque

import pytest

from app.core.config import settings
from app.services.supabase_admin import (
    SupabaseAdminError,
    create_supabase_user,
    is_email_registered,
)


class _FakeResponse:
    def __init__(self, status_code: int, text: str, json_data: object) -> None:
        self.status_code = status_code
        self.text = text
        self._json_data = json_data

    def json(self) -> object:
        return self._json_data


class _FakeAsyncClient:
    def __init__(self, *, responses: deque[_FakeResponse], calls: list[tuple[str, str]]) -> None:
        self._responses = responses
        self._calls = calls

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False

    async def post(self, url, json=None, headers=None):
        self._calls.append(("POST", url))
        return self._responses.popleft()

    async def get(self, url, params=None, headers=None):
        self._calls.append(("GET", url))
        return self._responses.popleft()


@pytest.mark.asyncio
async def test_create_supabase_user_returns_created_user(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str]] = []
    user_id = "11111111-1111-1111-1111-111111111111"
    responses = deque(
        [
            _FakeResponse(200, '{"id":"11111111-1111-1111-1111-111111111111"}', {"id": user_id}),
        ]
    )

    monkeypatch.setattr(
        "app.services.supabase_admin.httpx.AsyncClient",
        lambda timeout: _FakeAsyncClient(responses=responses, calls=calls),
    )
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co", raising=False)
    monkeypatch.setattr(settings, "supabase_service_role", "service-role-key", raising=False)

    result = await create_supabase_user(
        email="admin@example.com",
        nombre="Admin",
        telefono="+521234567890",
        organizacion_id="22222222-2222-2222-2222-222222222222",
    )

    assert result == (user_id, "+521234567890")
    assert calls == [("POST", "https://example.supabase.co/auth/v1/invite")]


@pytest.mark.asyncio
async def test_create_supabase_user_falls_back_when_invite_email_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str]] = []
    email = "admin@example.com"
    responses = deque(
        [
            _FakeResponse(
                500,
                '{"code":500,"error_code":"unexpected_failure","msg":"Error sending invite email"}',
                {"code": 500},
            ),
        ]
    )

    monkeypatch.setattr(
        "app.services.supabase_admin.httpx.AsyncClient",
        lambda timeout: _FakeAsyncClient(responses=responses, calls=calls),
    )
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co", raising=False)
    monkeypatch.setattr(settings, "supabase_service_role", "service-role-key", raising=False)

    with pytest.raises(SupabaseAdminError, match="No se pudo enviar el correo de invitación"):
        await create_supabase_user(
            email=email,
            nombre="Admin",
            telefono="521234567890",
            organizacion_id="22222222-2222-2222-2222-222222222222",
        )
