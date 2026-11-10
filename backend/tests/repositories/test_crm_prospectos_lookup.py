from __future__ import annotations

import uuid

import httpx
import pytest

from app.repositories.crm import CRMRepository


@pytest.mark.asyncio
async def test_list_prospectos_by_emails_uses_one_parameterized_rpc() -> None:
    repository = CRMRepository.__new__(CRMRepository)
    repository._user_token = None
    repository._timeout = 30.0
    calls: list[tuple[str, str, dict[str, object]]] = []

    async def fake_request_with_user(
        method: str,
        path: str,
        *,
        token: str,
        **kwargs: object,
    ) -> httpx.Response:
        calls.append((method, path, kwargs))
        return httpx.Response(200, json=[])

    repository._request_with_user = fake_request_with_user  # type: ignore[method-assign]

    result = await repository.list_prospectos_by_emails(
        usuario_token="user-token",
        organizacion_id=uuid.uuid4(),
        emails=[" Persona@Ejemplo.com ", "persona@ejemplo.com"],
    )

    assert result == []
    assert len(calls) == 1
    method, path, kwargs = calls[0]
    assert method == "POST"
    assert path == "/rest/v1/rpc/prospeccion_prospectos_buscar_contactos"
    payload = kwargs["json"]
    assert isinstance(payload, dict)
    assert payload["p_emails"] == ["persona@ejemplo.com"]
    assert payload["p_phones"] == []


@pytest.mark.asyncio
async def test_list_prospectos_by_phones_sends_normalized_candidates_without_url_filters() -> None:
    repository = CRMRepository.__new__(CRMRepository)
    repository._user_token = None
    repository._timeout = 30.0
    calls: list[tuple[str, str, dict[str, object]]] = []

    async def fake_request_with_user(
        method: str,
        path: str,
        *,
        token: str,
        **kwargs: object,
    ) -> httpx.Response:
        calls.append((method, path, kwargs))
        return httpx.Response(200, json=[])

    repository._request_with_user = fake_request_with_user  # type: ignore[method-assign]

    result = await repository.list_prospectos_by_phones(
        usuario_token="user-token",
        organizacion_id=uuid.uuid4(),
        phones=["+52 55 5555 1212"],
    )

    assert result == []
    assert len(calls) == 1
    assert calls[0][0] == "POST"
    assert calls[0][1] == "/rest/v1/rpc/prospeccion_prospectos_buscar_contactos"
    payload = calls[0][2]["json"]
    assert isinstance(payload, dict)
    assert payload["p_emails"] == []
    assert "+5215555551212" in payload["p_phones"]
    assert "5215555551212" in payload["p_phones"]
