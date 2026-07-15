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
            "contact_id": "persona-webchat",
            "persona_id": "persona-webchat",
            "organizacion_id": "org-webchat",
            "openai_conversation_id": None,
        }

    async def update_conversation(
        self, *, conversation_id: str, patch: dict[str, Any]
    ) -> dict[str, Any]:
        """Captura las actualizaciones solicitadas sobre la conversación."""
        self.update_calls.append({"conversation_id": conversation_id, "patch": patch})
        return {"id": conversation_id, **patch}


class FakeWhatsappRepository:
    """Repositorio simulado para validar el registro mínimo de WhatsApp."""

    async def register_whatsapp_message(self, **_: Any) -> dict[str, Any]:
        """Devuelve identificadores de conversación y contacto."""
        return {
            "conversation_id": "conv-whatsapp",
            "message_id": "msg-whatsapp",
            "contact_id": "contact-whatsapp",
            "openai_conversation_id": None,
        }


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


class FakeOpportunityRepository:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.conversation_row: dict[str, Any] | None = None
        self.updated_conversation: dict[str, Any] | None = None

    async def get_conversation_inbox_context(
        self,
        *,
        conversation_id: str,
    ) -> dict[str, Any]:
        self.calls.append(
            (
                "get_conversation_inbox_context",
                {
                    "conversation_id": conversation_id,
                },
            )
        )
        if self.conversation_row is None:
            raise storage.CRMRepositoryError("conversation_not_found")
        return self.conversation_row

    async def update_conversation(
        self,
        *,
        conversation_id: str,
        patch: dict[str, Any],
    ) -> dict[str, Any]:
        self.updated_conversation = {
            "conversation_id": conversation_id,
            "patch": patch,
        }
        self.calls.append(
            (
                "update_conversation",
                {
                    "conversation_id": conversation_id,
                    "patch": patch,
                },
            )
        )
        return {"id": conversation_id, **patch}

    async def ensure_contact_record_for_persona(
        self,
        *,
        organizacion_id: Any,
        persona_id: Any,
        use_service_role: bool = False,
    ) -> dict[str, Any]:
        self.calls.append(
            (
                "ensure_contact_record_for_persona",
                {
                    "organizacion_id": str(organizacion_id),
                    "persona_id": str(persona_id),
                    "use_service_role": use_service_role,
                },
            )
        )
        return {"id": str(persona_id)}

    async def ensure_conversation_opportunity(
        self,
        *,
        organizacion_id: Any,
        contacto_id: Any,
        conversation_id: str,
        canal: str | None = None,
        contacto_nombre: str | None = None,
        contacto_empresa: str | None = None,
        force_new_opportunity_on_restart: bool = False,
        contact_ready: bool | None = None,
        require_contact_ready: bool = False,
    ) -> tuple[str, bool, int]:
        self.calls.append(
            (
                "ensure_conversation_opportunity",
                {
                    "organizacion_id": str(organizacion_id),
                    "contacto_id": str(contacto_id),
                    "conversation_id": conversation_id,
                    "canal": canal,
                    "contact_ready": contact_ready,
                    "require_contact_ready": require_contact_ready,
                },
            )
        )
        return ("opp-1", True, 1)

    async def list_opportunities_by_conversation_ids(
        self,
        *,
        organizacion_id: Any,
        conversation_ids: list[str],
        limit: int = 1,
    ) -> list[dict[str, Any]]:
        self.calls.append(
            (
                "list_opportunities_by_conversation_ids",
                {
                    "organizacion_id": str(organizacion_id),
                    "conversation_ids": list(conversation_ids),
                    "limit": limit,
                },
            )
        )
        return []

    async def get_contact_opportunity(
        self,
        *,
        contact_id: Any,
        conversation_id: str | None = None,
    ) -> dict[str, Any] | None:
        self.calls.append(
            (
                "get_contact_opportunity",
                {
                    "contact_id": str(contact_id),
                    "conversation_id": conversation_id,
                },
            )
        )
        return None


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
    assert result["persona_id"] == "persona-webchat"
    assert result["organizacion_id"] == "org-webchat"
    assert fake_repo.update_calls == [
        {"conversation_id": "conv-webchat", "patch": {"canal": "webchat"}}
    ]


@pytest.mark.asyncio
async def test_register_whatsapp_message_sets_channel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """El registro WhatsApp debe resolver la conversación sin PATCH extra."""
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


@pytest.mark.asyncio
async def test_ensure_persona_conversation_opportunity_syncs_contact_before_opportunity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_repo = FakeOpportunityRepository()
    monkeypatch.setattr(storage, "CRMRepository", lambda: fake_repo)

    async def fake_fetch_persona(persona_id: str) -> dict[str, Any]:
        return {
            "id": persona_id,
            "organizacion_id": "39e32c05-bfc2-4794-8aab-225873f2bf19",
            "nombre_completo": "Persona Demo",
            "telefono_principal_e164": "+521111111111",
            "correo_principal": "demo@example.com",
        }

    monkeypatch.setattr(storage, "fetch_persona", fake_fetch_persona)

    opportunity_id = await storage.ensure_persona_conversation_opportunity(
        conversation_id="conv-1",
        persona_id="00000000-0000-0000-0000-000000000123",
        channel="voice",
    )

    assert opportunity_id == "opp-1"
    assert [call[0] for call in fake_repo.calls] == [
        "get_conversation_inbox_context",
        "ensure_contact_record_for_persona",
        "ensure_conversation_opportunity",
        "update_conversation",
    ]


@pytest.mark.asyncio
async def test_ensure_persona_conversation_opportunity_reuses_cached_opportunity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_repo = FakeOpportunityRepository()
    fake_repo.conversation_row = {
        "id": "conv-1",
        "organizacion_id": "39e32c05-bfc2-4794-8aab-225873f2bf19",
        "restart_sequence": 3,
        "inbox_context": {
            "opportunity_id": "00000000-0000-0000-0000-00000000abcd",
        },
    }
    monkeypatch.setattr(storage, "CRMRepository", lambda: fake_repo)

    async def fail_fetch_persona(_: str) -> dict[str, Any]:
        raise AssertionError("No debe consultar persona cuando la conversación ya tiene opportunity_id cacheado")

    monkeypatch.setattr(storage, "fetch_persona", fail_fetch_persona)

    payload = await storage.ensure_persona_conversation_opportunity(
        conversation_id="conv-1",
        persona_id="00000000-0000-0000-0000-000000000123",
        channel="whatsapp",
        include_restart_metadata=True,
    )

    assert payload == {
        "oportunidad_id": "00000000-0000-0000-0000-00000000abcd",
        "restart_created": False,
        "restart_sequence": 3,
    }
    assert [call[0] for call in fake_repo.calls] == ["get_conversation_inbox_context"]
