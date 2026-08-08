from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID

import pytest

from app.repositories.crm import CRMRepository


@pytest.mark.asyncio
async def test_inbox_threads_uses_persisted_projection(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = CRMRepository()
    observed: dict[str, object] = {}

    async def fake_request_with_user(
        method: str,
        path: str,
        *,
        token: str,
        json: dict[str, object] | None = None,
    ) -> SimpleNamespace:
        observed.update(method=method, path=path, token=token, body=dict(json or {}))
        return SimpleNamespace(json=lambda: [])

    monkeypatch.setattr(repo, "_request_with_user", fake_request_with_user)
    rows = await repo.inbox_threads(
        usuario_token="user-token", channel="whatsapp", limit=40, message_limit=1
    )

    assert rows == []
    assert observed["path"] == "/rest/v1/rpc/panel_inbox_threads_persisted"
    assert observed["token"] == "user-token"
    assert observed["body"] == {
        "p_estado": None,
        "p_asignado": None,
        "p_limit": 40,
        "p_offset": 0,
        "p_message_limit": 1,
        "p_channel": "whatsapp",
    }


@pytest.mark.asyncio
async def test_inbox_filter_options_uses_projection_rpc(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = CRMRepository()
    observed: dict[str, object] = {}

    async def fake_request_with_user(
        method: str,
        path: str,
        *,
        token: str,
        json: dict[str, object] | None = None,
    ) -> SimpleNamespace:
        observed.update(method=method, path=path, token=token, body=dict(json or {}))
        return SimpleNamespace(
            json=lambda: [
                {"option_type": "batch", "option_id": "batch-id", "option_label": "Lote"}
            ]
        )

    monkeypatch.setattr(repo, "_request_with_user", fake_request_with_user)
    rows = await repo.inbox_filter_options(
        usuario_token="user-token", source="Prospeccion", channel="WhatsApp"
    )

    assert rows[0]["option_type"] == "batch"
    assert observed["path"] == "/rest/v1/rpc/panel_inbox_filter_options_persisted"
    assert observed["body"] == {"p_source": "prospeccion", "p_channel": "whatsapp"}


@pytest.mark.asyncio
async def test_inbox_summary_uses_persisted_projection(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = CRMRepository()
    observed: dict[str, object] = {}

    async def fake_request_with_user(
        method: str,
        path: str,
        *,
        token: str,
        json: dict[str, object] | None = None,
    ) -> SimpleNamespace:
        observed.update(path=path, body=dict(json or {}))
        return SimpleNamespace(json=lambda: {"total": 6, "unread": 0})

    monkeypatch.setattr(repo, "_request_with_user", fake_request_with_user)
    summary = await repo.inbox_summary(usuario_token="user-token")

    assert summary["total"] == 6
    assert observed["path"] == "/rest/v1/rpc/panel_inbox_resumen_persisted"


@pytest.mark.asyncio
async def test_mark_inbox_thread_read_uses_tenant_safe_rpc(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = CRMRepository()
    observed: dict[str, object] = {}
    conversation_id = UUID("00000000-0000-0000-0000-000000000123")

    async def fake_request_with_user(
        method: str,
        path: str,
        *,
        token: str,
        json: dict[str, object] | None = None,
    ) -> SimpleNamespace:
        observed.update(path=path, body=dict(json or {}))
        return SimpleNamespace(json=lambda: 1)

    monkeypatch.setattr(repo, "_request_with_user", fake_request_with_user)
    updated = await repo.mark_inbox_thread_read(
        usuario_token="user-token",
        conversacion_id=conversation_id,
    )

    assert updated == 1
    assert observed["path"] == "/rest/v1/rpc/panel_inbox_mark_thread_read"
    assert observed["body"] == {"p_conversacion_id": str(conversation_id)}
