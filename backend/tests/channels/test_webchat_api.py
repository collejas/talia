"""Pruebas placeholder para webchat."""

import pytest
from httpx import AsyncClient


@pytest.mark.skip(reason="Implementación pendiente para Fase 2")
async def test_webchat_message_queue(async_client: AsyncClient) -> None:
    response = await async_client.post(
        "/api/webchat/messages",
        json={"session_id": "abc", "author": "user", "content": "hola"},
    )
    assert response.status_code == 200
