"""Pruebas para los endpoints HTTP del canal webchat."""

from __future__ import annotations

import importlib

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_availability_with_conversation(
    async_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict[str, object] = {}

    async def fake_compute(**kwargs):
        captured.update(kwargs)
        return {
            "status": "ok",
            "conversation_id": kwargs.get("conversation_id"),
            "timezone": kwargs.get("timezone_name"),
            "generated_at": "2025-11-09T19:00:00Z",
            "window_start": "2025-11-10T08:00:00-06:00",
            "window_end": "2025-11-12T18:00:00-06:00",
            "slot_duration_minutes": kwargs.get("slot_minutes") or 45,
            "slots": [
                {
                    "start_at": "2025-11-10T11:00:00-06:00",
                    "end_at": "2025-11-10T11:45:00-06:00",
                    "timezone": kwargs.get("timezone_name"),
                    "label": "Lunes 10/11 · 11:00 America/Mexico_City",
                    "weekday": 1,
                    "local_date": "2025-11-10",
                    "local_time": "11:00",
                }
            ],
        }

    module = importlib.import_module("app.channels.webchat.router")
    monkeypatch.setattr(module, "compute_demo_availability", fake_compute)

    response = await async_client.get(
        "/webchat/availability",
        params={
            "conversation_id": "conv-12345678",
            "timezone": "America/Mexico_City",
            "slot_minutes": 60,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["conversation_id"] == "conv-12345678"
    assert payload["timezone"] == "America/Mexico_City"
    assert len(payload["slots"]) == 1
    assert captured["conversation_id"] == "conv-12345678"
    assert captured["timezone_name"] == "America/Mexico_City"
    assert captured["slot_minutes"] == 60


@pytest.mark.asyncio
async def test_get_availability_with_session(
    async_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_compute(**kwargs):
        return {
            "status": "ok",
            "conversation_id": kwargs.get("conversation_id"),
            "timezone": kwargs.get("timezone_name"),
            "generated_at": "2025-11-09T19:00:00Z",
            "window_start": "2025-11-10T08:00:00-06:00",
            "window_end": "2025-11-12T18:00:00-06:00",
            "slot_duration_minutes": 45,
            "slots": [],
        }

    async def fake_resolve(session_id: str):
        assert session_id == "sess-1"
        return {"id": "conv-session", "contact_id": "contact-1", "manual_override": False}

    module = importlib.import_module("app.channels.webchat.router")
    monkeypatch.setattr(module, "compute_demo_availability", fake_compute)
    monkeypatch.setattr(module.storage, "resolve_webchat_conversation_from_session", fake_resolve)

    response = await async_client.get(
        "/webchat/availability",
        params={
            "session_id": "sess-1",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["conversation_id"] == "conv-session"


@pytest.mark.asyncio
async def test_get_availability_requires_identifier(async_client: AsyncClient) -> None:
    response = await async_client.get("/webchat/availability")
    assert response.status_code == 400
    assert response.json()["detail"] == "conversation_or_session_required"


@pytest.mark.asyncio
async def test_get_availability_validates_datetime(async_client: AsyncClient) -> None:
    response = await async_client.get(
        "/webchat/availability",
        params={"conversation_id": "conv-12345678", "earliest_start_at": "fecha-invalida"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "earliest_start_at_invalid"
