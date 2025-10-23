"""Pruebas para el endpoint de webchat."""

from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from app.channels.webchat.schemas import WebchatResponse


@pytest.mark.asyncio
async def test_webchat_message_returns_assistant_reply(
    async_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_response = WebchatResponse(session_id="abc", reply="Hola, soy TalIA")
    monkeypatch.setattr(
        "app.channels.webchat.service.handle_webchat_message",
        AsyncMock(return_value=fake_response),
    )

    response = await async_client.post(
        "/api/webchat/messages",
        json={"session_id": "abc", "author": "user", "content": "hola"},
    )

    assert response.status_code == 200
    assert response.json()["reply"] == "Hola, soy TalIA"


@pytest.mark.asyncio
async def test_webchat_returns_502_when_service_fails(
    async_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.channels.webchat import service

    async def fail(_message):
        raise service.AssistantServiceError("boom")

    monkeypatch.setattr(
        "app.channels.webchat.service.handle_webchat_message",
        fail,
    )

    response = await async_client.post(
        "/api/webchat/messages",
        json={"session_id": "abc", "author": "user", "content": "hola"},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "boom"
