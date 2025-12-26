from types import SimpleNamespace
from typing import Any

import pytest

from app.assistants.tool_runtime import ToolRuntimeContext
from app.channels.whatsapp import tools


class DummySalesRepo:
    def __init__(self, metadata: dict | None = None) -> None:
        self.metadata = metadata or {}
        self.updated_payload: dict | None = None
        self.audit_calls: list[dict[str, Any]] = []

    async def get_pipeline_opportunity(self, **_: object) -> dict:
        return {
            "metadata": self.metadata,
            "asignado": {
                "id": "00000000-0000-0000-0000-0000000000aa",
                "telefono_e164": "+521234567890",
                "nombre_completo": "Seller Demo",
            },
        }

    async def update_opportunity(self, **kwargs: object) -> dict:
        self.updated_payload = kwargs.get("payload")
        return {"status": "ok"}

    async def insert_sales_assignment_audit(self, **kwargs: object) -> None:
        self.audit_calls.append(kwargs)


@pytest.mark.asyncio
async def test_notify_sales_rep_sends_message(monkeypatch: pytest.MonkeyPatch) -> None:
    dummy_repo = DummySalesRepo()
    monkeypatch.setattr(tools, "CRMRepository", lambda: dummy_repo)
    monkeypatch.setattr(tools.settings, "whatsapp_sales_template_sid", "HXexample")

    sent: dict[str, str] = {}

    async def fake_send_manual_message(
        *,
        to_number: str,
        body: str | None = None,
        template_sid: str | None = None,
        template_variables: dict | None = None,
    ) -> object:
        sent["to"] = to_number
        sent["body"] = body
        sent["template_sid"] = template_sid
        sent["template_vars"] = template_variables
        return SimpleNamespace(error=False, sid="MSG123")

    monkeypatch.setattr(
        "app.channels.whatsapp.service.send_manual_message",
        fake_send_manual_message,
    )

    contact = {
        "organizacion_id": "00000000-0000-0000-0000-0000000000bb",
        "nombre_completo": "Lead Demo",
        "company_name": "Demo SA",
        "correo": "lead@example.com",
        "telefono_e164": "+529991112233",
    }
    context = ToolRuntimeContext(
        conversation_id="conv-test",
        contact_id="contact-test",
        channel="whatsapp",
    )

    await tools._notify_sales_rep(
        context=context,
        trigger="information_email",
        contact=contact,
        opportunity_id="00000000-0000-0000-0000-0000000000cc",
        resumen="Automatizar atención",
        notes="Quiere demo esta semana",
        email="lead@example.com",
        extra={"siguiente_accion": "demo"},
    )

    assert sent["to"] == "+521234567890"
    assert sent["template_sid"] == "HXexample"
    assert sent["template_vars"]["1"] == "Seller Demo"
    assert sent["template_vars"]["2"] == "Lead Demo"
    assert sent["template_vars"]["6"] == "+529991112233"
    assert "information_email" in dummy_repo.updated_payload["metadata"]["sales_notifications"]


@pytest.mark.asyncio
async def test_notify_sales_rep_skips_when_already_sent(monkeypatch: pytest.MonkeyPatch) -> None:
    metadata = {
        "sales_notifications": {
            "information_email": {"sent_at": "2024-01-01T00:00:00Z"},
        }
    }
    dummy_repo = DummySalesRepo(metadata=metadata)
    monkeypatch.setattr(tools, "CRMRepository", lambda: dummy_repo)

    called = False

    async def fake_send_manual_message(*_, **__):
        nonlocal called
        called = True
        return SimpleNamespace(error=False, sid="MSG123")

    monkeypatch.setattr(
        "app.channels.whatsapp.service.send_manual_message",
        fake_send_manual_message,
    )

    contact = {
        "organizacion_id": "00000000-0000-0000-0000-0000000000bb",
    }
    context = ToolRuntimeContext(
        conversation_id="conv-test",
        contact_id="contact-test",
        channel="whatsapp",
    )

    await tools._notify_sales_rep(
        context=context,
        trigger="information_email",
        contact=contact,
        opportunity_id="00000000-0000-0000-0000-0000000000cc",
        resumen=None,
        notes=None,
        email=None,
        extra=None,
    )

    assert called is False


