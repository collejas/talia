"""Cobertura básica para el webhook de WhatsApp."""

import pytest
from httpx import AsyncClient


@pytest.mark.skip(reason="Implementación pendiente para Fase 2")
async def test_whatsapp_webhook_accepts_payload(async_client: AsyncClient) -> None:
    response = await async_client.post("/api/whatsapp/webhook", content="{}")
    assert response.status_code == 200
