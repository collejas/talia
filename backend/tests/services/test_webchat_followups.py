from datetime import datetime, timedelta, timezone

import pytest

from app.services import webchat_followups


class DummyRepo:
    def __init__(self, conversations: list[dict], closure: dict | None = None) -> None:
        self.conversations = conversations
        self.closure = closure
        self.requested_limit: int | None = None
        self.requested_cutoff: datetime | None = None

    async def list_webchat_conversations_for_followup(self, *, inactive_since, limit):
        self.requested_cutoff = inactive_since
        self.requested_limit = limit
        return self.conversations

    async def get_latest_webchat_session_closure(self, *, session_id: str):
        return self.closure


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

    async def fake_fetch_contact(contact_id: str):
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
    monkeypatch.setattr(webchat_followups.storage, "fetch_contact", fake_fetch_contact)
    monkeypatch.setattr(webchat_followups.storage, "update_contact", fake_update_contact)
    monkeypatch.setattr(webchat_followups.storage, "fetch_webchat_session_id", fake_fetch_session)
    monkeypatch.setattr(
        webchat_followups.storage,
        "register_webchat_message",
        fake_register_message,
    )
    monkeypatch.setattr(webchat_followups.settings, "webchat_reengage_minutes", 15)

    await webchat_followups.run_followups(now=now)

    assert sent_messages, "Debe enviar mensaje de reenganche"
    payload = sent_messages[0]
    assert payload["session_id"] == "session-1"
    assert "correo" in payload["content"]
    followup_state = contact_store["contacto_datos"]["webchat_followup"]["state"]
    assert followup_state["reengage"]["attempts"] == 1


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

    async def fake_fetch_contact(contact_id: str):
        return _snapshot(contact_store)

    async def fake_update_contact(contact_id: str, patch: dict):
        if "contacto_datos" in patch:
            contact_store["contacto_datos"] = dict(patch["contacto_datos"])
        return _snapshot(contact_store)

    async def fake_fetch_session(contact_id: str):
        return "session-closed"

    monkeypatch.setattr(webchat_followups, "CRMRepository", lambda: repo)
    monkeypatch.setattr(webchat_followups.storage, "fetch_contact", fake_fetch_contact)
    monkeypatch.setattr(webchat_followups.storage, "update_contact", fake_update_contact)
    monkeypatch.setattr(webchat_followups.storage, "fetch_webchat_session_id", fake_fetch_session)
    async def fake_register_message(**kwargs):
        return None

    monkeypatch.setattr(
        webchat_followups.storage,
        "register_webchat_message",
        fake_register_message,
    )
    monkeypatch.setattr(webchat_followups.settings, "webchat_reengage_minutes", 15)

    await webchat_followups.run_followups(now=now)

    assert contact_store["contacto_datos"].get("webchat_followup")
    state = contact_store["contacto_datos"]["webchat_followup"]["state"]
    assert state.get("stop_reason") == "session_closed"
