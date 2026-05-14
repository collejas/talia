"""Pruebas unitarias para la lógica del servicio de WhatsApp."""

from __future__ import annotations

from types import SimpleNamespace
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


async def _async_none(*_: object, **__: object) -> None:
    return None


async def _async_false(*_: object, **__: object) -> bool:
    return False


def _async_return(value: Any):
    async def _inner(**_: object) -> Any:
        return value

    return _inner


def test_booking_confirmation_hint_detects_te_esperamos() -> None:
    text = "Perfecto, Juan. Queda todo listo, te esperamos el lunes a las 9 am."
    assert service._looks_like_booking_confirmation(text) is True


def test_booking_confirmation_hint_ignores_non_booking_text() -> None:
    text = "Te comparto informacion general del fraccionamiento y modelos."
    assert service._looks_like_booking_confirmation(text) is False


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

    monkeypatch.setattr(service.storage, "fetch_message_by_twilio_sid", _async_none)
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
    monkeypatch.setattr(service.storage, "fetch_message_by_twilio_sid", _async_none)
    monkeypatch.setattr(service, "resolve_whatsapp_organizacion", _async_return("org-test"))
    monkeypatch.setattr(service.storage, "update_conversation", _async_none)
    monkeypatch.setattr(service.storage, "merge_conversation_inbox_context", _async_none)

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

    async def fake_fetch_persona(contact_id: str):
        return {"id": contact_id}

    async def fake_fetch_persona_identities(contact_id: str):
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
    monkeypatch.setattr(service.storage, "fetch_persona", fake_fetch_persona)
    monkeypatch.setattr(service.storage, "fetch_persona_identities", fake_fetch_persona_identities)
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
    assert ensure_calls
    assert ensure_calls[0]["include_restart_metadata"] is True


@pytest.mark.asyncio
async def test_handle_incoming_message_sends_reply(monkeypatch) -> None:
    """Flujo completo exitoso registra mensajes entrante y saliente."""
    message = _build_sample_message()

    monkeypatch.setattr(service.settings, "whatsapp_default_organizacion_id", "org-test")
    monkeypatch.setattr(service.settings, "whatsapp_phone_org_map", {})
    monkeypatch.setattr(service.storage, "fetch_message_by_twilio_sid", _async_none)
    monkeypatch.setattr(service, "resolve_whatsapp_organizacion", _async_return("org-test"))
    monkeypatch.setattr(service.storage, "update_conversation", _async_none)
    monkeypatch.setattr(service.storage, "merge_conversation_inbox_context", _async_none)

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

    async def fake_fetch_persona(contact_id: str):
        return {"id": contact_id}

    async def fake_fetch_persona_identities(contact_id: str):
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
    monkeypatch.setattr(service.storage, "fetch_persona", fake_fetch_persona)
    monkeypatch.setattr(service.storage, "fetch_persona_identities", fake_fetch_persona_identities)
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
    assert ensure_calls
    assert ensure_calls[0]["include_restart_metadata"] is True


@pytest.mark.asyncio
async def test_handle_incoming_message_notifies_on_restart(monkeypatch) -> None:
    """Cuando se crea una oportunidad por reinicio se notifica al vendedor."""
    message = _build_sample_message()

    monkeypatch.setattr(service.settings, "whatsapp_default_organizacion_id", "org-test")
    monkeypatch.setattr(service.settings, "whatsapp_phone_org_map", {})
    monkeypatch.setattr(service.storage, "fetch_message_by_twilio_sid", _async_none)
    monkeypatch.setattr(service, "resolve_whatsapp_organizacion", _async_return("org-test"))
    monkeypatch.setattr(service.storage, "update_conversation", _async_none)
    monkeypatch.setattr(service.storage, "merge_conversation_inbox_context", _async_none)

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

    async def fake_fetch_persona(contact_id: str):
        return {"id": contact_id, "organizacion_id": "org-test"}

    async def fake_fetch_persona_identities(contact_id: str):
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
    monkeypatch.setattr(service.storage, "fetch_persona", fake_fetch_persona)
    monkeypatch.setattr(service.storage, "fetch_persona_identities", fake_fetch_persona_identities)
    monkeypatch.setattr(service.storage, "ensure_conversation_opportunity", fake_ensure_conversation_opportunity)
    monkeypatch.setattr(service, "_generate_assistant_reply", fake_generate)
    monkeypatch.setattr(service, "_send_whatsapp_reply", fake_send)
    monkeypatch.setattr(service.whatsapp_tools, "_notify_sales_rep", fake_notify_sales_rep)

    await service.handle_incoming_message(message)

    assert notify_calls["trigger"] == "restart_conversation"
    assert notify_calls["extra"]["restart_sequence"] == 3


