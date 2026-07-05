from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID, uuid4

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


@pytest.mark.asyncio
async def test_update_persona_uses_correo_as_correo_principal(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = CRMRepository()
    persona_id = uuid4()
    organizacion_id = uuid4()
    existing_row = {
        "id": str(persona_id),
        "organizacion_id": str(organizacion_id),
        "nombre_completo": "Ada Lovelace",
        "correo_principal": "old@example.com",
        "correo_secundario": None,
        "correo_institucional": None,
        "company_name": None,
        "notas": None,
        "origen": None,
        "estado": "lead",
        "metadata": {},
        "persona_datos": {},
        "cuenta_id": None,
        "creado_en": "2026-01-01T00:00:00Z",
        "actualizado_en": "2026-01-01T00:00:00Z",
    }
    updated_row = {
        **existing_row,
        "correo_principal": "new@example.com",
        "correo": "new@example.com",
        "actualizado_en": "2026-01-02T00:00:00Z",
    }
    calls: list[tuple[str, dict[str, object] | None]] = []
    get_persona_calls = 0

    async def fake_get_persona(
        *,
        organizacion_id: uuid.UUID,
        persona_id: uuid.UUID,
    ) -> dict[str, object] | None:
        nonlocal get_persona_calls
        assert organizacion_id == UUID(existing_row["organizacion_id"])
        assert persona_id == UUID(existing_row["id"])
        get_persona_calls += 1
        if get_persona_calls == 1:
            return dict(existing_row)
        return dict(updated_row)

    async def fake_request(
        method: str,
        path: str,
        *,
        params: dict[str, object] | None = None,
        json: dict[str, object] | None = None,
        prefer: str | None = None,
    ) -> SimpleNamespace:
        calls.append((f"{method} {path}", dict(json) if isinstance(json, dict) else None))
        if method == "PATCH" and path == "/rest/v1/personas":
            assert params is not None
            assert params["id"] == f"eq.{persona_id}"
            assert json is not None
            assert json["correo_principal"] == "new@example.com"
            return SimpleNamespace(status_code=200, json=lambda: [dict(updated_row)])
        if method == "DELETE" and path == "/rest/v1/cuenta_personas":
            return SimpleNamespace(status_code=200, json=lambda: [])
        raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(repo, "get_persona", fake_get_persona)
    monkeypatch.setattr(repo, "_request", fake_request)

    result = await repo.update_persona(
        organizacion_id=organizacion_id,
        persona_id=persona_id,
        payload={"correo": "new@example.com"},
    )

    assert any(name == "PATCH /rest/v1/personas" for name, _ in calls)
    assert result["correo_principal"] == "new@example.com"


@pytest.mark.asyncio
async def test_update_persona_syncs_email_aliases_when_primary_changes(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = CRMRepository()
    persona_id = uuid4()
    organizacion_id = uuid4()
    existing_row = {
        "id": str(persona_id),
        "organizacion_id": str(organizacion_id),
        "nombre_completo": "Ada Lovelace",
        "correo_principal": "old@example.com",
        "correo_secundario": "old@example.com",
        "correo_institucional": "old@example.com",
        "company_name": None,
        "notas": None,
        "origen": None,
        "estado": "lead",
        "metadata": {},
        "persona_datos": {},
        "cuenta_id": None,
        "creado_en": "2026-01-01T00:00:00Z",
        "actualizado_en": "2026-01-01T00:00:00Z",
    }
    updated_row = {
        **existing_row,
        "correo_principal": "new@example.com",
        "correo_secundario": "new@example.com",
        "correo_institucional": "new@example.com",
        "correo": "new@example.com",
        "actualizado_en": "2026-01-02T00:00:00Z",
    }
    calls: list[tuple[str, dict[str, object] | None]] = []
    get_persona_calls = 0

    async def fake_get_persona(
        *,
        organizacion_id: uuid.UUID,
        persona_id: uuid.UUID,
    ) -> dict[str, object] | None:
        nonlocal get_persona_calls
        assert organizacion_id == UUID(existing_row["organizacion_id"])
        assert persona_id == UUID(existing_row["id"])
        get_persona_calls += 1
        if get_persona_calls == 1:
            return dict(existing_row)
        return dict(updated_row)

    async def fake_request(
        method: str,
        path: str,
        *,
        params: dict[str, object] | None = None,
        json: dict[str, object] | None = None,
        prefer: str | None = None,
    ) -> SimpleNamespace:
        calls.append((f"{method} {path}", dict(json) if isinstance(json, dict) else None))
        if method == "PATCH" and path == "/rest/v1/personas":
            assert params is not None
            assert params["id"] == f"eq.{persona_id}"
            assert json is not None
            assert json["correo_principal"] == "new@example.com"
            assert json["correo_secundario"] == "new@example.com"
            assert json["correo_institucional"] == "new@example.com"
            return SimpleNamespace(status_code=200, json=lambda: [dict(updated_row)])
        if method == "DELETE" and path == "/rest/v1/cuenta_personas":
            return SimpleNamespace(status_code=200, json=lambda: [])
        raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(repo, "get_persona", fake_get_persona)
    monkeypatch.setattr(repo, "_request", fake_request)

    result = await repo.update_persona(
        organizacion_id=organizacion_id,
        persona_id=persona_id,
        payload={"correo": "new@example.com"},
    )

    assert any(name == "PATCH /rest/v1/personas" for name, _ in calls)
    assert result["correo_principal"] == "new@example.com"
    assert result["correo_secundario"] == "new@example.com"
    assert result["correo_institucional"] == "new@example.com"


@pytest.mark.asyncio
async def test_persona_to_contact_row_prefers_primary_email(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = CRMRepository.__new__(CRMRepository)

    async def fake_get_primary_account_for_persona(**_: object) -> dict[str, object]:
        return {}

    monkeypatch.setattr(repo, "_get_primary_account_for_persona", fake_get_primary_account_for_persona)

    persona = {
        "id": str(uuid4()),
        "organizacion_id": str(uuid4()),
        "nombre_completo": "Ada Lovelace",
        "correo_principal": "new@example.com",
        "correo_secundario": "old@example.com",
        "correo_institucional": "old@example.com",
        "metadata": {},
        "persona_datos": {},
    }

    row = await repo._persona_to_contact_row(persona=persona, organizacion_id=uuid4())

    assert row["correo"] == "new@example.com"
    assert row["email"] == "new@example.com"
