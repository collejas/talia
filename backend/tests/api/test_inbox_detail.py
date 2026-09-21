from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.routes import crm


@pytest.mark.asyncio
async def test_inbox_detail_passes_plain_search_to_thread_loader(monkeypatch):
    conversation_id = uuid4()
    captured: dict[str, object] = {}

    async def fake_get_inbox_threads(**kwargs):
        captured.update(kwargs)
        return [SimpleNamespace(conversacion_id=conversation_id)]

    monkeypatch.setattr(crm, "get_inbox_threads", fake_get_inbox_threads)

    result = await crm.get_inbox_conversation_detail(
        repo=None,
        _="",
        user_token="user-token",
        organizacion_id=uuid4(),
        usuario_id=None,
        conversacion_id=conversation_id,
        thread_offset=1,
        message_limit=20,
    )

    assert result.conversacion_id == conversation_id
    assert captured["search"] is None
    assert captured["limit"] == 1
    assert captured["enrich"] is True


def test_pipeline_card_reads_contact_metadata_without_name_error():
    row = {
        "id": str(uuid4()),
        "etapa_id": str(uuid4()),
        "metadata": {},
        "contacto": {"metadata": {"contexto_modo": "persona_fisica"}},
        "cuenta": {},
        "asignado": {},
    }

    card = crm._card_from_opportunity(row)

    assert card is not None