@pytest.mark.asyncio
async def test_handle_incoming_message_prefers_phone_number_id_over_display_number(monkeypatch) -> None:
    """El inbound Meta debe resolver el tenant por `phone_number_id` primero."""
    message = schemas.MetaWhatsAppIncomingMessage(
        message_sid="SM-meta",
        from_number="whatsapp:+521111111111",
        to_number="+5214443891655",
        phone_number_id="1139218909270276",
        body="Hola",
        wa_id="521111111111",
        profile_name="Cliente",
        num_media=0,
        media=[],
        raw_payload={},
    )

    monkeypatch.setattr(service, "_maybe_handle_sales_acknowledgement", _async_false)
    monkeypatch.setattr(service.storage, "fetch_message_by_twilio_sid", _async_none)
    monkeypatch.setattr(service, "resolve_whatsapp_organizacion", _async_return("org-display"))
    monkeypatch.setattr(
        service,
        "resolve_whatsapp_organizacion_by_phone_number_id",
        _async_return("org-phone-id"),
    )
    monkeypatch.setattr(
        service.tenant_runtime,
        "get_whatsapp_runtime_settings",
        _async_return(
            SimpleNamespace(
                provider="meta",
                inactivity_minutes=5,
                meta_phone_number_id="1139218909270276",
                meta_page_access_token="token",
                meta_graph_api_version="v21.0",
                meta_app_secret="secret",
            )
        ),
    )

    register_calls: list[dict[str, Any]] = []

    async def fake_register(**kwargs):
        register_calls.append(kwargs)
        return {
            "conversation_id": "conv-meta",
            "contact_id": "contact-meta",
            "openai_conversation_id": None,
        }

    async def fake_coalesce(*_: object, **__: object):
        return False, message.body or "", {}

    monkeypatch.setattr(service.storage, "register_whatsapp_message", fake_register)
    monkeypatch.setattr(service.storage, "update_conversation", _async_none)
    monkeypatch.setattr(service, "_coalesce_inbound_burst", fake_coalesce)

    await service.handle_incoming_message(message, "meta_webhook")

    assert len(register_calls) == 1
    assert register_calls[0]["organizacion_id"] == "org-phone-id"
    assert register_calls[0]["webhook_payload"] == message.raw_payload


@pytest.mark.asyncio
async def test_send_meta_whatsapp_reply_uses_template_payload(monkeypatch) -> None:
    runtime = SimpleNamespace(
        provider="meta",
        meta_phone_number_id="1139218909270276",
        meta_page_access_token="meta-token",
        meta_graph_api_version="v21.0",
    )
    monkeypatch.setattr(service.tenant_runtime, "get_whatsapp_runtime_settings", _async_return(runtime))

    captured: dict[str, Any] = {}

    class FakeResponse:
        status_code = 200
        text = ""

        def json(self) -> dict[str, Any]:
            return {"messages": [{"id": "wamid.template.1"}]}

    class FakeClient:
        def __init__(self, timeout: float) -> None:
            self.timeout = timeout

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, url: str, json: dict[str, Any], headers: dict[str, str]) -> FakeResponse:
            captured["url"] = url
            captured["json"] = json
            captured["headers"] = headers
            return FakeResponse()

    monkeypatch.setattr(service.httpx, "AsyncClient", FakeClient)

    result = await service._send_meta_whatsapp_reply(
        to_number="+5214443891655",
        body="Hola",
        template_name="grupo_gran_penon_bienvenida",
        template_language="es_MX",
        content_variables={"1": "Juan", "2": "Promoción"},
        organizacion_id=UUID("39e32c05-bfc2-4794-8aab-225873f2bf19"),
    )

    assert result.provider == "meta"
    assert result.sid == "wamid.template.1"
    assert captured["url"].endswith("/messages")
    assert captured["json"]["type"] == "template"
    assert captured["json"]["template"]["name"] == "grupo_gran_penon_bienvenida"
    assert captured["json"]["template"]["language"]["code"] == "es_MX"
    assert captured["json"]["template"]["components"][0]["type"] == "body"
    assert captured["json"]["template"]["components"][0]["parameters"][0]["text"] == "Juan"
    assert captured["json"]["template"]["components"][0]["parameters"][1]["text"] == "Promoción"