@pytest.mark.asyncio
async def test_handle_information_email_triggers_notification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    contact = {
        "organizacion_id": "00000000-0000-0000-0000-0000000000bb",
        "nombre_completo": "Lead Demo",
        "correo": "lead@example.com",
    }

    async def fake_resolve_contact(_: str) -> dict:
        return contact

    monkeypatch.setattr(tools, "_resolve_contact", fake_resolve_contact)
    monkeypatch.setattr(tools, "send_email", lambda **_: "msg-email")

    async def fake_upsert(*_, **__):
        return None

    async def fake_ensure(*_, **__):
        return "00000000-0000-0000-0000-0000000000cc"

    monkeypatch.setattr(tools.storage, "upsert_conversation_insights", fake_upsert)
    monkeypatch.setattr(tools.storage, "ensure_conversation_opportunity", fake_ensure)
    monkeypatch.setattr(tools.storage, "update_contact", fake_upsert)

    notified: list[str] = []

    async def fake_notify(**kwargs: object) -> None:
        notified.append(kwargs["trigger"])

    monkeypatch.setattr(tools, "_notify_sales_rep", fake_notify)

    context = ToolRuntimeContext(
        conversation_id="conv-1",
        contact_id="contact-1",
        channel="whatsapp",
    )
    arguments = {
        "email": "lead@example.com",
        "full_name": "Lead Demo",
        "company_name": "Demo Co",
        "summary": "Quiere demo",
        "highlights": [],
        "resources": [],
    }

    result = await tools._handle_information_email(arguments, context)
    assert result["status"] == "sent"
    assert notified == ["information_email"]


@pytest.mark.asyncio
async def test_handle_close_lead_triggers_notification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    contact = {
        "organizacion_id": "00000000-0000-0000-0000-0000000000bb",
    }

    async def fake_resolve_contact(_: str) -> dict:
        return contact

    monkeypatch.setattr(tools, "_resolve_contact", fake_resolve_contact)

    async def fake_ensure(*_, **__):
        return "00000000-0000-0000-0000-0000000000dd"

    async def fake_update_contact(*_, **__):
        return None

    monkeypatch.setattr(tools.storage, "ensure_conversation_opportunity", fake_ensure)
    monkeypatch.setattr(tools.storage, "update_contact", fake_update_contact)
    monkeypatch.setattr(tools.storage, "update_conversation", fake_update_contact)
    monkeypatch.setattr(tools.storage, "upsert_conversation_insights", fake_update_contact)
    promoted: dict[str, Any] = {}

    async def fake_promote_opportunity_stage(**kwargs: object) -> None:
        promoted["called"] = True
        promoted["payload"] = kwargs

    monkeypatch.setattr(
        tools.storage,
        "promote_opportunity_stage",
        fake_promote_opportunity_stage,
    )

    notified: list[str] = []

    async def fake_notify(**kwargs: object) -> None:
        notified.append(kwargs["trigger"])

    monkeypatch.setattr(tools, "_notify_sales_rep", fake_notify)

    context = ToolRuntimeContext(
        conversation_id="conv-1",
        contact_id="contact-1",
        channel="whatsapp",
    )
    arguments = {
        "notes": "Listo para demo",
        "necesidad_proposito": "Automatización",
        "siguiente_accion": "Agendar demo",
    }

    result = await tools._handle_close_lead(arguments, context)
    assert result["status"] == "ok"
    assert notified == ["close_lead"]
    assert promoted.get("called") is True
    assert promoted["payload"]["stage_code"] == "precalificado"
