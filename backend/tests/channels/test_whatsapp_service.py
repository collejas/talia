"""Pruebas unitarias para la lógica del servicio de WhatsApp."""

from __future__ import annotations

from typing import Any
from uuid import UUID

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
async def test_handle_incoming_message_records_sales_ack(monkeypatch) -> None:
    """Los acuses del botón de vendedor no deben disparar al asistente."""
    message = schemas.WhatsAppIncomingMessage(
        message_sid="SM-ack",
        from_number="whatsapp:+5215550000000",
        to_number="whatsapp:+521000000000",
        body="Aceptar",
        wa_id="5215550000000",
        profile_name="Seller",
        num_media=0,
        media=[],
        raw_payload={"ButtonPayload": "Aceptar", "ButtonText": "Aceptar"},
    )

    class RepoStub:
        def __init__(self) -> None:
            self.updated: dict[str, Any] | None = None

        async def find_sales_rep_by_phone(self, *, phone_e164: str | None) -> dict[str, Any] | None:
            assert phone_e164 == "+5215550000000"
            return {
                "usuario_id": UUID("00000000-0000-0000-0000-0000000000aa"),
                "organizacion_ids": [UUID("00000000-0000-0000-0000-0000000000bb")],
            }

        async def find_pending_sales_assignment(
            self,
            *,
            vendedor_id: UUID,
            organizacion_ids: list[UUID] | None = None,
        ) -> dict[str, Any] | None:
            assert str(vendedor_id) == "00000000-0000-0000-0000-0000000000aa"
            assert organizacion_ids is not None
            return {
                "id": "00000000-0000-0000-0000-0000000000cc",
                "metadata": {},
            }

        async def update_sales_assignment_ack(
            self,
            *,
            assignment_id: UUID,
            ack_user_id: UUID,
            ack_time,
            ack_via: str,
            metadata: dict[str, Any] | None = None,
        ) -> None:
            self.updated = {
                "assignment_id": assignment_id,
                "ack_user_id": ack_user_id,
                "ack_time": ack_time,
                "ack_via": ack_via,
                "metadata": metadata,
            }

    repo = RepoStub()
    monkeypatch.setattr(service, "CRMRepository", lambda: repo)

    async def fail_register(**_: object):
        raise AssertionError("register_whatsapp_message no debe invocarse en acuse")

    monkeypatch.setattr(service.storage, "register_whatsapp_message", fail_register)

    await service.handle_incoming_message(message)

    assert repo.updated is not None
    assert repo.updated["ack_via"] == "whatsapp_quick_reply"
    assert repo.updated["metadata"]["acknowledgement"]["button_payload"] == "Aceptar"


@pytest.mark.asyncio
async def test_handle_incoming_message_respects_manual_mode(monkeypatch) -> None:
    """Cuando la conversación está en modo manual no debe invocar al asistente."""
    message = _build_sample_message()

    monkeypatch.setattr(service.settings, "whatsapp_default_organizacion_id", "org-test")
    monkeypatch.setattr(service.settings, "whatsapp_phone_org_map", {})

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

    async def fake_fetch_contact(contact_id: str):
        return {"id": contact_id}

    async def fake_fetch_contact_identities(contact_id: str):
        return []

    called = {"assistant": False}

    async def fake_generate(**kwargs):
        called["assistant"] = True
        return service.AssistantReply(text="ok", openai_conversation_id=None, response_id=None)

    ensure_calls: list[dict[str, Any]] = []

    async def fake_ensure_conversation_opportunity(*_: object, **kwargs: object):
        ensure_calls.append(kwargs)
        return {
            "oportunidad_id": "opp-1",
            "restart_created": False,
            "restart_sequence": 1,
        }

    monkeypatch.setattr(service.storage, "register_whatsapp_message", fake_register)
    monkeypatch.setattr(service.storage, "fetch_conversation", fake_fetch_conversation)
    monkeypatch.setattr(service.storage, "fetch_contact", fake_fetch_contact)
    monkeypatch.setattr(service.storage, "fetch_contact_identities", fake_fetch_contact_identities)
    monkeypatch.setattr(
        service.storage,
        "ensure_conversation_opportunity",
        fake_ensure_conversation_opportunity,
    )
    monkeypatch.setattr(service, "_generate_assistant_reply", fake_generate)

    await service.handle_incoming_message(message)

    assert called["assistant"] is False
    assert register_calls and register_calls[0]["webhook_payload"] == message.raw_payload
    assert register_calls[0]["organizacion_id"] == "org-test"
    assert ensure_calls and ensure_calls[0]["force_new_opportunity_on_restart"] is True
    assert ensure_calls[0]["include_restart_metadata"] is True


