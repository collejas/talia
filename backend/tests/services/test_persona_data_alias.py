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


@pytest.mark.asyncio
async def test_update_persona_expands_full_name_into_parts(monkeypatch: pytest.MonkeyPatch) -> None:
    persona_id = str(uuid4())
    row = {
        "id": persona_id,
        "organizacion_id": str(uuid4()),
        "nombre_completo": "Collejas",
        "nombre": "Collejas",
        "apellido_paterno": "",
        "apellido_materno": "",
        "metadata": {},
    }

    captured: dict[str, object] = {}

    class FakeRepo:
        async def update_persona_by_id(self, *, persona_id: str, patch: dict[str, object]) -> dict[str, object]:
            assert persona_id == row["id"]
            captured["persona_id"] = persona_id
            captured["payload"] = dict(patch)
            return {
                **row,
                "nombre": patch.get("nombre"),
                "apellido_paterno": patch.get("apellido_paterno"),
                "apellido_materno": patch.get("apellido_materno"),
                "nombre_completo": patch.get("nombre_completo"),
            }

    monkeypatch.setattr(storage, "CRMRepository", lambda: FakeRepo())

    storage_repo = await storage.update_persona(row["id"], {"nombre_completo": "Luis Perez, hoteles catalina"})

    assert captured["persona_id"] == row["id"]
    payload = captured["payload"]
    assert isinstance(payload, dict)
    assert payload["nombre"] == "Luis"
    assert payload["apellido_paterno"] == "Perez"
    assert "apellido_materno" not in payload or not payload["apellido_materno"]
    assert payload["nombre_completo"] == "Luis Perez, hoteles catalina"
    assert storage_repo["nombre_completo"] == "Luis Perez, hoteles catalina"
