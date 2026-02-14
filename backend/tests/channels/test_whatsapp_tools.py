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
    dummy_repo = DummySalesRepo(
        metadata={
            "lead_scoring": {
                "answers": {
                    "financing_type": "credito",
                    "budget_range": "3m-4m",
                    "purchase_timeline": "1_3_months",
                    "decision_authority": "sole",
                }
            }
        }
    )
    monkeypatch.setattr(tools, "CRMRepository", lambda: dummy_repo)
    monkeypatch.setattr(tools.settings, "whatsapp_sales_template_sid", "HXexample")
    async def fake_get_whatsapp_runtime_settings(**_: object):
        return tools.tenant_runtime.WhatsappRuntimeSettings.from_settings()

    monkeypatch.setattr(
        tools.tenant_runtime,
        "get_whatsapp_runtime_settings",
        fake_get_whatsapp_runtime_settings,
    )

    sent: dict[str, str] = {}

    async def fake_send_manual_message(
        *,
        to_number: str,
        body: str | None = None,
        template_sid: str | None = None,
        template_variables: dict | None = None,
        organizacion_id: str | None = None,
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
        "necesidad_proposito": "Automatizar atención",
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
        trigger="booking_confirmed",
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
    assert sent["template_vars"]["3"] == "Automatizar atención"
    assert sent["template_vars"]["4"] == "demo"
    assert sent["template_vars"]["5"] == "+529991112233"
    assert sent["template_vars"]["6"] == "lead@example.com"
    assert sent["template_vars"]["7"] == "Demo SA"
    assert "booking_confirmed" in dummy_repo.updated_payload["metadata"]["sales_notifications"]
    assert (
        dummy_repo.updated_payload["metadata"]["sales_primary_notifications"]["whatsapp"]["reason"]
        == "case_a_booking_profile"
    )
    assert dummy_repo.audit_calls[-1]["canal"] == "whatsapp"


@pytest.mark.asyncio
async def test_notify_sales_rep_skips_when_already_sent(monkeypatch: pytest.MonkeyPatch) -> None:
    metadata = {
        "sales_primary_notifications": {
            "whatsapp": {"sent_at": "2024-01-01T00:00:00Z"},
        },
        "lead_scoring": {
            "answers": {
                "financing_type": "credito",
                "budget_range": "3m-4m",
                "purchase_timeline": "1_3_months",
                "decision_authority": "sole",
            }
        }
    }
    dummy_repo = DummySalesRepo(metadata=metadata)
    monkeypatch.setattr(tools, "CRMRepository", lambda: dummy_repo)
    async def fake_get_whatsapp_runtime_settings(**_: object):
        return tools.tenant_runtime.WhatsappRuntimeSettings.from_settings()

    monkeypatch.setattr(
        tools.tenant_runtime,
        "get_whatsapp_runtime_settings",
        fake_get_whatsapp_runtime_settings,
    )

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
        "nombre_completo": "Lead Demo",
        "company_name": "Demo SA",
        "necesidad_proposito": "Automatizar atención",
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
        trigger="booking_confirmed",
        contact=contact,
        opportunity_id="00000000-0000-0000-0000-0000000000cc",
        resumen=None,
        notes=None,
        email=None,
        extra=None,
    )

    assert called is False


def test_has_minimum_profile_for_case_a_uses_profiling_status_fallback() -> None:
    metadata = {
        "lead_scoring": {
            "answers": {
                "financing_type": "credito",
                "budget_range": "3m-4m",
                "purchase_timeline": "1_3_months",
            },
            "profiling_by_channel": {
                "whatsapp": {
                    "questions": {
                        "decision_authority": {
                            "estado_respuesta": "answered",
                            "repregunta_count": 0,
                        }
                    }
                }
            },
        }
    }
    assert (
        tools._has_minimum_profile_for_case_a(
            contact={},
            opportunity_metadata=metadata,
        )
        is True
    )


