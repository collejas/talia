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
        self.requested_summary_org: UUID | None = None

    async def get_permission_context(self) -> dict[str, object]:
        return {
            "organizacion_id": str(ORG_ID),
            "es_owner": self.owner,
            "usuario_id": "20000000-0000-0000-0000-000000000001",
        }

    async def list_billing_periods(self, **kwargs: object) -> list[dict[str, object]]:
        self.requested_org = kwargs.get("organizacion_id")  # type: ignore[assignment]
        self.requested_summary_org = kwargs.get("organizacion_id")  # type: ignore[assignment]
        return [_period()]

    async def get_permission_context_for_test(self) -> dict[str, object]:
        return await self.get_permission_context()

    async def close_billing_period(self, **kwargs: object) -> dict[str, object]:
        period = _period()
        period["estado"] = "cerrado"
        period["cerrado_en"] = datetime(2026, 9, 1, tzinfo=timezone.utc).isoformat()
        return period

    async def create_billing_adjustment(self, **kwargs: object) -> dict[str, object]:
        return {
            "id": "30000000-0000-0000-0000-000000000001",
            "organizacion_id": kwargs["organizacion_id"],
            "periodo_id": kwargs["periodo_id"],
            "tipo": kwargs["tipo"],
            "importe": kwargs["importe"],
            "moneda": "MXN",
            "motivo": kwargs["motivo"],
            "referencia": kwargs.get("referencia"),
            "creado_por_usuario_id": kwargs["creado_por_usuario_id"],
            "creado_en": datetime.now(timezone.utc).isoformat(),
        }

    async def update_billing_alert_status(self, **kwargs: object) -> dict[str, object]:
        return {
            "id": "40000000-0000-0000-0000-000000000001",
            "organizacion_id": str(ORG_ID),
            "periodo_id": None,
            "tipo": "limite_mensajes",
            "severidad": "warning",
            "estado": kwargs["estado"],
            "umbral": "10",
            "valor_actual": "8",
            "mensaje": "test",
            "creado_en": datetime.now(timezone.utc).isoformat(),
            "resuelto_en": None,
        }


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


@pytest.mark.asyncio
async def test_master_summary_accepts_tenant_filter() -> None:
    tenant_id = UUID("10000000-0000-0000-0000-000000000010")
    repo = FakeRepository(owner=True)

    response = await billing.get_master_billing_summary(
        organizacion_id=tenant_id,
        repo=repo,
    )

    assert response.scope == "master"
    assert repo.requested_summary_org == tenant_id


@pytest.mark.asyncio
async def test_master_close_period_requires_owner() -> None:
    with pytest.raises(HTTPException) as error:
        await billing.close_master_billing_period(
            period_id=UUID("10000000-0000-0000-0000-000000000001"),
            repo=FakeRepository(owner=False),
        )
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_master_adjustment_rejects_zero_amount() -> None:
    payload = billing.BillingAdjustmentCreate(
        organizacion_id=ORG_ID,
        periodo_id=UUID("10000000-0000-0000-0000-000000000001"),
        tipo="credito",
        importe=Decimal("0"),
        motivo="Corrección de prueba",
    )
    with pytest.raises(HTTPException) as error:
        await billing.create_master_billing_adjustment(payload=payload, repo=FakeRepository(owner=True))
    assert error.value.status_code == 400
    assert error.value.detail == "billing_adjustment_amount_cannot_be_zero"


@pytest.mark.asyncio
async def test_master_can_update_alert_status() -> None:
    payload = billing.BillingAlertStatusUpdate(
        id=UUID("40000000-0000-0000-0000-000000000001"),
        estado="acknowledged",
    )
    response = await billing.update_master_billing_alert_status(
        payload=payload,
        repo=FakeRepository(owner=True),
    )
    assert response.estado == "acknowledged"