@pytest.mark.asyncio
async def test_send_meta_whatsapp_reply_falls_back_to_text(monkeypatch) -> None:
    runtime = SimpleNamespace(
        provider="meta",
        meta_phone_number_id="1139218909270276",
        meta_page_access_token="meta-token",
        meta_graph_api_version="v21.0",
    )
    monkeypatch.setattr(service.tenant_runtime, "get_whatsapp_runtime_settings", _async_return(runtime))

    captured: dict[str, Any] = {}

    class FakeResponse:
        status_code = 200
        text = ""

        def json(self) -> dict[str, Any]:
            return {"messages": [{"id": "wamid.text.1"}]}

    class FakeClient:
        def __init__(self, timeout: float) -> None:
            self.timeout = timeout

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, url: str, json: dict[str, Any], headers: dict[str, str]) -> FakeResponse:
            captured["url"] = url
            captured["json"] = json
            captured["headers"] = headers
            return FakeResponse()

    monkeypatch.setattr(service.httpx, "AsyncClient", FakeClient)

    result = await service._send_meta_whatsapp_reply(
        to_number="+5214443891655",
        body="Mensaje libre",
        organizacion_id=UUID("39e32c05-bfc2-4794-8aab-225873f2bf19"),
    )

    assert result.provider == "meta"
    assert result.sid == "wamid.text.1"
    assert captured["json"]["type"] == "text"
    assert captured["json"]["text"]["body"] == "Mensaje libre"


@pytest.mark.asyncio
async def test_send_meta_whatsapp_reply_sends_attachment_payload(monkeypatch) -> None:
    runtime = SimpleNamespace(
        provider="meta",
        meta_phone_number_id="1139218909270276",
        meta_page_access_token="meta-token",
        meta_graph_api_version="v21.0",
    )
    monkeypatch.setattr(service.tenant_runtime, "get_whatsapp_runtime_settings", _async_return(runtime))

    captured: dict[str, Any] = {}

    class FakeResponse:
        status_code = 200
        text = ""

        def json(self) -> dict[str, Any]:
            return {"messages": [{"id": "wamid.media.1"}]}

    class FakeClient:
        def __init__(self, timeout: float) -> None:
            self.timeout = timeout

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, url: str, json: dict[str, Any], headers: dict[str, str]) -> FakeResponse:
            captured["url"] = url
            captured["json"] = json
            captured["headers"] = headers
            return FakeResponse()

    monkeypatch.setattr(service.httpx, "AsyncClient", FakeClient)

    result = await service._send_meta_whatsapp_reply(
        to_number="+5214443891655",
        body="Revisa este archivo",
        attachments=[
            {
                "url": "https://cdn.example.com/adjunto.pdf",
                "mime": "application/pdf",
                "name": "adjunto.pdf",
            }
        ],
        organizacion_id=UUID("39e32c05-bfc2-4794-8aab-225873f2bf19"),
    )

    assert result.provider == "meta"
    assert result.sid == "wamid.media.1"
    assert captured["json"]["type"] == "document"
    assert captured["json"]["document"]["link"] == "https://cdn.example.com/adjunto.pdf"
    assert captured["json"]["document"]["filename"] == "adjunto.pdf"


@pytest.mark.asyncio
async def test_send_twilio_whatsapp_reply_uses_media_url(monkeypatch) -> None:
    runtime = SimpleNamespace(
        phone_number="whatsapp:+521000000000",
        account_sid="AC123",
        auth_token="auth-token",
    )
    monkeypatch.setattr(service.tenant_runtime, "get_twilio_runtime_settings", _async_return(runtime))

    captured: dict[str, Any] = {}

    class FakeMessages:
        def create(self, **kwargs: Any) -> SimpleNamespace:
            captured["kwargs"] = kwargs
            return SimpleNamespace(sid="SM-media", status="sent")

    class FakeClient:
        messages = FakeMessages()

    monkeypatch.setattr(service.twilio_service, "get_twilio_client_for_credentials", lambda *_: FakeClient())

    result = await service._send_twilio_whatsapp_reply(
        to_number="+5214443891655",
        body="Revisa este archivo",
        attachments=[
            {
                "url": "https://cdn.example.com/adjunto.jpg",
                "mime": "image/jpeg",
                "name": "adjunto.jpg",
            }
        ],
        organizacion_id=UUID("39e32c05-bfc2-4794-8aab-225873f2bf19"),
    )

    assert result.provider == "twilio"
    assert result.sid == "SM-media"
    assert captured["kwargs"]["media_url"] == ["https://cdn.example.com/adjunto.jpg"]