def test_sanitize_profiling_statuses_demotes_answered_without_user_signal() -> None:
    statuses = {
        "financing_type": "answered",
        "budget_range": "answered",
        "decision_authority": "answered",
    }
    user_signals = {
        "financing_type": True,
        "budget_range": True,
        "decision_authority": False,
    }
    sanitized = tools._sanitize_profiling_statuses_from_user_messages(
        profiling_statuses=statuses,
        user_signals=user_signals,
    )
    assert sanitized["financing_type"] == "answered"
    assert sanitized["budget_range"] == "answered"
    assert sanitized["decision_authority"] == "unknown"


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
    async def fake_get_mail_runtime_settings(**_: object):
        return tools.tenant_runtime.MailRuntimeSettings.from_settings()
    async def fake_get_brevo_runtime_settings(**_: object):
        return tools.tenant_runtime.BrevoRuntimeSettings(
            api_key=None,
            base_url="https://api.brevo.com/v3",
        )

    monkeypatch.setattr(
        tools.tenant_runtime,
        "get_mail_runtime_settings",
        fake_get_mail_runtime_settings,
    )
    monkeypatch.setattr(
        tools.tenant_runtime,
        "get_brevo_runtime_settings",
        fake_get_brevo_runtime_settings,
    )

    async def fake_upsert(*_, **__):
        return None

    async def fake_ensure(*_, **__):
        return "00000000-0000-0000-0000-0000000000cc"

    auto_name_calls: list[dict[str, Any]] = []

    async def fake_auto_name(**kwargs: Any) -> None:
        auto_name_calls.append(kwargs)

    monkeypatch.setattr(tools.storage, "upsert_conversation_insights", fake_upsert)
    monkeypatch.setattr(tools.storage, "ensure_conversation_opportunity", fake_ensure)
    monkeypatch.setattr(tools.storage, "update_contact", fake_upsert)
    monkeypatch.setattr(tools.storage, "maybe_auto_name_opportunity", fake_auto_name)

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
    assert notified == []
    assert auto_name_calls
    assert auto_name_calls[0]["intent"] is None


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

    auto_name_calls: list[dict[str, Any]] = []

    async def fake_auto_name(**kwargs: Any) -> None:
        auto_name_calls.append(kwargs)

    monkeypatch.setattr(tools.storage, "ensure_conversation_opportunity", fake_ensure)
    monkeypatch.setattr(tools.storage, "update_contact", fake_update_contact)
    monkeypatch.setattr(tools.storage, "update_conversation", fake_update_contact)
    monkeypatch.setattr(tools.storage, "upsert_conversation_insights", fake_update_contact)
    monkeypatch.setattr(tools.storage, "maybe_auto_name_opportunity", fake_auto_name)
    scored: dict[str, Any] = {}
    promoted: dict[str, Any] = {}

    async def fake_apply_lead_scoring(**kwargs: Any) -> dict[str, Any]:
        scored["called"] = True
        scored["payload"] = kwargs
        return {"score_total": 62, "grade": "interesado", "confidence": "medium"}

    monkeypatch.setattr(
        tools.storage,
        "apply_lead_scoring",
        fake_apply_lead_scoring,
    )
    async def fake_promote_prequalified(**kwargs: Any) -> bool:
        promoted["called"] = True
        promoted["payload"] = kwargs
        return False

    monkeypatch.setattr(
        tools.storage,
        "maybe_promote_prequalified_from_scoring",
        fake_promote_prequalified,
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
        "profiling_statuses": {
            "financing_type": "answered",
            "purchase_timeline": "unknown",
        },
        "profiling_reprompt_counts": {
            "financing_type": 1,
            "purchase_timeline": 2,
        },
    }

    result = await tools._handle_close_lead(arguments, context)
    assert result["status"] == "ok"
    assert notified == []
    assert scored.get("called") is True
    assert scored["payload"]["profiling_statuses"]["purchase_timeline"] == "unknown"
    assert scored["payload"]["profiling_reprompt_counts"]["financing_type"] == 1
    assert promoted.get("called") is True
    assert auto_name_calls
    assert auto_name_calls[0]["intent"] == "Automatización"


@pytest.mark.asyncio
async def test_handle_close_lead_with_evasive_answers_keeps_flow_ok(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    contact = {"organizacion_id": "00000000-0000-0000-0000-0000000000bb"}

    async def fake_resolve_contact(_: str) -> dict:
        return contact

    async def fake_ensure(*_, **__):
        return "00000000-0000-0000-0000-0000000000dd"

    async def fake_noop(*_, **__):
        return None

    scored: dict[str, Any] = {}
    promoted: dict[str, Any] = {}

    async def fake_apply_lead_scoring(**kwargs: Any) -> dict[str, Any]:
        scored["payload"] = kwargs
        return {"score_total": 52, "grade": "interesado", "confidence": "low"}

    async def fake_promote_prequalified(**kwargs: Any) -> bool:
        promoted["payload"] = kwargs
        return False

    monkeypatch.setattr(tools, "_resolve_contact", fake_resolve_contact)
    monkeypatch.setattr(tools.storage, "ensure_conversation_opportunity", fake_ensure)
    monkeypatch.setattr(tools.storage, "update_contact", fake_noop)
    monkeypatch.setattr(tools.storage, "update_conversation", fake_noop)
    monkeypatch.setattr(tools.storage, "upsert_conversation_insights", fake_noop)
    monkeypatch.setattr(tools.storage, "maybe_auto_name_opportunity", fake_noop)
    monkeypatch.setattr(tools.storage, "apply_lead_scoring", fake_apply_lead_scoring)
    monkeypatch.setattr(tools.storage, "maybe_promote_prequalified_from_scoring", fake_promote_prequalified)
    monkeypatch.setattr(tools, "_notify_sales_rep", fake_noop)

    context = ToolRuntimeContext(
        conversation_id="conv-evasive",
        contact_id="contact-evasive",
        channel="whatsapp",
    )
    arguments = {
        "notes": "Prospecto con respuestas evasivas iniciales",
        "necesidad_proposito": "Quiere informacion y posible cita",
        "siguiente_accion": "Agendar cita",
        "financing_type": "refused",
        "budget_range": "unknown",
        "purchase_timeline": "unknown",
        "decision_authority": "refused",
    }

    result = await tools._handle_close_lead(arguments, context)

    assert result["status"] == "ok"
    assert scored["payload"]["answers"]["financing_type"] == "refused"
    assert scored["payload"]["answers"]["budget_range"] == "unknown"
    assert scored["payload"]["answers"]["purchase_timeline"] == "unknown"
    assert scored["payload"]["answers"]["decision_authority"] == "refused"
    assert scored["payload"]["events"]["appointment_requested"] is True
    assert promoted["payload"]["channel"] == "whatsapp"
