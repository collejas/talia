"""Pruebas del adaptador RPC para créditos de prospección."""

from typing import Any
from uuid import UUID

import httpx
import pytest

from app.repositories.crm import CRMRepository, CRMRepositoryError

TENANT_ID = UUID("cc0b0c64-ef9c-4dbd-bf6a-faeb401922b8")
OPERATION_ID = UUID("ae24bec3-0497-4df0-9078-a3e3f7f26eeb")
RESULT_ID = UUID("a653300c-0150-4d31-8e04-e5a857bb23ec")


class FakeTransactionalRepository(CRMRepository):
    def __init__(self, *, response: dict[str, Any] | None = None, error: str | None = None) -> None:
        self.response = response
        self.error = error
        self.calls: list[dict[str, Any]] = []

    async def _request_service_role(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        self.calls.append({"method": method, "path": path, **kwargs})
        if self.error:
            raise CRMRepositoryError(self.error)
        request = httpx.Request(method, f"https://example.test{path}")
        return httpx.Response(200, request=request, json=self.response)


@pytest.mark.asyncio
async def test_transactional_save_calls_tenant_scoped_rpc() -> None:
    repo = FakeTransactionalRepository(
        response={
            "ok": True,
            "operation_id": str(OPERATION_ID),
            "nuevos_guardados": 1,
            "prospectos": [{"id": "prospecto-1"}],
        }
    )

    result = await repo.save_denue_prospectos_transactional(
        organizacion_id=TENANT_ID,
        created_by=None,
        operation_id=OPERATION_ID,
        resultado_ids=[RESULT_ID],
        segmento="Restaurantes",
        metadata={"busqueda_id": "busqueda-1"},
    )

    assert result["nuevos_guardados"] == 1
    assert repo.calls == [
        {
            "method": "POST",
            "path": "/rest/v1/rpc/prospeccion_guardar_denue_transaccional",
            "json": {
                "p_tenant_id": str(TENANT_ID),
                "p_created_by": None,
                "p_operation_id": str(OPERATION_ID),
                "p_resultado_ids": [str(RESULT_ID)],
                "p_segmento": "Restaurantes",
                "p_metadata": {"busqueda_id": "busqueda-1"},
            },
            "organizacion_id": TENANT_ID,
        }
    ]


@pytest.mark.asyncio
async def test_transactional_save_exposes_only_known_business_error() -> None:
    repo = FakeTransactionalRepository(
        error=(
            "Supabase respondió error 400: internal sql context "
            "prospeccion_operation_payload_conflict"
        )
    )

    with pytest.raises(
        CRMRepositoryError,
        match="^prospeccion_operation_payload_conflict$",
    ):
        await repo.save_denue_prospectos_transactional(
            organizacion_id=TENANT_ID,
            created_by=None,
            operation_id=OPERATION_ID,
            resultado_ids=[RESULT_ID],
            segmento=None,
            metadata={},
        )


@pytest.mark.asyncio
async def test_transactional_save_hides_unknown_database_error() -> None:
    repo = FakeTransactionalRepository(error="relation private_table does not exist")

    with pytest.raises(CRMRepositoryError, match="^prospeccion_transaction_failed$"):
        await repo.save_denue_prospectos_transactional(
            organizacion_id=TENANT_ID,
            created_by=None,
            operation_id=OPERATION_ID,
            resultado_ids=[RESULT_ID],
            segmento=None,
            metadata={},
        )