@pytest.mark.asyncio
async def test_handle_incoming_message_sends_reply(monkeypatch) -> None:
    """Flujo completo exitoso registra mensajes entrante y saliente."""
    message = _build_sample_message()

    monkeypatch.setattr(service.settings, "whatsapp_default_organizacion_id", "org-test")
    monkeypatch.setattr(service.settings, "whatsapp_phone_org_map", {})

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

    async def fake_fetch_contact(contact_id: str):
        return {"id": contact_id}

    async def fake_fetch_contact_identities(contact_id: str):
        return []

    async def fake_generate(**kwargs):
        return service.AssistantReply(
            text="Respuesta automática",
            openai_conversation_id="conv-openai",
            response_id="resp-1",
        )

    async def fake_send(**kwargs):
        return service.TwilioSendResult(sid="SM-out", status="sent")

    ensure_calls: list[dict[str, Any]] = []

    async def fake_ensure_conversation_opportunity(*_: object, **kwargs: object):
        ensure_calls.append(kwargs)
        return {
            "oportunidad_id": "opp-1",
            "restart_created": False,
            "restart_sequence": 1,
        }

    monkeypatch.setattr(service.storage, "register_whatsapp_message", fake_register)
    monkeypatch.setattr(service.storage, "fetch_conversation", fake_fetch_conversation)
    monkeypatch.setattr(service.storage, "fetch_contact", fake_fetch_contact)
    monkeypatch.setattr(service.storage, "fetch_contact_identities", fake_fetch_contact_identities)
    monkeypatch.setattr(
        service.storage,
        "ensure_conversation_opportunity",
        fake_ensure_conversation_opportunity,
    )
    monkeypatch.setattr(service, "_generate_assistant_reply", fake_generate)
    monkeypatch.setattr(service, "_send_whatsapp_reply", fake_send)

    await service.handle_incoming_message(message)

    assert len(register_calls) == 2
    assert register_calls[1]["direction"] == "saliente"
    assert register_calls[1]["body"] == "Respuesta automática"
    assert register_calls[0]["webhook_payload"] == message.raw_payload
    assert "webhook_payload" not in register_calls[1]
    assert register_calls[0]["organizacion_id"] == "org-test"
    assert register_calls[1]["organizacion_id"] == "org-test"
    assert ensure_calls and ensure_calls[0]["force_new_opportunity_on_restart"] is True
    assert ensure_calls[0]["include_restart_metadata"] is True


@pytest.mark.asyncio
async def test_handle_incoming_message_notifies_on_restart(monkeypatch) -> None:
    """Cuando se crea una oportunidad por reinicio se notifica al vendedor."""
    message = _build_sample_message()

    monkeypatch.setattr(service.settings, "whatsapp_default_organizacion_id", "org-test")
    monkeypatch.setattr(service.settings, "whatsapp_phone_org_map", {})

    async def fake_register(**_: object):
        return {
            "conversation_id": "conv-1",
            "contact_id": "contact-1",
            "openai_conversation_id": None,
        }

    async def fake_fetch_conversation(conversation_id: str):
        return {
            "id": conversation_id,
            "contact_id": "contact-1",
            "manual_override": False,
            "openai_conversation_id": None,
            "last_response_id": None,
        }

    async def fake_fetch_contact(contact_id: str):
        return {"id": contact_id, "organizacion_id": "org-test"}

    async def fake_fetch_contact_identities(contact_id: str):
        return []

    async def fake_generate(**kwargs):
        return service.AssistantReply(
            text="Respuesta",
            openai_conversation_id="conv-openai",
            response_id="resp-1",
        )

    async def fake_send(**kwargs):
        return service.TwilioSendResult(sid="SM-out", status="sent")

    async def fake_ensure_conversation_opportunity(*_: object, **kwargs: object):
        return {
            "oportunidad_id": "opp-99",
            "restart_created": True,
            "restart_sequence": 3,
        }

    notify_calls: dict[str, Any] = {}

    async def fake_notify_sales_rep(**kwargs: object):
        notify_calls["trigger"] = kwargs.get("trigger")
        notify_calls["extra"] = kwargs.get("extra")

    monkeypatch.setattr(service.storage, "register_whatsapp_message", fake_register)
    monkeypatch.setattr(service.storage, "fetch_conversation", fake_fetch_conversation)
    monkeypatch.setattr(service.storage, "fetch_contact", fake_fetch_contact)
    monkeypatch.setattr(service.storage, "fetch_contact_identities", fake_fetch_contact_identities)
    monkeypatch.setattr(service.storage, "ensure_conversation_opportunity", fake_ensure_conversation_opportunity)
    monkeypatch.setattr(service, "_generate_assistant_reply", fake_generate)
    monkeypatch.setattr(service, "_send_whatsapp_reply", fake_send)
    monkeypatch.setattr(service.whatsapp_tools, "_notify_sales_rep", fake_notify_sales_rep)

    await service.handle_incoming_message(message)

    assert notify_calls["trigger"] == "restart_conversation"
    assert notify_calls["extra"]["restart_sequence"] == 3


