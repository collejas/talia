from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.services import whatsapp_followups


class DummyRepo:
    def __init__(self, *, jobs=None, conversation=None, opportunity_metadata=None):
        self.jobs = list(jobs or [])
        self.conversation = conversation or {}
        self.opportunity_metadata = opportunity_metadata or {}
        self.updated_payloads = []
        self.enqueued = []
        self.canceled = []
        self.rescheduled = []
        self.done = []
        self.failed = []

    async def worker_cancel_active_whatsapp_followup_jobs(self, *, conversation_id, reason):
        self.canceled.append((str(conversation_id), reason))
        return 1

    async def worker_enqueue_whatsapp_followup_job(self, **kwargs):
        self.enqueued.append(kwargs)
        return {"id": str(uuid4()), **kwargs}

    async def worker_requeue_expired_whatsapp_followup_jobs(self, *, limit):
        return 0

    async def worker_list_ready_whatsapp_followup_jobs(self, *, limit):
        return list(self.jobs)

    async def worker_claim_whatsapp_followup_job(self, *, job_id, expected_attempt_count, lease_seconds):
        for row in self.jobs:
            if row["id"] == str(job_id):
                claimed = dict(row)
                claimed["attempt_count"] = expected_attempt_count + 1
                return claimed
        return None

    async def get_whatsapp_conversation_for_followup_job(self, *, conversation_id):
        return dict(self.conversation)

    async def get_pipeline_opportunity(self, *, organizacion_id, oportunidad_id):
        return {
            "id": str(oportunidad_id),
            "organizacion_id": str(organizacion_id),
            "metadata": self.opportunity_metadata.copy(),
            "contacto": {
                "id": self.conversation.get("contacto_id"),
                "nombre_completo": "Lead Demo",
                "telefono_e164": "+5218887776666",
                "necesidad_proposito": "Automatizar",
                "notes": "Demo asap",
            },
            "asignado": {"id": str(uuid4()), "telefono_e164": "+521000000001"},
        }

    async def update_opportunity(self, *, organizacion_id, oportunidad_id, payload):
        self.updated_payloads.append(payload)
        return payload

    async def worker_reschedule_whatsapp_followup_job(self, *, job_id, due_at, next_action, scheduled_reason):
        self.rescheduled.append(
            {
                "job_id": str(job_id),
                "due_at": due_at,
                "next_action": next_action,
                "scheduled_reason": scheduled_reason,
            }
        )
        return {"id": str(job_id), "state": "pending"}

    async def worker_mark_whatsapp_followup_done(self, *, job_id, result=None):
        self.done.append({"job_id": str(job_id), "result": result})
        return {"id": str(job_id), "state": "done"}

    async def worker_mark_whatsapp_followup_retry_or_failed(
        self, *, job_id, attempt_count, max_attempts, error, retry_delay_seconds
    ):
        self.failed.append(
            {
                "job_id": str(job_id),
                "attempt_count": attempt_count,
                "max_attempts": max_attempts,
                "error": error,
                "retry_delay_seconds": retry_delay_seconds,
            }
        )
        return {"id": str(job_id), "state": "pending"}


@pytest.mark.asyncio
async def test_schedule_customer_followup_enqueues_reengage(monkeypatch):
    repo = DummyRepo()
    monkeypatch.setattr(whatsapp_followups, "CRMRepository", lambda: repo)

    async def fake_get_whatsapp_runtime_settings(**_: object):
        return whatsapp_followups.tenant_runtime.WhatsappRuntimeSettings.from_settings()

    monkeypatch.setattr(
        whatsapp_followups.tenant_runtime,
        "get_whatsapp_runtime_settings",
        fake_get_whatsapp_runtime_settings,
    )

    await whatsapp_followups.schedule_customer_followup(
        conversation_id=str(uuid4()),
        persona_id=str(uuid4()),
        organizacion_id=str(uuid4()),
        reason="assistant_reply",
    )

    assert repo.enqueued
    assert repo.enqueued[0]["next_action"] == "reengage"
    assert repo.enqueued[0]["scheduled_reason"] == "assistant_reply"


@pytest.mark.asyncio
async def test_cancel_followup_jobs_for_inbound(monkeypatch):
    repo = DummyRepo()
    monkeypatch.setattr(whatsapp_followups, "CRMRepository", lambda: repo)

    rows = await whatsapp_followups.cancel_followup_jobs_for_inbound(
        conversation_id=str(uuid4()),
        reason="customer_replied",
    )

    assert rows == 1
    assert repo.canceled[0][1] == "customer_replied"


