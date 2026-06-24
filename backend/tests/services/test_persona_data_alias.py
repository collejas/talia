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


def test_build_contact_write_parts_persists_company_and_need_aliases() -> None:
    repo = CRMRepository.__new__(CRMRepository)
    parts = repo._build_contact_write_parts(
        organizacion_id=uuid4(),
        contact_id=uuid4(),
        payload={
            "company_name": "Demo SA",
            "necesidad_proposito": "Automatizar atención",
        },
    )

    persona_body = parts["persona_body"]
    account_body = parts["account_body"]

    assert persona_body["company_name"] == "Demo SA"
    assert persona_body["persona_datos"]["company_name"] == "Demo SA"
    assert persona_body["persona_datos"]["necesidad_proposito"] == "Automatizar atención"
    assert persona_body["metadata"]["company_name"] == "Demo SA"
    assert persona_body["metadata"]["necesidad_proposito"] == "Automatizar atención"
    assert account_body is not None
    assert account_body["necesidad_proposito"] == "Automatizar atención"


def test_build_contact_write_parts_prefers_explicit_full_name_for_triggered_persona() -> None:
    repo = CRMRepository.__new__(CRMRepository)
    parts = repo._build_contact_write_parts(
        organizacion_id=uuid4(),
        contact_id=uuid4(),
        payload={
            "nombre_completo": "Luis Perez",
            "nombre_nombres": "Luis Perez",
            "apellido_paterno": None,
            "apellido_materno": None,
            "nombre": "Visitante",
        },
        existing={
            "nombre_completo": "Visitante WhatsApp",
            "nombre": "Visitante",
            "apellido_paterno": None,
            "apellido_materno": None,
        },
    )

    persona_body = parts["persona_body"]
    assert persona_body["nombre"] == "Luis Perez"
    assert persona_body["nombre_completo"] == "Luis Perez"
    assert persona_body["apellido_paterno"] is None
    assert persona_body["apellido_materno"] is None


@pytest.mark.asyncio
async def test_persona_to_contact_row_prefers_persona_company_and_need() -> None:
    repo = CRMRepository.__new__(CRMRepository)
    async def fake_get_primary_account_for_persona(**_: object) -> dict[str, object]:
        return {}

    repo._get_primary_account_for_persona = fake_get_primary_account_for_persona  # type: ignore[attr-defined]
    persona = {
        "id": str(uuid4()),
        "organizacion_id": str(uuid4()),
        "nombre_completo": "Ada Lovelace",
        "company_name": "Demo SA",
        "necesidad_proposito": "Automatizar atención",
        "metadata": {"company_name": "Demo SA", "necesidad_proposito": "Automatizar atención"},
        "persona_datos": {"company_name": "Demo SA", "necesidad_proposito": "Automatizar atención"},
    }

    row = await repo._persona_to_contact_row(persona=persona, organizacion_id=uuid4())

    assert row["company_name"] == "Demo SA"
    assert row["necesidad_proposito"] == "Automatizar atención"


@pytest.mark.parametrize(
    ("input_estado", "expected_estado"),
    [
        ("", "lead"),
        ("nuevo", "lead"),
        ("cliente", "activo"),
        ("Bloqueada", "bloqueado"),
        ("fusionada", "fusionado"),
        ("desconocido", "lead"),
    ],
)
def test_build_contact_write_parts_normalizes_persona_estado(
    input_estado: str,
    expected_estado: str,
) -> None:
    repo = CRMRepository.__new__(CRMRepository)
    parts = repo._build_contact_write_parts(
        organizacion_id=uuid4(),
        contact_id=uuid4(),
        payload={
            "nombre": "Ada",
            "apellido_paterno": "Lovelace",
            "estado": input_estado,
        },
    )

    assert parts["persona_body"]["estado"] == expected_estado


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
