from types import SimpleNamespace

import pytest

from app.assistants.tool_runtime import ToolRuntimeContext
from app.assistants.tools import lead as lead_tools


@pytest.mark.asyncio
async def test_mark_contact_ready_success(monkeypatch):
    async def fake_ensure(*, conversation_id, persona_id):
        assert conversation_id == "conv-1"
        assert persona_id == "contact-1"
        return True

    async def fake_capture(*, conversation_id, persona_id, channel):
        return True, "opp-123"

    monkeypatch.setattr(
        lead_tools.webchat_followups,
        "ensure_persona_ready_for_assignment",
        fake_ensure,
    )
    monkeypatch.setattr(
        lead_tools.storage,
        "capture_persona_lead_if_ready",
        fake_capture,
    )
    async def fake_noop(*_, **__):
        return None

    monkeypatch.setattr(lead_tools, "_refresh_webchat_followup_state", fake_noop)

    context = ToolRuntimeContext(
        conversation_id="conv-1",
        persona_id="contact-1",
        channel="webchat",
    )

    result = await lead_tools.try_execute_lead_tool(
        name="mark_contact_ready",
        arguments={},
        context=context,
    )

    assert result["status"] == "ok"
    assert result["contact_ready"] is True
    assert result["oportunidad_id"] == "opp-123"


@pytest.mark.asyncio
async def test_mark_contact_ready_requires_contact(monkeypatch):
    async def fake_ensure(**__):
        return False

    monkeypatch.setattr(
        lead_tools.webchat_followups,
        "ensure_persona_ready_for_assignment",
        fake_ensure,
    )
    async def fake_noop(*_, **__):
        return None

    monkeypatch.setattr(lead_tools, "_refresh_webchat_followup_state", fake_noop)

    context = ToolRuntimeContext(
        conversation_id="conv-2",
        persona_id="contact-2",
        channel="webchat",
    )

    with pytest.raises(ValueError):
        await lead_tools.try_execute_lead_tool(
            name="mark_contact_ready",
            arguments={},
            context=context,
        )


@pytest.mark.asyncio
async def test_close_lead_triggers_auto_name(monkeypatch):
    async def fake_ensure_contact_ready_for_assignment(**__):
        return True

    async def fake_ensure_persona_conversation_opportunity(**__):
        return "opp-123"

    async def fake_noop(*_, **__):
        return None

    async def fake_fetch_persona(*_, **__):
        return {"id": "contact-3", "organizacion_id": "00000000-0000-0000-0000-000000000001"}

    auto_name_calls = []
    scoring_calls = []
    prequalified_calls = []

    async def fake_auto_name(**kwargs):
        auto_name_calls.append(kwargs)
        return "Titulo IA"

    async def fake_apply_scoring(**kwargs):
        scoring_calls.append(kwargs)
        return {"score_total": 65, "grade": "interesado", "confidence": "medium"}

    async def fake_prequalified(**kwargs):
        prequalified_calls.append(kwargs)
        return False

    monkeypatch.setattr(
        lead_tools.webchat_followups,
        "ensure_persona_ready_for_assignment",
        fake_ensure_contact_ready_for_assignment,
    )
    monkeypatch.setattr(
        lead_tools.storage,
        "fetch_latest_conversation_summary",
        fake_noop,
    )
    monkeypatch.setattr(
        lead_tools.storage,
        "ensure_persona_conversation_opportunity",
        fake_ensure_persona_conversation_opportunity,
    )
    monkeypatch.setattr(lead_tools.storage, "update_persona", fake_noop)
    monkeypatch.setattr(lead_tools.storage, "update_conversation", fake_noop)
    monkeypatch.setattr(lead_tools.storage, "upsert_conversation_insights", fake_noop)
    monkeypatch.setattr(lead_tools.storage, "fetch_persona", fake_fetch_persona)
    monkeypatch.setattr(lead_tools.storage, "sync_persona_opportunity_context", fake_noop)
    monkeypatch.setattr(lead_tools.storage, "maybe_auto_name_persona_opportunity", fake_auto_name)
    monkeypatch.setattr(lead_tools.storage, "apply_persona_lead_scoring", fake_apply_scoring)
    monkeypatch.setattr(
        lead_tools.storage,
        "maybe_promote_prequalified_from_persona",
        fake_prequalified,
    )
    monkeypatch.setattr(lead_tools, "_refresh_webchat_followup_state", fake_noop)

    context = ToolRuntimeContext(
        conversation_id="conv-3",
        persona_id="contact-3",
        channel="webchat",
    )

    result = await lead_tools.try_execute_lead_tool(
        name="close_lead",
        arguments={
            "notes": "Quiere invertir en casas",
            "necesidad_proposito": "Agendar cita para conocer casas",
        },
        context=context,
    )

    assert result is not None
    assert result["status"] == "ok"
    assert auto_name_calls
    assert scoring_calls
    assert prequalified_calls
    assert auto_name_calls[0]["opportunity_id"] == "opp-123"


