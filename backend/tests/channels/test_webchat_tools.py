"""Pruebas unitarias para las nuevas tools de agenda en el webchat."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from zoneinfo import ZoneInfo

from app.channels.webchat.service import WebchatContext, _execute_function_call
from app.services import storage


@pytest.mark.asyncio
async def test_list_demo_slots_invoca_servicio(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    async def fake_compute(**kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {
            "status": "ok",
            "timezone": kwargs.get("timezone_name"),
            "slots": [
                {
                    "start_at": "2025-11-10T11:00:00-06:00",
                    "end_at": "2025-11-10T11:45:00-06:00",
                    "timezone": kwargs.get("timezone_name"),
                }
            ],
        }

    monkeypatch.setattr("app.channels.webchat.service.compute_demo_availability", fake_compute)

    context = WebchatContext(
        conversation_id="conv-list",
        contact_id="contact-ctx",
        session_id="session-list",
    )
    result = await _execute_function_call(
        "list_demo_slots",
        {
            "timezone": "America/Mexico_City",
            "earliest_start_at": "2025-11-10T09:00:00-06:00",
            "preferred_start_at": "2025-11-11T11:30:00-06:00",
            "days": 10,
            "max_slots": 4,
            "slot_minutes": 50,
        },
        context,
    )

    assert result["status"] == "ok"
    assert len(result["slots"]) == 1
    assert captured["conversation_id"] == "conv-list"
    assert captured["timezone_name"] == "America/Mexico_City"
    assert captured["days"] == 10
    assert captured["max_slots"] == 4
    assert captured["slot_minutes"] == 50
    assert captured["earliest_start"].isoformat().startswith("2025-11-10T09:00:00-06:00")
    assert captured["preferred_start"].isoformat().startswith("2025-11-11T11:30:00-06:00")


@pytest.mark.asyncio
async def test_list_demo_slots_valida_rangos(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_compute(**kwargs: Any) -> dict[str, Any]:
        return {"status": "ok", "slots": [], "timezone": kwargs.get("timezone_name")}

    monkeypatch.setattr("app.channels.webchat.service.compute_demo_availability", fake_compute)

    context = WebchatContext(
        conversation_id="conv-invalid",
        contact_id="contact-ctx",
        session_id="session-invalid",
    )
    with pytest.raises(ValueError):
        await _execute_function_call(
            "list_demo_slots",
            {"max_slots": "tres"},
            context,
        )


@pytest.mark.asyncio
async def test_schedule_demo_invoca_supabase(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, dict[str, str | None]] = {}

    async def fake_upsert(payload: dict[str, str | None]) -> dict[str, str]:
        captured["payload"] = payload
        return {"id": "cita-123", "tarjeta_id": payload["p_tarjeta_id"]}

    async def fake_ensure(
        *,
        tarjeta_id: str | None,
        conversation_id: str,
        contact_id: str | None,
    ) -> str:
        captured["ensure"] = {
            "tarjeta_id": tarjeta_id,
            "conversation_id": conversation_id,
            "contact_id": contact_id,
        }
        return tarjeta_id or "lead-1"

    monkeypatch.setattr(storage, "upsert_demo_cita", fake_upsert)
    monkeypatch.setattr(storage, "ensure_lead_tarjeta", fake_ensure)

    context = WebchatContext(
        conversation_id="conv-1",
        contact_id="contact-ctx",
        session_id="session-1",
    )
    tz = ZoneInfo("America/Mexico_City")
    now_local = datetime.now(tz)
    future_local = now_local.replace(hour=16, minute=0, second=0, microsecond=0)
    if future_local <= now_local:
        future_local += timedelta(days=1)
    start_iso = future_local.isoformat()

    result = await _execute_function_call(
        "schedule_demo",
        {
            "tarjeta_id": "lead-1",
            "contacto_id": "contact-1",
            "start_at": start_iso,
            "timezone": "America/Mexico_City",
            "provider": "google",
            "metadata": {"duracion_min": 45},
            "reminder_status": "programado",
            "external_join_url": "https://zoom.example/abc",
        },
        context,
    )

    assert result == {"status": "ok", "cita": {"id": "cita-123", "tarjeta_id": "lead-1"}}
    ensure_call = captured["ensure"]
    assert ensure_call == {
        "tarjeta_id": "lead-1",
        "conversation_id": "conv-1",
        "contact_id": "contact-1",
    }
    payload = captured["payload"]
    assert payload["p_tarjeta_id"] == "lead-1"
    assert payload["p_contacto_id"] == "contact-1"
    assert payload["p_conversacion_id"] == "conv-1"
    assert payload["p_provider"] == "google"
    assert payload["p_timezone"] == "America/Mexico_City"
    assert payload["p_start_at"] == start_iso
    assert payload["p_reminder_status"] == "programado"
    assert payload["p_external_join_url"] == "https://zoom.example/abc"
    assert payload["p_scheduled_via"] == "ia"
    assert payload["p_metadata"] == {"duracion_min": 45}


@pytest.mark.asyncio
async def test_schedule_demo_rechaza_fecha_pasada(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_ensure(**_: str) -> str:
        return "lead-1"

    async def fake_upsert(payload: dict[str, str | None]) -> dict[str, str | None]:
        return payload

    monkeypatch.setattr(storage, "ensure_lead_tarjeta", fake_ensure)
    monkeypatch.setattr(storage, "upsert_demo_cita", fake_upsert)

    context = WebchatContext(
        conversation_id="conv-err",
        contact_id="contact-ctx",
        session_id="session-err",
    )
    past_start = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()

    with pytest.raises(ValueError):
        await _execute_function_call(
            "schedule_demo",
            {
                "tarjeta_id": "lead-1",
                "start_at": past_start,
                "timezone": "UTC",
            },
            context,
        )


@pytest.mark.asyncio
async def test_reschedule_demo_actualiza_cita(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, dict[str, str | None]] = {}

    async def fake_upsert(payload: dict[str, str | None]) -> dict[str, str | None]:
        captured["payload"] = payload
        return {"id": payload["p_id"], "estado": payload.get("p_estado")}

    monkeypatch.setattr(storage, "upsert_demo_cita", fake_upsert)

    context = WebchatContext(
        conversation_id="conv-2",
        contact_id="contact-ctx",
        session_id="session-2",
    )

    result = await _execute_function_call(
        "reschedule_demo",
        {
            "cita_id": "cita-456",
            "start_at": "2025-02-16T17:00:00-06:00",
            "estado": "reprogramada",
            "provider": "hosting",
            "remove_provider_event": True,
            "merge_metadata": False,
            "metadata": {"duracion_min": 60},
            "reminder_status": "enviado",
            "scheduled_via": "api",
        },
        context,
    )

    assert result == {"status": "ok", "cita": {"id": "cita-456", "estado": "reprogramada"}}
    payload = captured["payload"]
    assert payload["p_id"] == "cita-456"
    assert payload["p_conversacion_id"] == "conv-2"
    assert payload["p_provider"] == "hosting"
    assert payload["p_remove_provider_event"] is True
    assert payload["p_merge_metadata"] is False
    assert payload["p_metadata"] == {"duracion_min": 60}
    assert payload["p_reminder_status"] == "enviado"
    assert payload["p_scheduled_via"] == "api"


@pytest.mark.asyncio
async def test_cancel_demo_elimina_cita(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, dict[str, str | None]] = {}

    async def fake_cancel(payload: dict[str, str | None]) -> dict[str, str | None]:
        captured["payload"] = payload
        return {"id": payload["p_id"], "estado": "cancelada"}

    monkeypatch.setattr(storage, "cancel_demo_cita", fake_cancel)

    async def fake_get_demo_cita(cita_id: str) -> dict[str, str]:
        return {"id": cita_id, "provider": "hosting"}

    async def fake_sync_cancel(
        *, previous: dict[str, str] | None, updated: dict[str, str], remove_event: bool
    ) -> None:  # type: ignore[override]
        return None

    monkeypatch.setattr(storage, "get_demo_cita", fake_get_demo_cita)
    monkeypatch.setattr("app.channels.webchat.service.sync_cita_after_cancel", fake_sync_cancel)

    context = WebchatContext(
        conversation_id="conv-3",
        contact_id="contact-ctx",
        session_id="session-3",
    )

    result = await _execute_function_call(
        "cancel_demo",
        {
            "cita_id": "cita-789",
            "reason": "El prospecto solicitó reagendar después",
            "remove_provider_event": True,
        },
        context,
    )

    assert result == {"status": "ok", "cita": {"id": "cita-789", "estado": "cancelada"}}
    payload = captured["payload"]
    assert payload["p_id"] == "cita-789"
    assert payload["p_reason"] == "El prospecto solicitó reagendar después"
    assert payload["p_remove_provider_event"] is True


@pytest.mark.asyncio
async def test_schedule_demo_valida_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fail_ensure(**_: str) -> str:
        raise AssertionError("ensure_lead_tarjeta no debe ejecutarse para provider inválido")

    monkeypatch.setattr(storage, "upsert_demo_cita", lambda payload: payload)
    monkeypatch.setattr(storage, "ensure_lead_tarjeta", fail_ensure)

    context = WebchatContext(
        conversation_id="conv-x",
        contact_id="contact-ctx",
        session_id="session-x",
    )

    with pytest.raises(ValueError):
        await _execute_function_call(
            "schedule_demo",
            {
                "tarjeta_id": "lead-x",
                "start_at": "2025-02-15T16:00:00-06:00",
                "timezone": "America/Mexico_City",
                "provider": "calendar-xyz",
            },
            context,
        )