@pytest.mark.asyncio
async def test_generate_assistant_reply_retries_without_previous_response_id(monkeypatch) -> None:
    """Si OpenAI pierde el `previous_response_id`, el turno reintenta sin historial roto."""

    message = _build_sample_message()
    assistant_cfg = service.AssistantConfig(
        assistant_id=None,
        prompt_id="pmpt_test",
        prompt_version="1",
        project_id="proj-test",
    )

    monkeypatch.setattr(service, "_build_assistant_from_runtime", lambda *args, **kwargs: assistant_cfg)
    monkeypatch.setattr(service.openai_service, "get_assistant_client", lambda **kwargs: object())
    monkeypatch.setattr(service, "_build_openai_input", lambda *args, **kwargs: [])
    monkeypatch.setattr(service, "build_prompt_payload", lambda *args, **kwargs: {"prompt": "test"})
    monkeypatch.setattr(service.storage, "fetch_persona_context", _async_none)
    monkeypatch.setattr(service.conversation_summary, "ensure_conversation_summary", _async_none)
    monkeypatch.setattr(service.tenant_runtime, "is_profiling_enabled", _async_false)
    monkeypatch.setattr(service, "_extract_text_from_response", lambda _response: "Respuesta final")

    calls: list[str | None] = []

    class PreviousResponseMissingError(Exception):
        status_code = 400

        def __str__(self) -> str:
            return "previous_response_not_found"

    async def fake_run_tool_loop(*, previous_response_id=None, **_: object):
        calls.append(previous_response_id)
        if len(calls) == 1:
            assert previous_response_id == "resp-stale"
            raise PreviousResponseMissingError()
        assert previous_response_id is None
        return SimpleNamespace(
            response={"output": []},
            conversation_id="conv-new",
            response_id="resp-new",
            side_effects={},
        )

    monkeypatch.setattr(service, "run_tool_loop", fake_run_tool_loop)

    reply = await service._generate_assistant_reply(
        message=message,
        conversation_id="conv-1",
        contact_id="contact-1",
        openai_conversation_id=None,
        previous_response_id="resp-stale",
        catalog_context=None,
        booking_context=None,
        whatsapp_settings=SimpleNamespace(voice_api_key="api-key", project_id="proj-test"),
        organizacion_id=None,
        prospeccion_mode=False,
        origin_type="general_whatsapp",
        inbound_message_id="inbound-1",
    )

    assert calls == ["resp-stale", None]
    assert reply.text == "Respuesta final"
    assert reply.response_id == "resp-new"


@pytest.mark.asyncio
async def test_resolve_prospeccion_prospecto_id_is_org_scoped(monkeypatch) -> None:
    """La búsqueda de prospectos por teléfono no debe cruzar tenants."""

    message = schemas.WhatsAppIncomingMessage(
        message_sid="SM-org-scope",
        from_number="whatsapp:+5214441302811",
        to_number="whatsapp:+5214443891655",
        body="hola",
        wa_id="5214441302811",
        profile_name="Collejas",
        num_media=0,
        media=[],
        raw_payload={},
    )
    org_gran = UUID("39e32c05-bfc2-4794-8aab-225873f2bf19")

    class RepoStub:
        async def worker_find_prospecto_by_contacto(
            self,
            *,
            contacto_id,
            organizacion_id=None,
        ) -> dict[str, Any] | None:
            assert organizacion_id == org_gran
            return None

        async def worker_get_latest_prospectos_by_phones(
            self,
            *,
            phone_values,
            organizacion_id=None,
        ) -> dict[str, dict[str, Any]]:
            assert organizacion_id == org_gran
            assert "4441302811" in phone_values
            return {}

    result = await service._resolve_prospeccion_prospecto_id(
        repo=RepoStub(),
        contact_id="c8677050-f253-4448-944f-05f4d2fda7ac",
        organizacion_id=org_gran,
        message=message,
    )

    assert result is None


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
