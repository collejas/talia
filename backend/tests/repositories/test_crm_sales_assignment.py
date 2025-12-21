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
        assert method == "PATCH"
        assert path == "/rest/v1/oportunidades"
        assert params is not None and "id" in params
        assert json == {"asignado_a_usuario_id": str(rep_id)}
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
