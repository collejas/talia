import uuid
from types import SimpleNamespace

import pytest

from app.repositories.crm import CRMRepository


@pytest.mark.asyncio
async def test_assign_next_sales_rep_parses_rpc_response(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = CRMRepository()

    async def fake_rpc(function_name: str, payload: dict[str, str]) -> list[dict[str, str]]:
        assert function_name == "asignar_vendedor_round_robin"
        assert "p_organizacion_id" in payload
        return [
            {
                "usuario_id": "00000000-0000-0000-0000-000000000123",
                "nombre": "Seller",
                "correo": "seller@example.com",
                "telefono_e164": "+521111111111",
            }
        ]

    monkeypatch.setattr(repo, "_rpc", fake_rpc)

    result = await repo.assign_next_sales_rep(organizacion_id=uuid.uuid4())
    assert result is not None
    assert result["usuario_id"] == uuid.UUID("00000000-0000-0000-0000-000000000123")
    assert result["correo"] == "seller@example.com"


@pytest.mark.asyncio
async def test_assignment_audit_uses_persona_fk_for_canonical_person(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = CRMRepository()
    captured: dict[str, object] = {}

    async def fake_request(
        method: str,
        path: str,
        *,
        params: dict[str, object] | None = None,
        json: dict[str, object] | None = None,
        prefer: str | None = None,
    ) -> SimpleNamespace:
        assert method == "POST"
        assert path == "/rest/v1/asignaciones_vendedores"
        captured.update(json or {})
        return SimpleNamespace(status_code=201, json=lambda: [])

    monkeypatch.setattr(repo, "_request", fake_request)
    persona_id = str(uuid.uuid4())
    await repo.insert_sales_assignment_audit(
        organizacion_id=uuid.uuid4(),
        oportunidad_id=None,
        vendedor_id=uuid.uuid4(),
        conversation_id=str(uuid.uuid4()),
        persona_id=persona_id,
        contact_id=persona_id,
        trigger="manual_reassign_contact",
        canal="panel",
    )

    assert captured["persona_id"] == persona_id
    assert "contacto_id" not in captured


@pytest.mark.asyncio
async def test_assign_sales_rep_if_needed_updates_when_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = CRMRepository()
    rep_id = uuid.uuid4()

    async def fake_assign_next_sales_rep(**_: object) -> dict[str, object]:
        return {
            "usuario_id": rep_id,
            "nombre": "Seller",
            "correo": "seller@example.com",
            "telefono_e164": "+521111111111",
        }

    async def fake_request(
        method: str,
        path: str,
        *,
        params: dict[str, object] | None = None,
        json: dict[str, object] | None = None,
        prefer: str | None = None,
    ) -> SimpleNamespace:
        if path == "/rest/v1/oportunidades":
            assert method == "PATCH"
            assert params is not None and "id" in params
            assert json == {"asignado_a_usuario_id": str(rep_id)}
        elif path == "/rest/v1/asignaciones_vendedores":
            assert method == "POST"
            assert json and json.get("oportunidad_id")
            assert json.get("canal") == "assistant"
        else:
            pytest.fail(f"Unexpected path {path}")
        return SimpleNamespace(status_code=200, json=lambda: [])

    monkeypatch.setattr(repo, "assign_next_sales_rep", fake_assign_next_sales_rep)
    monkeypatch.setattr(repo, "_request", fake_request)

    assigned = await repo._assign_sales_rep_if_needed(
        oportunidad_id=uuid.uuid4(),
        organizacion_id=uuid.uuid4(),
    )
    assert assigned == rep_id


@pytest.mark.asyncio
async def test_assign_sales_rep_if_needed_skips_when_already_assigned() -> None:
    repo = CRMRepository()
    existing = uuid.uuid4()

    assigned = await repo._assign_sales_rep_if_needed(
        oportunidad_id=uuid.uuid4(),
        organizacion_id=uuid.uuid4(),
        current_assignee=existing,
    )

    assert assigned == existing


@pytest.mark.asyncio
async def test_assign_sales_rep_if_needed_skips_when_contact_not_ready(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = CRMRepository()
    async def fake_assign_next_sales_rep(**_: object) -> dict[str, object]:
        pytest.fail("No debe solicitarse un vendedor cuando falta dato de contacto")

    monkeypatch.setattr(repo, "assign_next_sales_rep", fake_assign_next_sales_rep)

    assigned = await repo._assign_sales_rep_if_needed(
        oportunidad_id=uuid.uuid4(),
        organizacion_id=uuid.uuid4(),
        require_contact_ready=True,
        contact_ready=False,
    )

    assert assigned is None




@pytest.mark.asyncio
async def test_assign_sales_rep_if_needed_sets_contact_owner_on_round_robin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = CRMRepository()
    rep_id = uuid.uuid4()
    contact_id = str(uuid.uuid4())
    seen_contact_patch = False
    seen_persona_patch = False

    async def fake_assign_next_sales_rep(**_: object) -> dict[str, object]:
        return {
            "usuario_id": rep_id,
            "nombre": "Seller",
            "correo": "seller@example.com",
            "telefono_e164": "+521111111111",
        }

    async def fake_request(
        method: str,
        path: str,
        *,
        params: dict[str, object] | None = None,
        json: dict[str, object] | None = None,
        prefer: str | None = None,
    ) -> SimpleNamespace:
        nonlocal seen_contact_patch, seen_persona_patch
        if path == "/rest/v1/oportunidades":
            assert method == "PATCH"
            assert json == {"asignado_a_usuario_id": str(rep_id)}
        elif path == "/rest/v1/personas":
            if method == "GET":
                return SimpleNamespace(
                    status_code=200,
                    json=lambda: [],
                )
            assert method == "PATCH"
            assert params is not None
            assert params.get("propietario_usuario_id") == "is.null"
            assert json == {"propietario_usuario_id": str(rep_id)}
            seen_persona_patch = True
        elif path == "/rest/v1/contactos":
            if method == "GET":
                return SimpleNamespace(
                    status_code=200,
                    json=lambda: [{"propietario_usuario_id": None}],
                )
            assert method == "PATCH"
            assert params is not None
            assert params.get("propietario_usuario_id") == "is.null"
            assert json == {"propietario_usuario_id": str(rep_id)}
            seen_contact_patch = True
        elif path == "/rest/v1/asignaciones_vendedores":
            assert method == "POST"
            assert json and json.get("oportunidad_id")
        else:
            pytest.fail(f"Unexpected path {path}")
        return SimpleNamespace(status_code=200, json=lambda: [])

    monkeypatch.setattr(repo, "assign_next_sales_rep", fake_assign_next_sales_rep)
    monkeypatch.setattr(repo, "_request", fake_request)

    assigned = await repo._assign_sales_rep_if_needed(
        oportunidad_id=uuid.uuid4(),
        organizacion_id=uuid.uuid4(),
        contact_id=contact_id,
    )

    assert assigned == rep_id
    assert seen_persona_patch or seen_contact_patch


@pytest.mark.asyncio
async def test_assign_sales_rep_if_needed_sets_contact_owner_when_already_assigned(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = CRMRepository()
    existing = uuid.uuid4()

    async def fake_request(
        method: str,
        path: str,
        *,
        params: dict[str, object] | None = None,
        json: dict[str, object] | None = None,
        prefer: str | None = None,
    ) -> SimpleNamespace:
        if path == "/rest/v1/contactos":
            assert method == "PATCH"
            assert params is not None
            assert params.get("propietario_usuario_id") == "is.null"
            assert json == {"propietario_usuario_id": str(existing)}
            return SimpleNamespace(status_code=200, json=lambda: [])
        if path == "/rest/v1/personas":
            assert method == "PATCH"
            assert params is not None
            assert params.get("propietario_usuario_id") == "is.null"
            assert json == {"propietario_usuario_id": str(existing)}
            return SimpleNamespace(status_code=200, json=lambda: [])
        pytest.fail(f"Unexpected path {path}")

    monkeypatch.setattr(repo, "_request", fake_request)

    assigned = await repo._assign_sales_rep_if_needed(
        oportunidad_id=uuid.uuid4(),
        organizacion_id=uuid.uuid4(),
        current_assignee=existing,
        contact_id=str(uuid.uuid4()),
    )

    assert assigned == existing


@pytest.mark.asyncio
async def test_ensure_contact_record_for_persona_omite_codigo_manual_y_delega_autocode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = CRMRepository()
    persona_id = uuid.uuid4()
    organizacion_id = uuid.uuid4()
    captured: dict[str, object] = {}

    async def fake_request_service_role(
        method: str,
        path: str,
        *,
        params: dict[str, object] | None = None,
        json: dict[str, object] | None = None,
        prefer: str | None = None,
        organizacion_id: uuid.UUID | None = None,
    ) -> SimpleNamespace:
        if method == "GET" and path == "/rest/v1/contactos":
            return SimpleNamespace(status_code=200, json=lambda: [])
        if method == "POST" and path == "/rest/v1/contactos":
            captured["json"] = dict(json or {})
            return SimpleNamespace(status_code=201, json=lambda: [{"id": str(persona_id)}])
        pytest.fail(f"Solicitud inesperada: {method} {path}")

    async def fake_get_persona(
        *,
        organizacion_id: uuid.UUID,
        persona_id: uuid.UUID,
        use_service_role: bool = False,
    ) -> dict[str, object]:
        return {
            "id": str(persona_id),
            "organizacion_id": str(organizacion_id),
            "codigo_contacto": "Cont-77",
            "nombre_completo": "Persona Demo",
            "correo_principal": "demo@example.com",
            "telefono_principal_e164": "+521111111111",
        }

    async def fake_persona_to_contact_row(
        *,
        persona: dict[str, object],
        organizacion_id: uuid.UUID,
    ) -> dict[str, object]:
        return {
            "codigo_contacto": "Cont-77",
            "nombre_completo": "Persona Demo",
            "correo": "demo@example.com",
            "telefono_e164": "+521111111111",
            "estado": "activo",
            "contacto_datos": {},
        }

    monkeypatch.setattr(repo, "_request_service_role", fake_request_service_role)
    monkeypatch.setattr(repo, "get_persona", fake_get_persona)
    monkeypatch.setattr(repo, "_persona_to_contact_row", fake_persona_to_contact_row)

    await repo.ensure_contact_record_for_persona(
        organizacion_id=organizacion_id,
        persona_id=persona_id,
        use_service_role=True,
    )

    assert isinstance(captured.get("json"), dict)
    assert captured["json"]["organizacion_id"] == str(organizacion_id)
    assert "codigo_contacto" not in captured["json"]
    assert captured["json"]["estado"] == "activo"
