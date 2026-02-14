import pytest

from app.assistants.tool_runtime import ToolRuntimeContext
from app.assistants.tools import lead as lead_tools


@pytest.mark.asyncio
async def test_mark_contact_ready_success(monkeypatch):
    async def fake_ensure(*, conversation_id, contact_id):
        assert conversation_id == "conv-1"
        assert contact_id == "contact-1"
        return True

    async def fake_capture(*, conversation_id, contact_id, channel):
        return True, "opp-123"

    monkeypatch.setattr(
        lead_tools.webchat_followups,
        "ensure_contact_ready_for_assignment",
        fake_ensure,
    )
    monkeypatch.setattr(
        lead_tools.storage,
        "capture_opportunity_if_ready",
        fake_capture,
    )
    async def fake_noop(*_, **__):
        return None

    monkeypatch.setattr(lead_tools, "_refresh_webchat_followup_state", fake_noop)

    context = ToolRuntimeContext(
        conversation_id="conv-1",
        contact_id="contact-1",
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
        "ensure_contact_ready_for_assignment",
        fake_ensure,
    )
    async def fake_noop(*_, **__):
        return None

    monkeypatch.setattr(lead_tools, "_refresh_webchat_followup_state", fake_noop)

    context = ToolRuntimeContext(
        conversation_id="conv-2",
        contact_id="contact-2",
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

    async def fake_ensure_conversation_opportunity(**__):
        return "opp-123"

    async def fake_noop(*_, **__):
        return None

    async def fake_fetch_contact(*_, **__):
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
        "ensure_contact_ready_for_assignment",
        fake_ensure_contact_ready_for_assignment,
    )
    monkeypatch.setattr(
        lead_tools.storage,
        "ensure_conversation_opportunity",
        fake_ensure_conversation_opportunity,
    )
    monkeypatch.setattr(lead_tools.storage, "update_contact", fake_noop)
    monkeypatch.setattr(lead_tools.storage, "update_conversation", fake_noop)
    monkeypatch.setattr(lead_tools.storage, "upsert_conversation_insights", fake_noop)
    monkeypatch.setattr(lead_tools.storage, "fetch_contact", fake_fetch_contact)
    monkeypatch.setattr(lead_tools.storage, "maybe_auto_name_opportunity", fake_auto_name)
    monkeypatch.setattr(lead_tools.storage, "apply_lead_scoring", fake_apply_scoring)
    monkeypatch.setattr(
        lead_tools.storage,
        "maybe_promote_prequalified_from_scoring",
        fake_prequalified,
    )
    monkeypatch.setattr(lead_tools, "_refresh_webchat_followup_state", fake_noop)
    monkeypatch.setattr(lead_tools.webchat_notifications, "notify_sales_rep", fake_noop)

    context = ToolRuntimeContext(
        conversation_id="conv-3",
        contact_id="contact-3",
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

    async def fake_ensure_conversation_opportunity(**__):
        return "opp-999"

    async def fake_noop(*_, **__):
        return None

    async def fake_fetch_contact(*_, **__):
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
        "ensure_contact_ready_for_assignment",
        fake_ensure_contact_ready_for_assignment,
    )
    monkeypatch.setattr(
        lead_tools.storage,
        "ensure_conversation_opportunity",
        fake_ensure_conversation_opportunity,
    )
    monkeypatch.setattr(lead_tools.storage, "update_contact", fake_noop)
    monkeypatch.setattr(lead_tools.storage, "update_conversation", fake_noop)
    monkeypatch.setattr(lead_tools.storage, "upsert_conversation_insights", fake_noop)
    monkeypatch.setattr(lead_tools.storage, "fetch_contact", fake_fetch_contact)
    monkeypatch.setattr(lead_tools.storage, "maybe_auto_name_opportunity", fake_noop)
    monkeypatch.setattr(lead_tools.storage, "apply_lead_scoring", fake_apply_scoring)
    monkeypatch.setattr(
        lead_tools.storage,
        "maybe_promote_prequalified_from_scoring",
        fake_prequalified,
    )
    monkeypatch.setattr(lead_tools, "_refresh_webchat_followup_state", fake_noop)
    monkeypatch.setattr(lead_tools.webchat_notifications, "notify_sales_rep", fake_noop)

    context = ToolRuntimeContext(
        conversation_id="conv-9",
        contact_id="contact-9",
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
    assert payload["events"]["appointment_requested"] is True
