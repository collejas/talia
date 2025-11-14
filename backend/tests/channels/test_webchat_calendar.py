"""Pruebas para los endpoints REST de calendario webchat."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.channels.webchat import schemas, service


@pytest.mark.asyncio
async def test_get_calendar_availability_endpoint(monkeypatch, async_client):
    """El endpoint debe delegar a service.get_calendar_availability_response."""

    async def fake_availability_response(**kwargs):
        return schemas.AvailabilityResponse(
            status="ok",
            conversation_id=kwargs.get("conversation_id"),
            resource_id="res-1",
            timezone="America/Mexico_City",
            generated_at=datetime.now(timezone.utc),
            window_start=datetime.now(timezone.utc),
            window_end=datetime.now(timezone.utc),
            slot_duration_minutes=45,
            slots=[],
        )

    monkeypatch.setattr(service, "get_calendar_availability_response", fake_availability_response)

    response = await async_client.get(
        "/webchat/calendar/availability",
        params={"conversation_id": "conv-1"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["conversation_id"] == "conv-1"


@pytest.mark.asyncio
async def test_post_calendar_booking_endpoint(monkeypatch, async_client):
    """El endpoint debe delegar a schedule_calendar_booking y retornar su payload."""

    async def fake_schedule_calendar_booking(**kwargs):
        return schemas.CalendarBookingResponse(
            status="ok",
            booking_id="booking-1",
            resource_id="res-1",
            start_at=kwargs["start_at"],
            end_at=kwargs["start_at"],
            timezone="America/Mexico_City",
        )

    monkeypatch.setattr(service, "schedule_calendar_booking", fake_schedule_calendar_booking)

    payload = {
        "conversation_id": "conv-1",
        "slot_id": "slot-1",
        "start_at": datetime.now(timezone.utc).isoformat(),
    }
    response = await async_client.post("/webchat/calendar/bookings", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["booking_id"] == "booking-1"


@pytest.mark.asyncio
async def test_reschedule_calendar_booking_endpoint(monkeypatch, async_client):
    """El endpoint debe llamar reschedule_calendar_booking."""

    async def fake_reschedule(**kwargs):
        return schemas.CalendarBookingResponse(
            status="ok",
            booking_id=kwargs["booking_id"],
            resource_id="res-1",
            start_at=kwargs["start_at"],
            end_at=kwargs["start_at"],
            timezone="America/Mexico_City",
        )

    monkeypatch.setattr(service, "reschedule_calendar_booking", fake_reschedule)

    payload = {
        "conversation_id": "conv-1",
        "start_at": datetime.now(timezone.utc).isoformat(),
    }
    response = await async_client.post("/webchat/calendar/bookings/demo/reschedule", json=payload)

    assert response.status_code == 200
    assert response.json()["booking_id"] == "demo"


@pytest.mark.asyncio
async def test_cancel_calendar_booking_endpoint(monkeypatch, async_client):
    """El endpoint debe llamar cancel_calendar_booking."""

    async def fake_cancel(**kwargs):
        return schemas.CalendarBookingResponse(
            status="ok",
            booking_id=kwargs["booking_id"],
            resource_id="res-1",
            start_at=datetime.now(timezone.utc),
            end_at=datetime.now(timezone.utc),
            timezone="America/Mexico_City",
        )

    monkeypatch.setattr(service, "cancel_calendar_booking", fake_cancel)

    payload = {"conversation_id": "conv-1", "reason": "Cambio de plan"}
    response = await async_client.post("/webchat/calendar/bookings/demo/cancel", json=payload)

    assert response.status_code == 200
    assert response.json()["booking_id"] == "demo"