@pytest.mark.asyncio
async def test_handle_status_callback_records_event(monkeypatch) -> None:
    """Los eventos conocidos se envían a storage.record_delivery_event."""
    callback = schemas.WhatsAppStatusCallback(
        message_sid="SM123",
        status="delivered",
        raw_payload={"foo": "bar"},
    )

    recorded: dict[str, str] = {}
    synced: dict[str, str] = {}

    async def fake_record(**kwargs):
        recorded.update(kwargs)

    async def fake_sync(cb: schemas.WhatsAppStatusCallback):
        synced["sid"] = cb.message_sid

    monkeypatch.setattr(service.storage, "record_delivery_event", fake_record)
    monkeypatch.setattr(service, "_sync_envio_status_from_whatsapp", fake_sync)

    await service.handle_status_callback(callback)

    assert recorded["message_sid"] == "SM123"
    assert recorded["event"] == "entregado"
    assert synced["sid"] == "SM123"


@pytest.mark.asyncio
async def test_handle_status_callback_ignores_unknown_status(monkeypatch) -> None:
    """Estados no contemplados se ignoran sin llamar a storage."""
    callback = schemas.WhatsAppStatusCallback(
        message_sid="SM123",
        status="processing",
        raw_payload={},
    )

    async def fake_record(**kwargs):  # pragma: no cover - defensa
        raise AssertionError("No debe registrarse el evento")

    async def fake_sync(_: object) -> None:  # pragma: no cover - defensa
        raise AssertionError("No debe sincronizarse el envío")

    monkeypatch.setattr(service.storage, "record_delivery_event", fake_record)
    monkeypatch.setattr(service, "_sync_envio_status_from_whatsapp", fake_sync)

    await service.handle_status_callback(callback)


@pytest.mark.asyncio
async def test_sync_envio_status_from_whatsapp_updates_repo(monkeypatch) -> None:
    """El helper actualiza el envío y registra un log."""

    callback = schemas.WhatsAppStatusCallback(
        message_sid="SM123",
        status="failed",
        error_code="63016",
        timestamp="2024-01-01T00:00:00Z",
        raw_payload={},
    )

    envio_id = "11111111-1111-1111-1111-111111111111"
    batch_id = "22222222-2222-2222-2222-222222222222"

    class DummyRepo:
        def __init__(self) -> None:
            self.complete_calls: list[tuple[UUID, dict]] = []
            self.log_entries: list[dict] = []
            self.synced_batch: UUID | None = None

        async def worker_get_envio_by_mensaje(self, mensaje_id: str):
            assert mensaje_id == callback.message_sid
            return {
                "id": envio_id,
                "prospecto_id": "33333333-3333-3333-3333-333333333333",
                "batch_id": batch_id,
                "detalle": {"previous": "value"},
            }

        async def worker_complete_envio(self, envio_id: UUID, payload: dict[str, Any]):
            self.complete_calls.append((envio_id, payload))

        async def worker_insert_contact_logs(self, entries: list[dict[str, Any]]):
            self.log_entries.extend(entries)

        async def worker_sync_batch_status(self, *, batch_id: UUID):
            self.synced_batch = batch_id

    dummy_repo = DummyRepo()
    monkeypatch.setattr(service, "CRMRepository", lambda: dummy_repo)

    await service._sync_envio_status_from_whatsapp(callback)

    assert dummy_repo.complete_calls, "Se esperaba que se actualizara el envío"
    envio_uuid, payload = dummy_repo.complete_calls[0]
    assert envio_uuid == UUID(envio_id)
    assert payload["estado"] == "fallido"
    assert payload["detalle"]["status"] == "failed"
    assert payload["detalle"]["previous"] == "value"
    assert dummy_repo.log_entries and dummy_repo.log_entries[0]["estado"] == "fallido"
    assert dummy_repo.synced_batch == UUID(batch_id)
