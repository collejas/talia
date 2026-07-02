"""Cobertura básica para los endpoints del canal WhatsApp."""

import pytest
from httpx import AsyncClient

from app.channels.whatsapp import deps
from app.channels.whatsapp import service
from app.core.config import settings
from app.services.tenant_runtime import TwilioRuntimeSettings


@pytest.mark.asyncio
async def test_whatsapp_webhook_accepts_payload(monkeypatch, async_client: AsyncClient) -> None:
    """El endpoint debe delegar al servicio con el formulario parseado."""
    called: dict[str, object] = {}

    async def fake_handler(message, source="webhook"):
        called["payload"] = message
        called["source"] = source

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
    assert called["source"] == "webhook"


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
async def test_whatsapp_status_endpoint_uses_sender_number_for_tenant_resolution(
    monkeypatch, async_client: AsyncClient
) -> None:
    """El callback de estado debe resolver el tenant con el número emisor, no con el destinatario."""
    captured: dict[str, object] = {}
    resolved_numbers: list[str | None] = []

    async def fake_handler(payload):
        captured["payload"] = payload

    async def fake_resolve_whatsapp_organizacion(*, to_number: str | None = None, contact=None):
        resolved_numbers.append(to_number)
        if to_number == "whatsapp:+5214443354450":
            return "00000000-0000-0000-0000-000000000001"
        return None

    class FakeRequestValidator:
        def __init__(self, token: str) -> None:
            self.token = token

        def validate(self, url: str, payload, signature: str) -> bool:
            return True

    async def fake_twilio_runtime_settings(*, organizacion_id=None):
        return TwilioRuntimeSettings(
            phone_number="+5214443354450",
            phone_number_sid=None,
            validate_signatures=True,
            voice_webhook_path=None,
            voice_full_duplex=True,
            voice_debug_verbose=True,
            voice_debug_energy_every_n=20,
            account_sid="ACtest",
            auth_token="tokentest",
            voice_stream_jwt_secret=None,
        )

    monkeypatch.setattr(service, "handle_status_callback", fake_handler)
    monkeypatch.setattr(settings, "twilio_validate_signatures", True)
    monkeypatch.setattr(deps, "resolve_whatsapp_organizacion", fake_resolve_whatsapp_organizacion)
    monkeypatch.setattr(deps.tenant_runtime, "get_twilio_runtime_settings", fake_twilio_runtime_settings)
    monkeypatch.setattr(deps, "RequestValidator", FakeRequestValidator)

    response = await async_client.post(
        "/whatsapp/status",
        data={
            "From": "whatsapp:+5214443354450",
            "To": "whatsapp:+5214441302811",
            "MessageSid": "MM123",
            "MessageStatus": "undelivered",
        },
    )

    assert response.status_code == 200
    assert captured["payload"].status == "undelivered"
    assert resolved_numbers[0] == "whatsapp:+5214443354450"


@pytest.mark.asyncio
async def test_whatsapp_fallback_webhook(monkeypatch, async_client: AsyncClient) -> None:
    """El fallback debe reutilizar el mismo handler para reprocesar mensajes."""
    recorded: dict[str, object] = {}

    async def fake_handler(message, source="webhook"):
        recorded["payload"] = message
        recorded["source"] = source

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
    assert recorded["source"] == "fallback"
