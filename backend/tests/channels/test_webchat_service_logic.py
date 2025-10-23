"""Pruebas unitarias del servicio de webchat."""

from types import SimpleNamespace

import pytest

from app.channels.webchat import service
from app.channels.webchat.schemas import WebchatMessage
from app.services import storage


@pytest.mark.asyncio
async def test_handle_webchat_message_persists_and_returns_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, str]] = []

    async def fake_record(**kwargs):
        calls.append(kwargs)
        return storage.WebchatRecord(conversation_id="conv-123", message_id=f"msg-{len(calls)}")

    async def fake_generate(_: WebchatMessage) -> service.AssistantReply:
        return service.AssistantReply(text="Hola desde TalIA", response_id="resp-999")

    async def fake_geo(_: str | None) -> dict[str, str]:
        return {"country": "MX", "city": "CDMX"}

    monkeypatch.setattr("app.services.storage.record_webchat_message", fake_record)
    monkeypatch.setattr("app.channels.webchat.service._generate_assistant_reply", fake_generate)
    monkeypatch.setattr("app.services.geolocation.lookup_ip", fake_geo)

    message = WebchatMessage(session_id="sess-1", author="user", content="hola", locale="es-MX")

    fake_request = SimpleNamespace(
        headers={
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "x-forwarded-for": "203.0.113.1",
        },
        client=SimpleNamespace(host="203.0.113.1"),
    )

    response = await service.handle_webchat_message(message, request=fake_request)

    assert response.reply == "Hola desde TalIA"
    assert response.metadata is not None
    assert response.metadata["conversation_id"] == "conv-123"
    assert response.metadata["assistant_response_id"] == "resp-999"
    assert response.metadata["assistant_message_id"] == "msg-2"
    assert response.metadata["last_message_id"] == "msg-1"
    assert len(calls) == 2
    assert calls[0]["author"] == "user"
    assert calls[1]["author"] == "assistant"
    assert calls[0]["metadata"]["ip"] == "203.0.113.1"
    assert "geo" in calls[0]["metadata"]
    assert calls[0]["metadata"]["device_type"] == "desktop"


def test_extract_response_id_prefers_attribute() -> None:
    obj = SimpleNamespace(id="resp-123")
    assert service._extract_response_id(obj) == "resp-123"


def test_extract_response_id_from_dict() -> None:
    assert service._extract_response_id({"id": "resp-abc"}) == "resp-abc"


def test_extract_response_id_returns_none_when_missing() -> None:
    assert service._extract_response_id({}) is None
