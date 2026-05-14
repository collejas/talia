from datetime import datetime, timedelta, timezone
import uuid
from typing import Any

import pytest

import app.services.webchat_followups as webchat_followups


class DummyRepo:
    def __init__(self, conversations: list[dict], closure: dict | None = None) -> None:
        self.conversations = conversations
        self.closure = closure
        self.requested_limit: int | None = None
        self.requested_cutoff: datetime | None = None
        self.opportunity_response: dict[str, Any] | None = None

    async def list_webchat_conversations_for_followup(
        self,
        *,
        inactive_since,
        limit,
        cursor_last_out=None,
        cursor_last_id=None,
    ):
        self.requested_cutoff = inactive_since
        self.requested_limit = limit
        return self.conversations

    async def get_latest_webchat_session_closure(self, *, session_id: str):
        return self.closure

    async def get_pipeline_opportunity(
        self,
        *,
        organizacion_id: uuid.UUID,
        oportunidad_id: uuid.UUID,
    ) -> dict[str, Any] | None:
        return self.opportunity_response


def _build_contact_store(**overrides) -> dict:
    base = {
        "id": "contact-1",
        "organizacion_id": "org-1",
        "telefono_e164": "",
        "correo": "",
        "company_name": "",
        "necesidad_proposito": "",
        "contacto_datos": {},
    }
    base.update(overrides)
    return base


def _snapshot(store: dict) -> dict:
    payload = {k: v for k, v in store.items() if k != "contacto_datos"}
    payload["contacto_datos"] = dict(store.get("contacto_datos") or {})
    return payload