@pytest.mark.asyncio
async def test_run_followups_reschedules_after_reengage(monkeypatch):
    now = datetime(2025, 1, 1, 12, 0, tzinfo=timezone.utc)
    conversation_id = str(uuid4())
    persona_id = str(uuid4())
    org_id = str(uuid4())
    job_id = str(uuid4())
    convo = {
        "id": conversation_id,
        "contacto_id": persona_id,
        "persona_id": persona_id,
        "organizacion_id": org_id,
        "ultimo_saliente_en": (now - timedelta(minutes=40)).isoformat(),
        "ultimo_entrante_en": (now - timedelta(minutes=120)).isoformat(),
        "conversaciones_controles": [],
    }
    repo = DummyRepo(
        jobs=[
            {
                "id": job_id,
                "conversation_id": conversation_id,
                "persona_id": persona_id,
                "attempt_count": 0,
                "max_attempts": 5,
            }
        ],
        conversation=convo,
    )
    monkeypatch.setattr(whatsapp_followups, "CRMRepository", lambda: repo)
    monkeypatch.setattr(whatsapp_followups.settings, "whatsapp_followup_job_lease_seconds", 120)

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
            "organizacion_id": org_id,
            "telefono_e164": "+5219998887777",
        }

    async def fake_ensure_conversation_opportunity(**kwargs):
        return str(uuid4())

    async def fake_send_manual_message(**kwargs):
        return type("R", (), {"sid": "wamid.123"})()

    monkeypatch.setattr(whatsapp_followups.storage, "fetch_persona", fake_fetch_persona)
    monkeypatch.setattr(
        whatsapp_followups.storage,
        "ensure_conversation_opportunity",
        fake_ensure_conversation_opportunity,
    )
    async def fake_update_conversation(*args, **kwargs):
        return None

    async def fake_register_whatsapp_message(**kwargs):
        return None

    monkeypatch.setattr(whatsapp_followups.storage, "update_conversation", fake_update_conversation)
    monkeypatch.setattr(whatsapp_followups.storage, "register_whatsapp_message", fake_register_whatsapp_message)
    monkeypatch.setattr(whatsapp_followups.whatsapp_service, "send_manual_message", fake_send_manual_message)

    await whatsapp_followups.run_followups(now=now)

    assert repo.rescheduled
    assert repo.rescheduled[0]["next_action"] in {"reengage", "escalate"}
    assert repo.updated_payloads


@pytest.mark.asyncio
async def test_run_followups_escalates_when_attempts_exhausted(monkeypatch):
    now = datetime(2025, 1, 1, 12, 0, tzinfo=timezone.utc)
    conversation_id = str(uuid4())
    persona_id = str(uuid4())
    org_id = str(uuid4())
    opp_id = str(uuid4())
    job_id = str(uuid4())
    convo = {
        "id": conversation_id,
        "contacto_id": persona_id,
        "persona_id": persona_id,
        "organizacion_id": org_id,
        "ultimo_saliente_en": (now - timedelta(hours=3)).isoformat(),
        "ultimo_entrante_en": None,
        "conversaciones_controles": [],
    }
    repo = DummyRepo(
        jobs=[
            {
                "id": job_id,
                "conversation_id": conversation_id,
                "persona_id": persona_id,
                "attempt_count": 0,
                "max_attempts": 5,
            }
        ],
        conversation=convo,
        opportunity_metadata={
            "whatsapp_followup": {
                "reengage": {"sent_at": (now - timedelta(hours=2)).isoformat(), "attempts": 1}
            }
        },
    )
    monkeypatch.setattr(whatsapp_followups, "CRMRepository", lambda: repo)
    monkeypatch.setattr(whatsapp_followups.settings, "whatsapp_reengage_max_attempts", 1)
    monkeypatch.setattr(whatsapp_followups.settings, "whatsapp_followup_job_lease_seconds", 120)

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
            "organizacion_id": org_id,
            "telefono_e164": "+5218887776666",
        }

    async def fake_ensure_conversation_opportunity(**kwargs):
        return opp_id

    escalated = {}

    async def fake_notify_sales_rep(**kwargs):
        escalated["trigger"] = kwargs["trigger"]
        escalated["persona_phone"] = kwargs["persona"]["telefono_e164"]

    monkeypatch.setattr(whatsapp_followups.storage, "fetch_persona", fake_fetch_persona)
    monkeypatch.setattr(
        whatsapp_followups.storage,
        "ensure_conversation_opportunity",
        fake_ensure_conversation_opportunity,
    )
    monkeypatch.setattr(whatsapp_followups.whatsapp_tools, "_notify_sales_rep", fake_notify_sales_rep)

    await whatsapp_followups.run_followups(now=now)

    assert escalated["trigger"] == "followup_escalate"
    assert escalated["persona_phone"] == "+5218887776666"
    assert repo.done


def test_should_skip_reengage_when_opportunity_closed():
    opportunity = {
        "estado": "en progreso",
        "etapa": {"codigo": "cerrado_perdido", "categoria": "perdida"},
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
