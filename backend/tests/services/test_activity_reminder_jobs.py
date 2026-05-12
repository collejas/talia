from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest

from app.services import activity_reminder_jobs


class FakeRepo:
    def __init__(self, existing: dict | None = None) -> None:
        self.existing = existing
        self.updated_payloads: list[dict] = []

    async def get_ui_notification_by_dedupe_key(self, **kwargs):
        return self.existing

    async def update_activity(self, **kwargs):
        self.updated_payloads.append(kwargs["payload"])
        return {
            "id": str(kwargs["activity_id"]),
            "organizacion_id": str(kwargs["organizacion_id"]),
            "recordatorio_notificado_en": kwargs["payload"].get("recordatorio_notificado_en"),
        }


@pytest.mark.asyncio
async def test_activity_reminder_creates_notification_and_marks_activity(monkeypatch: pytest.MonkeyPatch) -> None:
    create_mock = AsyncMock(
        return_value={
            "id": "notif-1",
            "created_at": "2026-05-12T17:30:00Z",
        }
    )
    monkeypatch.setattr(activity_reminder_jobs, "create_and_publish_user_notification", create_mock)
    runner = activity_reminder_jobs.ActivityReminderJobsRunner()
    repo = FakeRepo()
    activity_id = uuid.uuid4()
    row = {
        "id": str(activity_id),
        "organizacion_id": str(uuid.uuid4()),
        "asunto": "Llamar al cliente",
        "tipo": "seguimiento",
        "recordatorio_en": "2026-05-12T17:00:00Z",
        "asignado_a_usuario_id": str(uuid.uuid4()),
        "creado_por_usuario_id": str(uuid.uuid4()),
        "oportunidad_id": str(uuid.uuid4()),
        "contacto_id": str(uuid.uuid4()),
        "recordatorio_notificado_en": None,
    }

    await runner._process_activity(repo=repo, row=row)

    create_mock.assert_awaited_once()
    notification = create_mock.await_args.kwargs["notification"]
    assert notification.type == "activity.reminder_due"
    assert notification.entity_id == str(activity_id)
    assert notification.action and notification.action.href.startswith("/embudo?oportunidadId=")
    assert repo.updated_payloads
    assert repo.updated_payloads[0]["recordatorio_notificado_en"] == "2026-05-12T17:30:00Z"


@pytest.mark.asyncio
async def test_activity_reminder_skips_when_notification_exists(monkeypatch: pytest.MonkeyPatch) -> None:
    create_mock = AsyncMock()
    monkeypatch.setattr(activity_reminder_jobs, "create_and_publish_user_notification", create_mock)
    runner = activity_reminder_jobs.ActivityReminderJobsRunner()
    repo = FakeRepo(existing={"id": "notif-1", "created_at": "2026-05-12T17:30:00Z"})
    row = {
        "id": str(uuid.uuid4()),
        "organizacion_id": str(uuid.uuid4()),
        "asunto": "Llamar al cliente",
        "tipo": "seguimiento",
        "recordatorio_en": "2026-05-12T17:00:00Z",
        "asignado_a_usuario_id": str(uuid.uuid4()),
        "creado_por_usuario_id": str(uuid.uuid4()),
        "recordatorio_notificado_en": None,
    }

    await runner._process_activity(repo=repo, row=row)

    create_mock.assert_not_called()
    assert repo.updated_payloads
    assert repo.updated_payloads[0]["recordatorio_notificado_en"] == "2026-05-12T17:30:00Z"
