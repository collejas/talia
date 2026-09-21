import pytest

from app.services import conversation_summary


@pytest.mark.asyncio
async def test_ensure_conversation_summary_refreshes_when_new_messages_exist(monkeypatch):
    created: dict[str, object] = {}

    async def fake_fetch_latest(*, conversation_id, tipo=None):
        assert conversation_id == "conversation-1"
        return {
            "id": "summary-old",
            "resumen": "El cliente pide información.",
            "metadatos": {
                "type": "summary_text",
                "last_message_id": "message-old",
                "messages_count": 1,
            },
        }

    async def fake_fetch_recent(*, conversation_id, limit):
        assert conversation_id == "conversation-1"
        assert limit > 0
        return [
            {"id": "message-old", "direccion": "entrante", "texto": "Hola"},
            {
                "id": "message-new",
                "direccion": "entrante",
                "texto": "Busco faroles coloniales LED para una iglesia.",
                "creado_en": "2026-09-19T15:40:00+00:00",
            },
        ]

    async def fake_summarize(*args, **kwargs):
        return "Busca faroles coloniales LED para las entradas de una iglesia."

    async def fake_create(**kwargs):
        created.update(kwargs)
        return {"id": "summary-new", "resumen": kwargs["resumen"], "metadatos": kwargs["metadatos"]}

    async def fake_refresh(**kwargs):
        return None

    async def fake_upsert(**kwargs):
        return None

    monkeypatch.setattr(conversation_summary.storage, "fetch_latest_conversation_summary", fake_fetch_latest)
    monkeypatch.setattr(conversation_summary.storage, "fetch_recent_messages", fake_fetch_recent)
    monkeypatch.setattr(conversation_summary, "_summarize_messages", fake_summarize)
    monkeypatch.setattr(conversation_summary.storage, "create_conversation_summary", fake_create)
    monkeypatch.setattr(conversation_summary.storage, "refresh_persona_insights_from_conversation", fake_refresh)
    monkeypatch.setattr(conversation_summary.storage, "upsert_conversation_insights", fake_upsert)

    result = await conversation_summary.ensure_conversation_summary(
        conversation_id="conversation-1",
        persona_id="persona-1",
        organizacion_id="00000000-0000-0000-0000-000000000001",
    )

    assert result["id"] == "summary-new"
    assert created["resumen"] == "Busca faroles coloniales LED para las entradas de una iglesia."
    assert created["metadatos"]["last_message_id"] == "message-new"
    assert created["metadatos"]["previous_summary_id"] == "summary-old"
    assert created["metadatos"]["source"] == "conversation_summary_refresh"


@pytest.mark.asyncio
async def test_ensure_conversation_summary_reuses_current_summary(monkeypatch):
    async def fake_fetch_latest(**kwargs):
        return {
            "id": "summary-current",
            "resumen": "Resumen vigente.",
            "metadatos": {"last_message_id": "message-current"},
        }

    async def fake_fetch_recent(**kwargs):
        return [{"id": "message-current", "direccion": "entrante", "texto": "Hola"}]

    async def fail_summarize(*args, **kwargs):
        raise AssertionError("no debe invocar el modelo si el resumen esta vigente")

    monkeypatch.setattr(conversation_summary.storage, "fetch_latest_conversation_summary", fake_fetch_latest)
    monkeypatch.setattr(conversation_summary.storage, "fetch_recent_messages", fake_fetch_recent)
    monkeypatch.setattr(conversation_summary, "_summarize_messages", fail_summarize)

    result = await conversation_summary.ensure_conversation_summary(
        conversation_id="conversation-2",
        generate_if_missing=False,
    )

    assert result["id"] == "summary-current"
