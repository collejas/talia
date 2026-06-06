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
        nonlocal seen_contact_patch
        if path == "/rest/v1/oportunidades":
            assert method == "PATCH"
            assert json == {"asignado_a_usuario_id": str(rep_id)}
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
    assert seen_contact_patch is True


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
        assert method == "PATCH"
        assert path == "/rest/v1/contactos"
        assert params is not None
        assert params.get("propietario_usuario_id") == "is.null"
        assert json == {"propietario_usuario_id": str(existing)}
        return SimpleNamespace(status_code=200, json=lambda: [])

    monkeypatch.setattr(repo, "_request", fake_request)

    assigned = await repo._assign_sales_rep_if_needed(
        oportunidad_id=uuid.uuid4(),
        organizacion_id=uuid.uuid4(),
        current_assignee=existing,
        contact_id=str(uuid.uuid4()),
    )

    assert assigned == existing
