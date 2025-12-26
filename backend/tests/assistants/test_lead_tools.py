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
    async def fake_ensure(*, **__):
        return False

    monkeypatch.setattr(
        lead_tools.webchat_followups,
        "ensure_contact_ready_for_assignment",
        fake_ensure,
    )

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
