"""Pruebas de alcance de destinatarios para notificaciones del Inbox."""

from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from app.services import storage


class NotificationRepo:
    def __init__(
        self,
        *,
        conversation: dict[str, object],
        supervisors: list[UUID] | None = None,
        opportunity_assignee: UUID | None = None,
        permitted_users: set[UUID] | None = None,
    ) -> None:
        self.conversation = conversation
        self.supervisors = supervisors or []
        self.opportunity_assignee = opportunity_assignee
        self.permitted_users = permitted_users or set()
        self.global_fallback_called = False
        self.assignment_calls: list[dict[str, object]] = []

    async def get_conversation_summary(self, *, conversation_id: UUID) -> dict[str, object]:
        return self.conversation

    async def list_opportunities_by_conversation_ids(self, **_: object) -> list[dict[str, object]]:
        if self.opportunity_assignee is None:
            return []
        return [{"asignado_a_usuario_id": str(self.opportunity_assignee)}]

    async def assign_conversation_if_unassigned(
        self, *, organizacion_id: UUID, conversation_id: str, usuario_id: UUID
    ) -> dict[str, object]:
        self.assignment_calls.append(
            {
                "organizacion_id": organizacion_id,
                "conversation_id": conversation_id,
                "usuario_id": usuario_id,
            }
        )
        self.conversation["asignado_a_usuario_id"] = str(usuario_id)
        return self.conversation

    async def list_supervisor_user_ids_for_sales_rep(
        self, *, organizacion_id: UUID, empleado_usuario_id: UUID
    ) -> list[UUID]:
        return self.supervisors

    async def user_has_permission(
        self, *, organizacion_id: UUID, usuario_id: UUID, codigo: str
    ) -> bool:
        return codigo == "ver_inbox" and usuario_id in self.permitted_users

    async def list_user_ids_with_permission(self, **_: object) -> list[UUID]:
        self.global_fallback_called = True
        return list(self.permitted_users)


@pytest.mark.asyncio
async def test_inbox_recipients_are_assignee_and_permitted_supervisors() -> None:
    organization_id = uuid4()
    assignee = uuid4()
    permitted_supervisor = uuid4()
    denied_supervisor = uuid4()
    repo = NotificationRepo(
        conversation={"asignado_a_usuario_id": str(assignee)},
        supervisors=[permitted_supervisor, denied_supervisor],
        permitted_users={assignee, permitted_supervisor},
    )

    recipients = await storage._resolve_inbox_notification_users(
        repo=repo,
        organizacion_id=organization_id,
        conversation_id=uuid4(),
    )

    assert recipients == [assignee, permitted_supervisor]
    assert repo.global_fallback_called is False


@pytest.mark.asyncio
async def test_inbox_recipients_recover_assignee_from_opportunity() -> None:
    organization_id = uuid4()
    assignee = uuid4()
    repo = NotificationRepo(
        conversation={"asignado_a_usuario_id": None},
        opportunity_assignee=assignee,
        permitted_users={assignee},
    )

    recipients = await storage._resolve_inbox_notification_users(
        repo=repo,
        organizacion_id=organization_id,
        conversation_id=uuid4(),
    )

    assert recipients == [assignee]


@pytest.mark.asyncio
async def test_inbox_without_assignment_does_not_broadcast() -> None:
    organization_id = uuid4()
    repo = NotificationRepo(
        conversation={"asignado_a_usuario_id": None},
        permitted_users={uuid4(), uuid4()},
    )

    recipients = await storage._resolve_inbox_notification_users(
        repo=repo,
        organizacion_id=organization_id,
        conversation_id=uuid4(),
    )

    assert recipients == []
    assert repo.global_fallback_called is False


@pytest.mark.asyncio
async def test_inbound_assignment_repairs_conversation_from_existing_opportunity() -> None:
    organization_id = uuid4()
    assignee = uuid4()
    conversation_id = str(uuid4())
    repo = NotificationRepo(
        conversation={"asignado_a_usuario_id": None},
        opportunity_assignee=assignee,
    )

    await storage._ensure_inbound_assignment_before_notification(
        repo=repo,
        organizacion_id=organization_id,
        conversation_id=conversation_id,
        persona_id=str(uuid4()),
        channel="whatsapp",
    )

    assert repo.assignment_calls == [
        {
            "organizacion_id": organization_id,
            "conversation_id": conversation_id,
            "usuario_id": assignee,
        }
    ]
    assert repo.conversation["asignado_a_usuario_id"] == str(assignee)


@pytest.mark.asyncio
async def test_inbox_notification_retries_until_assignment_is_visible(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    organization_id = uuid4()
    assignee = uuid4()

    class EventuallyAssignedRepo(NotificationRepo):
        attempts = 0

        async def get_conversation_summary(self, *, conversation_id: UUID) -> dict[str, object]:
            return {"asignado_a_usuario_id": None}

        async def list_opportunities_by_conversation_ids(self, **_: object) -> list[dict[str, object]]:
            self.attempts += 1
            if self.attempts < 2:
                return []
            return [{"asignado_a_usuario_id": str(assignee)}]

    repo = EventuallyAssignedRepo(
        conversation={"asignado_a_usuario_id": None},
        permitted_users={assignee},
    )
    create_notification = AsyncMock()
    monkeypatch.setattr(storage, "create_and_publish_user_notification", create_notification)
    monkeypatch.setattr(storage, "INBOX_NOTIFICATION_RETRY_DELAYS_SECONDS", (0.0, 0.0))

    await storage._notify_inbox_message(
        repo=repo,
        organizacion_id=organization_id,
        conversation_id=str(uuid4()),
        persona_id=str(uuid4()),
        channel="whatsapp",
        direction="entrante",
        message_text="Hola",
        message_id=str(uuid4()),
    )

    create_notification.assert_awaited_once()
