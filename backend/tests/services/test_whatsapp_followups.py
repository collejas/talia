from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.services import whatsapp_followups


class DummyRepo:
    def __init__(self, conversations, opportunity_metadata=None):
        self.conversations = conversations
        self.opportunity_metadata = opportunity_metadata or {}
        self.updated_payloads = []

    async def list_whatsapp_conversations_for_followup(
        self,
        *,
        inactive_since,
        limit,
        cursor_last_out=None,
        cursor_last_id=None,
    ):
        self.inactive_since = inactive_since
        self.limit = limit
        self.cursor_last_out = cursor_last_out
        self.cursor_last_id = cursor_last_id
        return self.conversations

    async def get_pipeline_opportunity(self, *, organizacion_id, oportunidad_id):
        data = {
            "id": str(oportunidad_id),
            "organizacion_id": str(organizacion_id),
            "metadata": self.opportunity_metadata.copy(),
            "contacto": {
                "nombre_completo": "Lead Demo",
                "necesidad_proposito": "Automatizar",
                "notes": "Demo asap",
            },
            "asignado": {
                "id": str(uuid4()),
                "telefono_e164": "+521000000001",
            },
        }
        return data

    async def update_opportunity(self, *, organizacion_id, oportunidad_id, payload):
        self.updated_payloads.append(payload)
        return payload


@pytest.mark.asyncio
async def test_run_followups_sends_reengage(monkeypatch):
    now = datetime(2025, 1, 1, 12, 0, tzinfo=timezone.utc)
    convo = {
        "id": "conv-1",
        "contacto_id": "contact-1",
        "organizacion_id": str(uuid4()),
        "ultimo_saliente_en": (now - timedelta(minutes=40)).isoformat(),
        "ultimo_entrante_en": (now - timedelta(minutes=120)).isoformat(),
        "conversaciones_controles": [],
    }
    repo = DummyRepo([convo])
    monkeypatch.setattr(whatsapp_followups, "CRMRepository", lambda: repo)
    monkeypatch.setattr(whatsapp_followups.settings, "whatsapp_reengage_minutes", 30)
    monkeypatch.setattr(whatsapp_followups.settings, "whatsapp_escalate_minutes", 120)
    async def fake_get_whatsapp_runtime_settings(**_: object):
        return whatsapp_followups.tenant_runtime.WhatsappRuntimeSettings.from_settings()

    monkeypatch.setattr(
        whatsapp_followups.tenant_runtime,
        "get_whatsapp_runtime_settings",
        fake_get_whatsapp_runtime_settings,
    )

    async def fake_fetch_persona(contact_id):
        return {
            "id": contact_id,
            "organizacion_id": convo["organizacion_id"],
            "telefono_e164": "+5219998887777",
        }

    async def fake_ensure_conversation_opportunity(**kwargs):
        return str(uuid4())

    sent = {}

    async def fake_send_manual_message(
        *, to_number, body=None, template_sid=None, template_variables=None, organizacion_id=None
    ):
        sent["to"] = to_number
        sent["body"] = body

    monkeypatch.setattr(whatsapp_followups.storage, "fetch_persona", fake_fetch_persona)
    monkeypatch.setattr(
        whatsapp_followups.storage, "ensure_conversation_opportunity", fake_ensure_conversation_opportunity
    )
    monkeypatch.setattr(
        whatsapp_followups.whatsapp_service,
        "send_manual_message",
        fake_send_manual_message,
    )
    monkeypatch.setattr(whatsapp_followups.whatsapp_tools, "_notify_sales_rep", lambda **_: None)

    await whatsapp_followups.run_followups(now=now)

    assert sent["to"] == "+5219998887777"
    assert repo.updated_payloads, "Debe actualizar metadata con reengage"


