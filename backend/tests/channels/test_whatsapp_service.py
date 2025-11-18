"""Pruebas unitarias para la lógica del servicio de WhatsApp."""

from __future__ import annotations

import pytest

from app.channels.whatsapp import schemas, service


def _build_sample_message() -> schemas.WhatsAppIncomingMessage:
    return schemas.WhatsAppIncomingMessage(
        message_sid="SM-inbound",
        from_number="whatsapp:+521111111111",
        to_number="whatsapp:+521000000000",
        body="Hola",
        wa_id="521111111111",
        profile_name="Test User",
        num_media=0,
        media=[],
        raw_payload={},
    )


@pytest.mark.asyncio
async def test_handle_incoming_message_respects_manual_mode(monkeypatch) -> None:
    """Cuando la conversación está en modo manual no debe invocar al asistente."""
    message = _build_sample_message()

    register_calls: list[dict[str, object]] = []

    async def fake_register(**kwargs):
        register_calls.append(kwargs)
        return {
            "conversation_id": "conv-1",
            "contact_id": "contact-1",
            "openai_conversation_id": None,
        }

    async def fake_fetch_conversation(conversation_id: str):
        return {
            "id": conversation_id,
            "contact_id": "contact-1",
            "manual_override": True,
        }

    called = {"assistant": False}

    async def fake_generate(**kwargs):
        called["assistant"] = True
        return service.AssistantReply(text="ok", openai_conversation_id=None, response_id=None)

    monkeypatch.setattr(service.storage, "register_whatsapp_message", fake_register)
    monkeypatch.setattr(service.storage, "fetch_conversation", fake_fetch_conversation)
    monkeypatch.setattr(service, "_generate_assistant_reply", fake_generate)

    await service.handle_incoming_message(message)

    assert called["assistant"] is False
    assert register_calls and register_calls[0]["webhook_payload"] == message.raw_payload


@pytest.mark.asyncio
async def test_handle_incoming_message_sends_reply(monkeypatch) -> None:
    """Flujo completo exitoso registra mensajes entrante y saliente."""
    message = _build_sample_message()

    register_calls: list[dict] = []

    async def fake_register(**kwargs):
        register_calls.append(kwargs)
        return {
            "conversation_id": "conv-1",
            "contact_id": "contact-1",
            "openai_conversation_id": kwargs.get("metadata", {}).get("openai_conversation_id"),
        }

    async def fake_fetch_conversation(conversation_id: str):
        return {
            "id": conversation_id,
            "contact_id": "contact-1",
            "manual_override": False,
            "openai_conversation_id": None,
            "last_response_id": None,
        }

    async def fake_generate(**kwargs):
        return service.AssistantReply(
            text="Respuesta automática",
            openai_conversation_id="conv-openai",
            response_id="resp-1",
        )

    async def fake_send(**kwargs):
        return service.TwilioSendResult(sid="SM-out", status="sent")

    monkeypatch.setattr(service.storage, "register_whatsapp_message", fake_register)
    monkeypatch.setattr(service.storage, "fetch_conversation", fake_fetch_conversation)
    monkeypatch.setattr(service, "_generate_assistant_reply", fake_generate)
    monkeypatch.setattr(service, "_send_whatsapp_reply", fake_send)

    await service.handle_incoming_message(message)

    assert len(register_calls) == 2
    assert register_calls[1]["direction"] == "saliente"
    assert register_calls[1]["body"] == "Respuesta automática"
    assert register_calls[0]["webhook_payload"] == message.raw_payload
    assert "webhook_payload" not in register_calls[1]


@pytest.mark.asyncio
async def test_handle_status_callback_records_event(monkeypatch) -> None:
    """Los eventos conocidos se envían a storage.record_delivery_event."""
    callback = schemas.WhatsAppStatusCallback(
        message_sid="SM123",
        status="delivered",
        raw_payload={"foo": "bar"},
    )

    recorded: dict[str, str] = {}

    async def fake_record(**kwargs):
        recorded.update(kwargs)

    monkeypatch.setattr(service.storage, "record_delivery_event", fake_record)

    await service.handle_status_callback(callback)

    assert recorded["message_sid"] == "SM123"
    assert recorded["event"] == "entregado"


@pytest.mark.asyncio
async def test_handle_status_callback_ignores_unknown_status(monkeypatch) -> None:
    """Estados no contemplados se ignoran sin llamar a storage."""
    callback = schemas.WhatsAppStatusCallback(
        message_sid="SM123",
        status="processing",
        raw_payload={},
    )

    async def fake_record(**kwargs):
        raise AssertionError("No debe registrarse el evento")

    monkeypatch.setattr(service.storage, "record_delivery_event", fake_record)

    await service.handle_status_callback(callback)
