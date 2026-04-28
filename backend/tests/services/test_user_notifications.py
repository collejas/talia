from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest

from app.services import user_notifications


def test_user_notifications_topic_scopes_by_org_and_user() -> None:
    assert user_notifications.user_notifications_topic_for_user(
        organizacion_id="org-123",
        usuario_id="user-456",
    ) == "org:org-123:user:user-456:notifications"


@pytest.mark.asyncio
async def test_publish_user_notification_event_uses_scoped_topic(monkeypatch: pytest.MonkeyPatch) -> None:
    publish_mock = AsyncMock()
    monkeypatch.setattr(user_notifications.ui_realtime_hub, "publish", publish_mock)

    row = {
        "id": "c0a8013b-7d6f-4d3b-99d2-f62ce4e8e111",
        "organizacion_id": "11111111-1111-1111-1111-111111111111",
        "usuario_id": "22222222-2222-2222-2222-222222222222",
        "tipo": "scraper.finished",
        "nivel": "success",
        "mensaje": "Listo",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await user_notifications.publish_user_notification_event(row)

    publish_mock.assert_awaited_once()
    topic, payload = publish_mock.await_args.args
    assert topic == "org:11111111-1111-1111-1111-111111111111:user:22222222-2222-2222-2222-222222222222:notifications"
    assert payload["organizacion_id"] == "11111111-1111-1111-1111-111111111111"
    assert payload["user_id"] == "22222222-2222-2222-2222-222222222222"
