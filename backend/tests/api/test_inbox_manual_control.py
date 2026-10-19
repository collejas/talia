from __future__ import annotations

from uuid import UUID
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api.routes import crm as crm_routes


CONVERSATION_ID = UUID("11111111-1111-1111-1111-111111111111")
USER_ID = UUID("22222222-2222-2222-2222-222222222222")


class ManualControlRepo:
    def __init__(self, *, assigned_user_id: UUID = USER_ID, channel: str = "whatsapp") -> None:
        self.assigned_user_id = assigned_user_id
        self.channel = channel

    async def get_permission_context(self) -> dict[str, str]:
        return {"usuario_id": str(USER_ID)}

    async def get_conversation_with_controls(self, *, conversation_id: str) -> dict[str, str]:
        assert conversation_id == str(CONVERSATION_ID)
        return {
            "asignado_a_usuario_id": str(self.assigned_user_id),
            "canal": self.channel,
        }


@pytest.mark.asyncio
@pytest.mark.parametrize("channel", ["whatsapp", "webchat", "correo"])
async def test_assigned_agent_can_toggle_manual_mode(monkeypatch, channel: str) -> None:
    set_manual_override = AsyncMock()
    monkeypatch.setattr(crm_routes.storage, "set_manual_override", set_manual_override)

    response = await crm_routes.set_inbox_manual_mode(
        _="messages.write",
        user_token="user-token",
        repo=ManualControlRepo(channel=channel),
        conversacion_id=CONVERSATION_ID,
        payload=crm_routes.ManualOverridePayload(manual=True),
    )

    assert response == {"ok": True, "manual": True}
    set_manual_override.assert_awaited_once_with(
        str(CONVERSATION_ID), True, user_token="user-token"
    )


@pytest.mark.asyncio
async def test_unassigned_agent_cannot_toggle_manual_mode(monkeypatch) -> None:
    set_manual_override = AsyncMock()
    monkeypatch.setattr(crm_routes.storage, "set_manual_override", set_manual_override)

    with pytest.raises(HTTPException) as error:
        await crm_routes.set_inbox_manual_mode(
            _="messages.write",
            user_token="user-token",
            repo=ManualControlRepo(assigned_user_id=UUID("33333333-3333-3333-3333-333333333333")),
            conversacion_id=CONVERSATION_ID,
            payload=crm_routes.ManualOverridePayload(manual=True),
        )

    assert error.value.status_code == 403
    assert error.value.detail == "manual_control_assignment_required"
    set_manual_override.assert_not_awaited()


@pytest.mark.asyncio
async def test_manual_mode_rejects_unknown_channel(monkeypatch) -> None:
    set_manual_override = AsyncMock()
    monkeypatch.setattr(crm_routes.storage, "set_manual_override", set_manual_override)

    with pytest.raises(HTTPException) as error:
        await crm_routes.set_inbox_manual_mode(
            _="messages.write",
            user_token="user-token",
            repo=ManualControlRepo(channel="sms"),
            conversacion_id=CONVERSATION_ID,
            payload=crm_routes.ManualOverridePayload(manual=True),
        )

    assert error.value.status_code == 400
    assert error.value.detail == "manual_control_channel_invalid"
    set_manual_override.assert_not_awaited()
