"""Pruebas de alcance de destinatarios para notificaciones del Inbox."""

from __future__ import annotations

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

    async def get_conversation_summary(self, *, conversation_id: UUID) -> dict[str, object]:
        return self.conversation

    async def list_opportunities_by_conversation_ids(self, **_: object) -> list[dict[str, object]]:
        if self.opportunity_assignee is None:
            return []
        return [{"asignado_a_usuario_id": str(self.opportunity_assignee)}]

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
