from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.repositories.crm import CRMRepository


@pytest.mark.asyncio
async def test_personas_list_forwards_organizacion_id(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = CRMRepository()
    observed_body: dict[str, object] | None = None
    target_org = uuid4()

    async def fake_request_with_user(
        method: str,
        path: str,
        *,
        token: str,
        json: dict[str, object] | None = None,
    ) -> SimpleNamespace:
        nonlocal observed_body
        assert method == "POST"
        assert path == "/rest/v1/rpc/panel_contactos_list"
        assert token == "user-token"
        observed_body = dict(json or {})
        return SimpleNamespace(status_code=200, json=lambda: [])

    monkeypatch.setattr(repo, "_request_with_user", fake_request_with_user)

    rows = await repo.personas_list(
        usuario_token="user-token",
        organizacion_id=target_org,
    )

    assert rows == []
    assert observed_body is not None
    assert observed_body["p_organizacion_id"] == str(target_org)


@pytest.mark.asyncio
async def test_personas_resumen_forwards_organizacion_id(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = CRMRepository()
    observed_body: dict[str, object] | None = None
    target_org = uuid4()

    async def fake_request_with_user(
        method: str,
        path: str,
        *,
        token: str,
        json: dict[str, object] | None = None,
    ) -> SimpleNamespace:
        nonlocal observed_body
        assert method == "POST"
        assert path == "/rest/v1/rpc/panel_contactos_resumen"
        assert token == "user-token"
        observed_body = dict(json or {})
        return SimpleNamespace(status_code=200, json=lambda: {"total": 0})

    monkeypatch.setattr(repo, "_request_with_user", fake_request_with_user)

    row = await repo.personas_resumen(
        usuario_token="user-token",
        organizacion_id=target_org,
    )

    assert row["total"] == 0
    assert observed_body is not None
    assert observed_body["p_organizacion_id"] == str(target_org)
