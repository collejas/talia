"""Pruebas unitarias para el cliente de calendario."""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from app.services import calendar
from app.services.calendar import CalendarError


@pytest.mark.asyncio
async def test_list_slots_returns_only_available(monkeypatch):
    """list_slots transforma la respuesta y calcula slot_duration."""

    async def fake_call_rpc(function: str, payload: dict):
        assert function == "fn_calendar_list_slots"
        assert payload["p_resource_id"] == "res-1"
        assert payload["p_from"] == "2025-03-01"
        assert payload["p_to"] == "2025-03-03"
        return [
            {
                "slot_start": "2025-03-01T15:00:00+00:00",
                "slot_end": "2025-03-01T15:45:00+00:00",
                "timezone": "UTC",
                "local_date": "2025-03-01",
                "local_time": "09:00",
                "capacity": 1,
                "booked": 0,
                "holds": 0,
                "is_available": True,
            },
            {
                "slot_start": "2025-03-01T16:00:00+00:00",
                "slot_end": "2025-03-01T16:45:00+00:00",
                "timezone": "UTC",
                "local_date": "2025-03-01",
                "local_time": "10:00",
                "capacity": 1,
                "booked": 1,
                "holds": 0,
                "is_available": False,
            },
        ]

    monkeypatch.setattr(calendar, "_call_rpc", fake_call_rpc)

    result = await calendar.list_slots(
        resource_id="res-1",
        start_date=date(2025, 3, 1),
        end_date=date(2025, 3, 3),
        timezone_hint="America/Mexico_City",
        max_days=3,
    )

    assert result["resource_id"] == "res-1"
    assert result["timezone"] == "America/Mexico_City"
    assert result["slot_duration_minutes"] == 45
    assert len(result["slots"]) == 2
    assert result["slots"][0]["slot_id"]


@pytest.mark.asyncio
async def test_hold_slot_returns_metadata(monkeypatch):
    """hold_slot encapsula correctamente la respuesta del RPC."""

    async def fake_call_rpc(function: str, payload: dict):
        assert function == "fn_calendar_hold_slot"
        assert payload["p_metadata"]["source"] == "webchat"
        return [
            {
                "hold_id": "hold-123",
                "resource_id": payload["p_resource_id"],
                "slot_start": payload["p_slot_start"],
                "slot_end": "2025-03-01T15:45:00+00:00",
                "expires_at": "2025-03-01T15:05:00+00:00",
            }
        ]

    monkeypatch.setattr(calendar, "_call_rpc", fake_call_rpc)

    slot_start = datetime(2025, 3, 1, 15, tzinfo=timezone.utc)
    result = await calendar.hold_slot(
        resource_id="res-1",
        slot_start=slot_start,
        conversation_id="conv-1",
        contact_id="contact-1",
        metadata={"source": "webchat"},
    )

    assert result["hold_id"] == "hold-123"
    assert result["resource_id"] == "res-1"
    assert result["slot_start"] == slot_start.isoformat()


@pytest.mark.asyncio
async def test_confirm_slot_raises_when_rpc_returns_empty(monkeypatch):
    """confirm_slot debe convertir respuestas vacías en CalendarError."""

    async def fake_call_rpc(function: str, payload: dict):
        assert function == "fn_calendar_confirm_slot"
        return []

    monkeypatch.setattr(calendar, "_call_rpc", fake_call_rpc)

    with pytest.raises(CalendarError):
        await calendar.confirm_slot(hold_id="hold-404")
