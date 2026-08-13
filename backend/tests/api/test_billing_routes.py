from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import pytest
from fastapi import HTTPException

from app.api.routes import billing


ORG_ID = UUID("00000000-0000-0000-0000-000000000001")


def _period() -> dict[str, object]:
    return {
        "id": "10000000-0000-0000-0000-000000000001",
        "organizacion_id": str(ORG_ID),
        "fecha_inicio": datetime(2026, 8, 1, tzinfo=timezone.utc).isoformat(),
        "fecha_fin": datetime(2026, 9, 1, tzinfo=timezone.utc).isoformat(),
        "estado": "abierto",
        "mensajes_cantidad": 2,
        "mensajes_entrantes_cantidad": 1,
        "mensajes_salientes_cantidad": 1,
        "hilos_con_actividad_cantidad": 1,
        "conversiones_cantidad": 0,
        "subtotal_mensajes": "0.1800",
        "costo_meta_periodo": "0.5614",
        "costo_mensaje_periodo": "0.7414",
        "ajustes_total": "0.0000",
        "total": "0.7414",
        "moneda": "MXN",
        "cerrado_en": None,
        "creado_en": datetime(2026, 8, 1, tzinfo=timezone.utc).isoformat(),
    }


class FakeRepository:
    def __init__(self, *, owner: bool = False) -> None:
        self.owner = owner
        self.requested_org: UUID | None = None

    async def get_permission_context(self) -> dict[str, object]:
        return {"organizacion_id": str(ORG_ID), "es_owner": self.owner}

    async def list_billing_periods(self, **kwargs: object) -> list[dict[str, object]]:
        self.requested_org = kwargs.get("organizacion_id")  # type: ignore[assignment]
        return [_period()]


@pytest.mark.asyncio
async def test_tenant_summary_uses_permission_context_tenant() -> None:
    repo = FakeRepository()

    response = await billing.get_billing_summary(repo=repo)

    assert response.scope == "tenant"
    assert response.organizacion_id == ORG_ID
    assert response.mensajes_cantidad == 2
    assert response.cargo_app_total == Decimal("0.1800")
    assert response.costo_meta_total == Decimal("0.5614")
    assert repo.requested_org == ORG_ID


@pytest.mark.asyncio
async def test_master_summary_rejects_non_owner() -> None:
    with pytest.raises(HTTPException) as error:
        await billing.get_master_billing_summary(repo=FakeRepository(owner=False))

    assert error.value.status_code == 403
    assert error.value.detail == "owner_required"
