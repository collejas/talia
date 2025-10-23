"""Pruebas placeholder para voz."""

import pytest
from httpx import AsyncClient


@pytest.mark.skip(reason="Implementación pendiente para Fase 2")
async def test_voice_status_callback(async_client: AsyncClient) -> None:
    response = await async_client.post(
        "/api/voice/status",
        json={"call_sid": "CA123", "call_status": "ringing"},
    )
    assert response.status_code == 200