@pytest.mark.asyncio
async def test_run_followups_sends_reengage(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime(2025, 1, 1, 12, 0, tzinfo=timezone.utc)
    convo = {
        "id": "conv-1",
        "contacto_id": "contact-1",
        "organizacion_id": "org-1",
        "estado": "abierta",
        "ultimo_saliente_en": (now - timedelta(minutes=40)).isoformat(),
        "ultimo_entrante_en": (now - timedelta(hours=2)).isoformat(),
        "conversaciones_controles": [],
    }
    repo = DummyRepo([convo])
    contact_store = _build_contact_store()

    async def fake_fetch_persona(contact_id: str):
        assert contact_id == "contact-1"
        return _snapshot(contact_store)

    async def fake_update_contact(contact_id: str, patch: dict):
        if "contacto_datos" in patch:
            contact_store["contacto_datos"] = dict(patch["contacto_datos"])
        for key in ("correo", "telefono_e164", "company_name", "necesidad_proposito"):
            if key in patch:
                contact_store[key] = patch[key]
        return _snapshot(contact_store)

    async def fake_fetch_session(contact_id: str):
        return "session-1"

    sent_messages: list[dict] = []

    async def fake_register_message(**kwargs):
        sent_messages.append(kwargs)

    monkeypatch.setattr(webchat_followups, "CRMRepository", lambda: repo)
    monkeypatch.setattr(webchat_followups.storage, "fetch_persona", fake_fetch_persona)
    monkeypatch.setattr(webchat_followups.storage, "update_persona", fake_update_contact)
    record_attempts: list[dict] = []

    async def fake_record_reengage_attempt(*, conversation_id: str, contact_id: str, sent_at, message: str | None = None):
        record_attempts.append(
            {"conversation_id": conversation_id, "contact_id": contact_id, "message": message}
        )

    monkeypatch.setattr(webchat_followups.storage, "fetch_webchat_session_id", fake_fetch_session)
    monkeypatch.setattr(
        webchat_followups.storage,
        "register_webchat_message",
        fake_register_message,
    )
    monkeypatch.setattr(webchat_followups.settings, "webchat_reengage_minutes", 15)
    monkeypatch.setattr(
        webchat_followups,
        "record_reengage_attempt",
        fake_record_reengage_attempt,
    )

    await webchat_followups.run_followups(now=now)

    assert sent_messages, "Debe enviar mensaje de reenganche"
    payload = sent_messages[0]
    assert payload["session_id"] == "session-1"
    assert "correo" in payload["content"]
    assert record_attempts, "Debe registrar el intento de reenganche"
    assert record_attempts[0]["conversation_id"] == "conv-1"


@pytest.mark.asyncio
async def test_run_followups_skips_when_session_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime(2025, 1, 1, 12, 0, tzinfo=timezone.utc)
    convo = {
        "id": "conv-closed",
        "contacto_id": "contact-closed",
        "organizacion_id": "org-1",
        "estado": "abierta",
        "ultimo_saliente_en": (now - timedelta(minutes=45)).isoformat(),
        "ultimo_entrante_en": (now - timedelta(hours=1)).isoformat(),
        "conversaciones_controles": [],
    }
    closure = {
        "session_id": "session-closed",
        "closed_at": (now - timedelta(minutes=10)).isoformat(),
    }
    repo = DummyRepo([convo], closure=closure)
    contact_store = _build_contact_store()

    async def fake_fetch_persona(contact_id: str):
        return _snapshot(contact_store)

    async def fake_update_contact(contact_id: str, patch: dict):
        if "contacto_datos" in patch:
            contact_store["contacto_datos"] = dict(patch["contacto_datos"])
        return _snapshot(contact_store)

    async def fake_fetch_session(contact_id: str):
        return "session-closed"

    reason_calls: list[str] = []

    async def fake_mark_stop_reason(*, conversation_id: str, contact_id: str, reason: str):
        reason_calls.append(reason)

    monkeypatch.setattr(webchat_followups, "CRMRepository", lambda: repo)
    monkeypatch.setattr(webchat_followups.storage, "fetch_persona", fake_fetch_persona)
    monkeypatch.setattr(webchat_followups.storage, "update_persona", fake_update_contact)
    monkeypatch.setattr(webchat_followups.storage, "fetch_webchat_session_id", fake_fetch_session)
    async def fake_register_message(**kwargs):
        return None

    monkeypatch.setattr(
        webchat_followups.storage,
        "register_webchat_message",
        fake_register_message,
    )
    monkeypatch.setattr(webchat_followups.settings, "webchat_reengage_minutes", 15)
    monkeypatch.setattr(
        webchat_followups,
        "mark_stop_reason",
        fake_mark_stop_reason,
    )

    await webchat_followups.run_followups(now=now)

    assert "session_closed" in reason_calls


@pytest.mark.asyncio
async def test_run_followups_escalates_when_attempts_exhausted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = datetime(2025, 1, 1, 12, 0, tzinfo=timezone.utc)
    org_id = uuid.uuid4()
    opp_id = uuid.uuid4()
    convo = {
        "id": "conv-1",
        "contacto_id": "contact-1",
        "organizacion_id": str(org_id),
        "estado": "abierta",
        "ultimo_saliente_en": (now - timedelta(minutes=45)).isoformat(),
        "ultimo_entrante_en": (now - timedelta(hours=1)).isoformat(),
        "conversaciones_controles": [],
    }
    repo = DummyRepo([convo])
    repo.opportunity_response = {
        "id": str(opp_id),
        "organizacion_id": str(org_id),
        "contacto": {
            "nombre_completo": "Lead Demo",
            "correo": "lead@example.com",
            "telefono_e164": "+5212345678999",
            "company_name": "Demo SA",
            "necesidad_proposito": "Escalation",
            "notes": "Solicita más info",
        },
        "asignado": {
            "id": str(uuid.uuid4()),
            "nombre_completo": "Seller",
            "telefono_e164": "+521000000001",
        },
        "metadata": {},
    }
    contact_store = _build_contact_store(
        telefono_e164="+5212345678999",
        correo="lead@example.com",
        organizacion_id=str(org_id),
    )
    contact_store["notes"] = "Solicita más info"
    contact_store["contacto_datos"] = {
        "webchat_followup": {
            "current_conversation_id": "conv-1",
            "state": {"reengage": {"attempts": 2}},
        }
    }

    async def fake_fetch_persona(contact_id: str):
        assert contact_id == "contact-1"
        return _snapshot(contact_store)

    async def fake_update_contact(contact_id: str, patch: dict):
        if "contacto_datos" in patch:
            contact_store["contacto_datos"] = dict(patch["contacto_datos"])
        return _snapshot(contact_store)

    async def fake_ensure_opportunity(*, conversation_id: str, contact_id: str, channel: str | None = None):
        return str(opp_id)

    notified: list[dict] = []

    async def fake_notify_sales_rep(**kwargs):
        assert "persona" in kwargs
        notified.append(kwargs)

    stop_reasons: list[str] = []

    async def fake_mark_stop_reason(*, conversation_id: str, contact_id: str, reason: str):
        stop_reasons.append(reason)

    sent_messages: list[dict] = []

    async def fake_register_webchat_message(**kwargs):
        sent_messages.append(kwargs)

    record_calls: list[dict] = []

    async def fake_record_reengage_attempt(*, conversation_id: str, contact_id: str, sent_at, message: str | None = None):
        record_calls.append({"conversation_id": conversation_id, "contact_id": contact_id})

    logged_events: list[str] = []

    def fake_log_event(_logger, event_name: str, **__):
        logged_events.append(event_name)

    monkeypatch.setattr(webchat_followups, "CRMRepository", lambda: repo)
    monkeypatch.setattr(webchat_followups.storage, "fetch_persona", fake_fetch_persona)
    monkeypatch.setattr(webchat_followups.storage, "update_persona", fake_update_contact)
    monkeypatch.setattr(webchat_followups.storage, "ensure_conversation_opportunity", fake_ensure_opportunity)
    monkeypatch.setattr(
        webchat_followups.whatsapp_tools,
        "_notify_sales_rep",
        fake_notify_sales_rep,
    )
    monkeypatch.setattr(webchat_followups, "mark_stop_reason", fake_mark_stop_reason)
    monkeypatch.setattr(webchat_followups, "record_reengage_attempt", fake_record_reengage_attempt)
    monkeypatch.setattr(webchat_followups.storage, "register_webchat_message", fake_register_webchat_message)
    monkeypatch.setattr(
        webchat_followups,
        "log_event",
        fake_log_event,
    )
    monkeypatch.setattr(webchat_followups.settings, "webchat_reengage_minutes", 15)
    monkeypatch.setattr(webchat_followups.settings, "webchat_reengage_max_attempts", 2)

    await webchat_followups.run_followups(now=now)

    assert notified, "Debe notificar la escalación"
    assert notified[0]["trigger"] == "webchat_escalate"
    assert notified[0]["extra"]["attempts"] == 2
    assert notified[0]["persona"]["telefono_e164"] == "+5212345678999"
    assert logged_events and "webchat.followup.escalated" in logged_events
    assert stop_reasons == ["reengage_limit"]
    assert not sent_messages
    assert not record_calls


@pytest.mark.asyncio
async def test_ensure_contact_ready_for_assignment(monkeypatch: pytest.MonkeyPatch) -> None:
    contact_data = {
        "contact-free": {
            "id": "contact-free",
            "organizacion_id": "org-1",
            "telefono_e164": "",
            "correo": "",
            "contacto_datos": {},
        },
        "contact-ready": {
            "id": "contact-ready",
            "organizacion_id": "org-1",
            "telefono_e164": "+5212345678999",
            "correo": "",
            "contacto_datos": {},
        },
    }

    async def fake_fetch(contact_id: str):
        record = contact_data.get(contact_id)
        if not record:
            raise ValueError("missing contact")
        return dict(record)

    refresh_calls: list[str] = []

    async def fake_refresh(*, conversation_id: str, contact_id: str, contact: dict | None = None, **__):
        refresh_calls.append(contact_id)
        return {"contact_ready_at": "ts"}

    monkeypatch.setattr(webchat_followups.storage, "fetch_persona", fake_fetch)
    monkeypatch.setattr(
        webchat_followups,
        "refresh_contact_followup_state",
        fake_refresh,
    )

    ready = await webchat_followups.ensure_contact_ready_for_assignment(
        conversation_id="conv-1",
        contact_id="contact-ready",
    )
    assert ready is True
    assert refresh_calls[-1] == "contact-ready"

    prev_len = len(refresh_calls)
    not_ready = await webchat_followups.ensure_contact_ready_for_assignment(
        conversation_id="conv-2",
        contact_id="contact-free",
    )
    assert not_ready is False
    assert len(refresh_calls) == prev_len


@pytest.mark.asyncio
async def test_record_reengage_attempt_increments_existing_state(monkeypatch: pytest.MonkeyPatch) -> None:
    contact_store = {
        "id": "contact-1",
        "organizacion_id": "org-1",
        "contacto_datos": {
            "webchat_followup": {
                "current_conversation_id": "conv-1",
                "state": {
                    "last_session_id": "session-1",
                    "reengage": {"attempts": 1, "sent_at": "2026-03-13T03:00:00+00:00"},
                },
            }
        },
    }

    async def fake_fetch_persona(contact_id: str):
        assert contact_id == "contact-1"
        return {
            "id": contact_store["id"],
            "organizacion_id": contact_store["organizacion_id"],
            "contacto_datos": dict(contact_store["contacto_datos"]),
        }

    async def fake_update_persona(contact_id: str, patch: dict[str, Any]):
        assert contact_id == "contact-1"
        contact_store["contacto_datos"] = dict(patch.get("persona_datos") or patch.get("contacto_datos") or {})
        return {
            "id": contact_store["id"],
            "organizacion_id": contact_store["organizacion_id"],
            "contacto_datos": dict(contact_store["contacto_datos"]),
        }

    monkeypatch.setattr(webchat_followups.storage, "fetch_persona", fake_fetch_persona)
    monkeypatch.setattr(webchat_followups.storage, "update_persona", fake_update_persona)

    await webchat_followups.record_reengage_attempt(
        conversation_id="conv-1",
        contact_id="contact-1",
        sent_at=datetime(2026, 3, 13, 3, 30, tzinfo=timezone.utc),
        message="reengage",
    )

    state = contact_store["contacto_datos"]["webchat_followup"]["state"]
    assert state["reengage"]["attempts"] == 2