@pytest.mark.asyncio
async def test_close_lead_webchat_with_evasive_answers_keeps_flow_ok(monkeypatch):
    async def fake_ensure_contact_ready_for_assignment(**__):
        return True

    async def fake_ensure_persona_conversation_opportunity(**__):
        return "opp-999"

    async def fake_noop(*_, **__):
        return None

    async def fake_fetch_persona(*_, **__):
        return {"id": "contact-9", "organizacion_id": "00000000-0000-0000-0000-000000000001"}

    scoring_calls = []
    prequalified_calls = []

    async def fake_apply_scoring(**kwargs):
        scoring_calls.append(kwargs)
        return {"score_total": 50, "grade": "explorando", "confidence": "low"}

    async def fake_prequalified(**kwargs):
        prequalified_calls.append(kwargs)
        return False

    monkeypatch.setattr(
        lead_tools.webchat_followups,
        "ensure_persona_ready_for_assignment",
        fake_ensure_contact_ready_for_assignment,
    )
    monkeypatch.setattr(
        lead_tools.storage,
        "fetch_latest_conversation_summary",
        fake_noop,
    )
    monkeypatch.setattr(
        lead_tools.storage,
        "ensure_persona_conversation_opportunity",
        fake_ensure_persona_conversation_opportunity,
    )
    monkeypatch.setattr(lead_tools.storage, "update_persona", fake_noop)
    monkeypatch.setattr(lead_tools.storage, "update_conversation", fake_noop)
    monkeypatch.setattr(lead_tools.storage, "upsert_conversation_insights", fake_noop)
    monkeypatch.setattr(lead_tools.storage, "fetch_persona", fake_fetch_persona)
    monkeypatch.setattr(lead_tools.storage, "sync_persona_opportunity_context", fake_noop)
    monkeypatch.setattr(lead_tools.storage, "maybe_auto_name_persona_opportunity", fake_noop)
    monkeypatch.setattr(lead_tools.storage, "apply_persona_lead_scoring", fake_apply_scoring)
    monkeypatch.setattr(
        lead_tools.storage,
        "maybe_promote_prequalified_from_persona",
        fake_prequalified,
    )
    monkeypatch.setattr(lead_tools, "_refresh_webchat_followup_state", fake_noop)

    context = ToolRuntimeContext(
        conversation_id="conv-9",
        persona_id="contact-9",
        channel="webchat",
    )

    result = await lead_tools.try_execute_lead_tool(
        name="close_lead",
        arguments={
            "notes": "Responde con evasivas en precalificacion",
            "necesidad_proposito": "Quiere evaluar una cita",
            "siguiente_accion": "Agendar visita",
            "financing_type": "refused",
            "budget_range": "unknown",
            "purchase_timeline": "unknown",
            "decision_authority": "refused",
            "profiling_statuses": {
                "financing_type": "refused",
                "purchase_timeline": "unknown",
                "decision_authority": "skipped_max_retries",
            },
            "profiling_reprompt_counts": {
                "decision_authority": 2,
            },
        },
        context=context,
    )

    assert result is not None
    assert result["status"] == "ok"
    assert scoring_calls
    assert prequalified_calls
    payload = scoring_calls[0]
    assert payload["answers"]["financing_type"] == "refused"
    assert payload["answers"]["budget_range"] == "unknown"
    assert payload["answers"]["purchase_timeline"] == "unknown"
    assert payload["answers"]["decision_authority"] == "refused"
    assert payload["profiling_statuses"]["decision_authority"] == "skipped_max_retries"
    assert payload["profiling_reprompt_counts"]["decision_authority"] == 2
    assert payload["events"]["appointment_requested"] is True


@pytest.mark.asyncio
async def test_information_package_defaults_webchat_channel_to_webchat_documents(monkeypatch):
    async def fake_fetch_persona(persona_id):
        assert persona_id == "persona-webchat"
        return {"id": persona_id, "organizacion_id": "00000000-0000-0000-0000-000000000001"}

    async def fake_mail_settings(**__):
        return SimpleNamespace(username=None, from_name=None)

    async def fake_template(*_, **__):
        return None

    resolved_calls = []

    async def fake_resolve_documents_for_context(*, context, channel_scope, document_ids=None, category=None, limit=3):
        resolved_calls.append(
            {
                "channel_scope": channel_scope,
                "document_ids": document_ids,
                "category": category,
                "limit": limit,
                "context_channel": context.channel,
            }
        )
        return [
            {
                "id": "doc-1",
                "title": "Porta Mezquite",
                "channel_scope": "both",
                "category": "presentacion",
                "mime": "application/pdf",
                "url": "https://example.com/porta-mezquite.pdf",
                "delivery_url": "https://example.com/porta-mezquite.pdf",
            }
        ]

    monkeypatch.setattr(lead_tools, "_fetch_persona", fake_fetch_persona)
    monkeypatch.setattr(lead_tools.tenant_runtime, "get_mail_runtime_settings", fake_mail_settings)
    monkeypatch.setattr(lead_tools.storage, "fetch_email_template", fake_template)
    monkeypatch.setattr(lead_tools.document_delivery_service, "resolve_documents_for_context", fake_resolve_documents_for_context)

    result = await lead_tools._handle_information_package(
        arguments={},
        context=ToolRuntimeContext(
            conversation_id="conv-webchat",
            persona_id="persona-webchat",
            channel="webchat",
            organizacion_id="00000000-0000-0000-0000-000000000001",
        ),
    )

    assert result["channels"] == ["webchat"]
    assert result["webchat"]["status"] == "ok"
    assert result["webchat"]["documents"][0]["category"] == "presentacion"
    assert resolved_calls[0]["channel_scope"] == "webchat"
