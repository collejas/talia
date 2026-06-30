"""Tests for the webchat assignment gate helpers."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.channels.webchat import service


@pytest.mark.asyncio
async def test_schedule_calendar_booking_requires_contact(monkeypatch):
    """El flujo de calendario debe fallar si no hay información de contacto."""
    async def fake_fetch_webchat_conversation(conversation_id: str):
        return {"contact_id": "contact-1", "channel": "webchat"}

    async def fake_fetch_persona(contact_id: str):
        return {"id": contact_id, "telefono_e164": "", "correo": ""}

    async def fake_failing_calendar(**kwargs):
        raise AssertionError("No debe reservarse la cita cuando falta contacto")

    async def fake_ensure_conversation_opportunity(*args, **kwargs):
        pytest.fail("No debe llamarse a ensure_conversation_opportunity")

    async def fake_ensure_contact_ready(**kwargs):
        return False

    monkeypatch.setattr(
        service.storage,
        "fetch_webchat_conversation",
        fake_fetch_webchat_conversation,
    )
    monkeypatch.setattr(service.storage, "fetch_persona", fake_fetch_persona)
    monkeypatch.setattr(
        service.webchat_followups,
        "ensure_contact_ready_for_assignment",
        fake_ensure_contact_ready,
    )
    monkeypatch.setattr(
        service.storage,
        "ensure_conversation_opportunity",
        fake_ensure_conversation_opportunity,
    )
    monkeypatch.setattr(service.calendar_service, "hold_slot", fake_failing_calendar)
    monkeypatch.setattr(service.calendar_service, "confirm_slot", fake_failing_calendar)

    with pytest.raises(ValueError) as excinfo:
        await service.schedule_calendar_booking(
            conversation_id="conv-1",
            slot_id="slot-1",
            start_at=datetime.now(timezone.utc),
            notes=None,
            session_id=None,
        )
    assert str(excinfo.value) == service.CONTACT_ASSIGNMENT_ERROR


@pytest.mark.asyncio
async def test_schedule_demo_requires_contact(monkeypatch):
    """La tool de schedule_demo debe rechazar la llamada si falta contacto."""
    async def fake_ensure_contact_ready(**kwargs):
        return False

    async def fake_ensure_conversation_opportunity(*args, **kwargs):
        pytest.fail("No debe llamarse a ensure_conversation_opportunity")

    async def fake_calendar_action(**kwargs):
        pytest.fail("No debe interactuar con el calendario")

    async def fake_fetch_persona(contact_id: str):
        return {"id": contact_id, "telefono_e164": "", "correo": ""}

    monkeypatch.setattr(
        service.webchat_followups,
        "ensure_contact_ready_for_assignment",
        fake_ensure_contact_ready,
    )
    monkeypatch.setattr(service.storage, "fetch_persona", fake_fetch_persona)
    monkeypatch.setattr(
        service.storage,
        "ensure_conversation_opportunity",
        fake_ensure_conversation_opportunity,
    )
    monkeypatch.setattr(service.calendar_service, "hold_slot", fake_calendar_action)
    monkeypatch.setattr(service.calendar_service, "confirm_slot", fake_calendar_action)

    context = service.WebchatContext(
        conversation_id="conv-1",
        persona_id="contact-1",
        session_id="session-1",
    )
    start_at = datetime.now(timezone.utc).isoformat()
    arguments = {"slot_id": "slot-1", "start_at": start_at}

    with pytest.raises(ValueError) as excinfo:
        await service._execute_function_call("schedule_demo", arguments, context)
    assert str(excinfo.value) == service.CONTACT_ASSIGNMENT_ERROR
