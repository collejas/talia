from __future__ import annotations

from uuid import uuid4

import pytest

from app.repositories.crm import CRMRepository
from app.services import storage


@pytest.mark.asyncio
async def test_fetch_persona_exposes_persona_datos(monkeypatch: pytest.MonkeyPatch) -> None:
    row = {
        "id": str(uuid4()),
        "organizacion_id": str(uuid4()),
        "nombre_completo": "Ada Lovelace",
        "metadata": {
            "profile_name": "Ada",
            "lead_scoring": {"answers": {"budget_range": "medio"}},
        },
    }

    class FakeRepo:
        async def get_persona_by_id(self, *, persona_id: str) -> dict[str, object] | None:
            assert persona_id == row["id"]
            return dict(row)

    monkeypatch.setattr(storage, "CRMRepository", lambda: FakeRepo())

    persona = await storage.fetch_persona(row["id"])

    assert persona["persona_datos"]["profile_name"] == "Ada"
    assert persona["contacto_datos"]["lead_scoring"]["answers"]["budget_range"] == "medio"
    assert persona["metadata"]["profile_name"] == "Ada"


def test_build_contact_write_parts_merges_persona_datos_into_metadata() -> None:
    repo = CRMRepository.__new__(CRMRepository)
    parts = repo._build_contact_write_parts(
        organizacion_id=uuid4(),
        contact_id=uuid4(),
        payload={
            "persona_datos": {
                "profile_name": "Ada",
                "lead_scoring": {"answers": {"budget_range": "alto"}},
            }
        },
    )

    persona_body = parts["persona_body"]
    assert persona_body["metadata"]["profile_name"] == "Ada"
    assert persona_body["metadata"]["lead_scoring"]["answers"]["budget_range"] == "alto"

