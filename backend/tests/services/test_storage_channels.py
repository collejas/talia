"""Pruebas para garantizar que el canal de conversación se persista."""

from typing import Any

import pytest

from app.services import storage


class FakeWebchatRepository:
    """Repositorio simulado para validar el parcheo de canal webchat."""

    def __init__(self) -> None:
        """Prepara contenedores para registrar llamadas."""
        self.update_calls: list[dict[str, Any]] = []

    async def register_webchat_message(self, **_: Any) -> dict[str, str | None]:
        """Devuelve identificadores mínimos de conversación."""
        return {
            "conversation_id": "conv-webchat",
            "message_id": "msg-webchat",
            "contact_id": "contact-webchat",
            "openai_conversation_id": None,
        }

    async def update_conversation(
        self, *, conversation_id: str, patch: dict[str, Any]
    ) -> dict[str, Any]:
        """Captura las actualizaciones solicitadas sobre la conversación."""
        self.update_calls.append({"conversation_id": conversation_id, "patch": patch})
        return {"id": conversation_id, **patch}


class FakeWhatsappRepository:
    """Repositorio simulado para validar el parcheo de canal WhatsApp."""

    def __init__(self) -> None:
        """Inicializa el registro de actualizaciones."""
        self.update_calls: list[dict[str, Any]] = []

    async def get_contact_by_whatsapp_id(self, **_: Any) -> dict[str, Any] | None:
        return None

    async def get_contact_by_phone_e164(self, **_: Any) -> dict[str, Any] | None:
        return None

    async def register_whatsapp_message(self, **_: Any) -> dict[str, Any]:
        """Devuelve identificadores de conversación y contacto."""
        return {
            "conversation_id": "conv-whatsapp",
            "message_id": "msg-whatsapp",
            "contact_id": "contact-whatsapp",
            "openai_conversation_id": None,
        }

    async def update_conversation(
        self, *, conversation_id: str, patch: dict[str, Any]
    ) -> dict[str, Any]:
        """Registra la solicitud de actualización del canal."""
        self.update_calls.append({"conversation_id": conversation_id, "patch": patch})
        return {"id": conversation_id, **patch}


@pytest.mark.asyncio
async def test_register_webchat_message_sets_channel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """El registro webchat debe actualizar el campo `canal` de la conversación."""
    fake_repo = FakeWebchatRepository()
    monkeypatch.setattr(storage, "CRMRepository", lambda: fake_repo)

    result = await storage.register_webchat_message(
        session_id="sess-1",
        author="user",
        content="hola",
        response_id=None,
        metadata={},
        inactivity_hours=None,
        attachments=None,
    )

    assert result["conversation_id"] == "conv-webchat"
    assert fake_repo.update_calls == [
        {"conversation_id": "conv-webchat", "patch": {"canal": "webchat"}}
    ]


@pytest.mark.asyncio
async def test_register_whatsapp_message_sets_channel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """El registro WhatsApp debe actualizar el campo `canal` de la conversación."""
    fake_repo = FakeWhatsappRepository()
    monkeypatch.setattr(storage, "CRMRepository", lambda: fake_repo)

    result = await storage.register_whatsapp_message(
        direction="entrante",
        wa_id="wa-1",
        phone_e164="+521111111111",
        body="hola",
        message_sid="msg-1",
        profile_name=None,
        conversation_id=None,
        contact_id=None,
        response_id=None,
        metadata=None,
        inactivity_hours=None,
        attachments=None,
        webhook_payload=None,
    )

    assert result["conversation_id"] == "conv-whatsapp"
    assert fake_repo.update_calls == [
        {"conversation_id": "conv-whatsapp", "patch": {"canal": "whatsapp"}}
    ]
