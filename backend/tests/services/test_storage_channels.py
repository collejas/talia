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

    async def get_persona_by_whatsapp_id(self, **_: Any) -> dict[str, Any] | None:
        return None

    async def get_persona_by_phone_e164(self, **_: Any) -> dict[str, Any] | None:
        return None

    async def get_latest_whatsapp_conversation(self, **_: Any) -> dict[str, Any] | None:
        return None

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


class FakeAttachmentRepository:
    def __init__(self) -> None:
        self.upload_calls: list[dict[str, Any]] = []
        self.sign_calls: list[dict[str, Any]] = []

    async def upload_storage_object(
        self,
        *,
        bucket: str,
        object_key: str,
        content: bytes,
        content_type: str | None = None,
    ) -> str:
        self.upload_calls.append(
            {
                "bucket": bucket,
                "object_key": object_key,
                "content": content,
                "content_type": content_type,
            }
        )
        return f"{bucket}/{object_key}"

    async def create_signed_storage_url(
        self,
        *,
        bucket: str,
        object_path: str,
        expires_in: int = 300,
    ) -> str:
        self.sign_calls.append(
            {
                "bucket": bucket,
                "object_path": object_path,
                "expires_in": expires_in,
            }
        )
        return f"https://signed.example/{bucket}/{object_path}?exp={expires_in}"


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


@pytest.mark.asyncio
async def test_upload_whatsapp_attachment_uses_private_bucket(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_repo = FakeAttachmentRepository()
    monkeypatch.setattr(storage, "CRMRepository", lambda: fake_repo)

    result = await storage.upload_whatsapp_attachment(
        content=b"abc123",
        filename="foto.png",
        content_type="image/png",
        conversation_id="conv-1",
    )

    assert fake_repo.upload_calls[0]["bucket"] == "whatsapp"
    assert fake_repo.sign_calls[0]["bucket"] == "whatsapp"
    assert result["path"].startswith("whatsapp/conv-1/")
    assert result["url"].startswith("https://signed.example/whatsapp/whatsapp/conv-1/")