@pytest.mark.asyncio
async def test_run_followups_escalates_after_reengage(monkeypatch):
    now = datetime(2025, 1, 1, 12, 0, tzinfo=timezone.utc)
    convo = {
        "id": "conv-2",
        "contacto_id": "contact-2",
        "organizacion_id": str(uuid4()),
        "ultimo_saliente_en": (now - timedelta(hours=3)).isoformat(),
        "ultimo_entrante_en": None,
        "conversaciones_controles": [],
    }
    repo = DummyRepo(
        [convo],
        opportunity_metadata={
            "whatsapp_followup": {
                "reengage": {"sent_at": (now - timedelta(hours=2)).isoformat(), "attempts": 1}
            }
        },
    )
    monkeypatch.setattr(whatsapp_followups, "CRMRepository", lambda: repo)
    monkeypatch.setattr(whatsapp_followups.settings, "whatsapp_reengage_minutes", 30)
    monkeypatch.setattr(whatsapp_followups.settings, "whatsapp_escalate_minutes", 60)
    async def fake_get_whatsapp_runtime_settings(**_: object):
        return whatsapp_followups.tenant_runtime.WhatsappRuntimeSettings.from_settings()

    monkeypatch.setattr(
        whatsapp_followups.tenant_runtime,
        "get_whatsapp_runtime_settings",
        fake_get_whatsapp_runtime_settings,
    )

    async def fake_fetch_persona(contact_id):
        return {
            "id": contact_id,
            "organizacion_id": convo["organizacion_id"],
            "telefono_e164": "+5218887776666",
        }

    async def fake_ensure_conversation_opportunity(**kwargs):
        return str(uuid4())

    escalated = {}

    async def fake_notify_sales_rep(**kwargs):
        escalated["trigger"] = kwargs["trigger"]

    monkeypatch.setattr(whatsapp_followups.storage, "fetch_persona", fake_fetch_persona)
    monkeypatch.setattr(
        whatsapp_followups.storage, "ensure_conversation_opportunity", fake_ensure_conversation_opportunity
    )
    monkeypatch.setattr(whatsapp_followups.whatsapp_service, "send_manual_message", lambda **_: None)
    monkeypatch.setattr(whatsapp_followups.whatsapp_tools, "_notify_sales_rep", fake_notify_sales_rep)

    await whatsapp_followups.run_followups(now=now)

    assert escalated["trigger"] == "followup_escalate"
    assert repo.updated_payloads, "Debe registrar metadata de escalación"


def test_should_skip_reengage_when_opportunity_closed():
    opportunity = {
        "estado": "en progreso",
        "etapa": {"codigo": "cerrado_perdido", "categoria": "perdida"},
    }
    assert whatsapp_followups._should_skip_reengage_for_business_rules(opportunity)


def test_should_skip_reengage_when_sales_primary_notification_exists():
    opportunity = {
        "estado": "abierta",
        "etapa": {"codigo": "captado", "categoria": "activa"},
        "metadata": {
            "sales_primary_notifications": {
                "whatsapp": {
                    "trigger": "close_lead",
                    "reason": "case_a_close_lead_profile",
                    "sent_at": "2026-04-17T15:18:28.176364+00:00",
                }
            }
        },
    }
    assert whatsapp_followups._should_skip_reengage_for_business_rules(opportunity)


def test_should_skip_reengage_when_close_lead_notification_exists():
    opportunity = {
        "estado": "abierta",
        "etapa": {"codigo": "captado", "categoria": "activa"},
        "metadata": {
            "sales_notifications": {
                "close_lead": {
                    "sent_at": "2026-04-17T15:18:28.176358+00:00",
                    "notification_sid": "MM5865785c9dd1b22fc59a807556da247b",
                }
            }
        },
    }
    assert whatsapp_followups._should_skip_reengage_for_business_rules(opportunity)


@pytest.mark.asyncio
async def test_run_followups_skips_outbound_prospeccion_without_reply(monkeypatch):
    now = datetime(2025, 1, 1, 12, 0, tzinfo=timezone.utc)
    convo = {
        "id": "conv-3",
        "contacto_id": "contact-3",
        "organizacion_id": str(uuid4()),
        "ultimo_saliente_en": (now - timedelta(minutes=40)).isoformat(),
        "ultimo_entrante_en": None,
        "inbox_context": {"source": "prospeccion"},
        "conversaciones_controles": [],
    }
    repo = DummyRepo([convo])
    monkeypatch.setattr(whatsapp_followups, "CRMRepository", lambda: repo)

    called = {
        "fetch_persona": 0,
        "ensure_opportunity": 0,
        "send_manual": 0,
        "notify_sales": 0,
    }

    async def fake_fetch_persona(contact_id):
        called["fetch_persona"] += 1
        return {
            "id": contact_id,
            "organizacion_id": convo["organizacion_id"],
            "telefono_e164": "+5219998887777",
        }

    async def fake_ensure_conversation_opportunity(**kwargs):
        called["ensure_opportunity"] += 1
        return str(uuid4())

    async def fake_send_manual_message(**kwargs):
        called["send_manual"] += 1
        return None

    async def fake_notify_sales_rep(**kwargs):
        called["notify_sales"] += 1
        return None

    monkeypatch.setattr(whatsapp_followups.storage, "fetch_persona", fake_fetch_persona)
    monkeypatch.setattr(
        whatsapp_followups.storage, "ensure_conversation_opportunity", fake_ensure_conversation_opportunity
    )
    monkeypatch.setattr(whatsapp_followups.whatsapp_service, "send_manual_message", fake_send_manual_message)
    monkeypatch.setattr(whatsapp_followups.whatsapp_tools, "_notify_sales_rep", fake_notify_sales_rep)

    await whatsapp_followups.run_followups(now=now)

    assert called["fetch_persona"] == 0
    assert called["ensure_opportunity"] == 0
    assert called["send_manual"] == 0
    assert called["notify_sales"] == 0
