"""Cobertura básica para los endpoints del canal WhatsApp."""

import pytest
from httpx import AsyncClient

from app.channels.whatsapp import service
from app.core.config import settings


@pytest.mark.asyncio
async def test_whatsapp_webhook_accepts_payload(monkeypatch, async_client: AsyncClient) -> None:
    """El endpoint debe delegar al servicio con el formulario parseado."""
    called: dict[str, object] = {}

    async def fake_handler(message):
        called["payload"] = message

    monkeypatch.setattr(service, "handle_incoming_message", fake_handler)
    monkeypatch.setattr(settings, "twilio_validate_signatures", False)

    response = await async_client.post(
        "/whatsapp/webhook",
        data={
            "From": "whatsapp:+521111111111",
            "Body": "hola",
            "MessageSid": "SM123",
        },
    )

    assert response.status_code == 200
    assert called["payload"].body == "hola"
    assert response.json()["status"] == "accepted"


@pytest.mark.asyncio
async def test_whatsapp_status_endpoint(monkeypatch, async_client: AsyncClient) -> None:
    """El callback de estado debe delegar a service.handle_status_callback."""
    captured: dict[str, object] = {}

    async def fake_status(payload):
        captured["payload"] = payload

    monkeypatch.setattr(service, "handle_status_callback", fake_status)
    monkeypatch.setattr(settings, "twilio_validate_signatures", False)

    response = await async_client.post(
        "/whatsapp/status",
        data={
            "MessageSid": "SM000",
            "MessageStatus": "delivered",
        },
    )

    assert response.status_code == 200
    assert captured["payload"].status == "delivered"


@pytest.mark.asyncio
async def test_whatsapp_fallback_webhook(monkeypatch, async_client: AsyncClient) -> None:
    """El fallback debe reutilizar el mismo handler para reprocesar mensajes."""
    recorded: dict[str, object] = {}

    async def fake_handler(message):
        recorded["payload"] = message

    monkeypatch.setattr(service, "handle_incoming_message", fake_handler)
    monkeypatch.setattr(settings, "twilio_validate_signatures", False)

    response = await async_client.post(
        "/whatsapp/fallback",
        data={
            "From": "whatsapp:+529998887777",
            "Body": "reintento",
            "MessageSid": "SM999",
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "fallback-accepted"
    assert recorded["payload"].body == "reintento"
