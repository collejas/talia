"""Pruebas del aprovisionamiento del tenant desde billing comercial."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest

from app.services.tenant_provisioning import provision_tenant_from_billing


TEST_TENANT_ID = UUID("22222222-2222-2222-2222-222222222222")
TEST_PLAN_ID = UUID("11111111-1111-1111-1111-111111111111")


class DummyProvisioningRepo:
    def __init__(self) -> None:
        self.created_jobs: list[dict[str, Any]] = []
        self.updated_jobs: list[dict[str, Any]] = []
        self.updated_orgs: list[dict[str, Any]] = []
        self.created_permissions: list[dict[str, Any]] = []
        self.created_roles: list[dict[str, Any]] = []
        self.role_permissions: list[dict[str, Any]] = []
        self.created_departments: list[str] = []
        self.created_positions: list[str] = []
        self.created_stages: list[dict[str, Any]] = []
        self.config: dict[str, Any] = {}

    async def create_tenant_provisioning_job(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        row = {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", **payload}
        self.created_jobs.append(row)
        return row

    async def update_tenant_provisioning_job(self, *, job_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
        row = {"id": str(job_id), **payload}
        self.updated_jobs.append(row)
        return row

    async def get_organizacion_details(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        return {"id": str(organizacion_id), "nombre": "Cliente X", "activo": False}

    async def get_latest_tenant_access_invitation(
        self, *, tenant_id: UUID, flow_kind: str | None = None
    ) -> dict[str, Any] | None:
        return None

    async def get_tenant_billing_account(self, *, tenant_id: UUID) -> dict[str, Any] | None:
        return {
            "tenant_id": str(tenant_id),
            "plan_id": str(TEST_PLAN_ID),
            "billing_provider": "stripe",
            "stripe_customer_id": "cus_test_1",
        }

    async def get_commercial_plan(self, *, plan_id: UUID) -> dict[str, Any] | None:
        if str(plan_id) != str(TEST_PLAN_ID):
            return None
        return {"id": str(plan_id), "code": "starter", "name": "Starter", "active": True}

    async def list_commercial_plan_defaults(self) -> list[dict[str, Any]]:
        return [
            {
                "plan_id": str(TEST_PLAN_ID),
                "default_key": "webchat.inactivity_minutes",
                "default_value": "15",
                "scope": "tenant",
            }
        ]

    async def get_organizacion_config(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        return dict(self.config)

    async def set_organizacion_config(self, *, organizacion_id: UUID, config: dict[str, Any]) -> dict[str, Any]:
        self.config = dict(config)
        return {"id": str(organizacion_id), "config": config}

    async def create_calendar_resource(
        self,
        *,
        organizacion_id: UUID,
        name: str,
        slug: str,
        timezone: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {"id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}

    async def list_pipeline_stages(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        return []

    async def create_pipeline_stage(
        self,
        *,
        organizacion_id: UUID,
        codigo: str,
        nombre: str,
        orden: int,
        probabilidad: float | None = None,
        categoria: str = "abierta",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        row = {"codigo": codigo, "nombre": nombre, "orden": orden}
        self.created_stages.append(row)
        return row

    async def list_permissions(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        return list(self.created_permissions)

    async def create_permissions(
        self, *, organizacion_id: UUID, permisos: list[dict[str, str]]
    ) -> list[dict[str, Any]]:
        rows = [{"id": str(uuid4()), **perm} for perm in permisos]
        self.created_permissions.extend(rows)
        return rows

    async def list_roles(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        return []

    async def create_role(
        self, *, organizacion_id: UUID, nombre: str, descripcion: str | None
    ) -> dict[str, Any]:
        row = {"id": "cccccccc-cccc-cccc-cccc-cccccccccccc", "nombre": nombre, "descripcion": descripcion}
        self.created_roles.append(row)
        return row

    async def list_role_permissions(self, *, organizacion_id: UUID, rol_id: UUID) -> list[dict[str, Any]]:
        return []

    async def create_role_permission(self, *, organizacion_id: UUID, rol_id: UUID, permiso_id: UUID) -> None:
        self.role_permissions.append({"rol_id": str(rol_id), "permiso_id": str(permiso_id)})

    async def list_tenant_bootstrap_catalog(self, *, tipo: str) -> list[str]:
        if tipo == "departamento":
            return ["Administración"]
        if tipo == "puesto":
            return ["Admin CRM"]
        return []

    async def create_department(self, *, organizacion_id: UUID, nombre: str) -> dict[str, Any]:
        self.created_departments.append(nombre)
        return {"id": f"dept-{nombre}"}

    async def create_position(self, *, organizacion_id: UUID, nombre: str) -> dict[str, Any]:
        self.created_positions.append(nombre)
        return {"id": f"pos-{nombre}"}

    async def update_organizacion_details(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self.updated_orgs.append(payload)
        return {"id": str(organizacion_id), **payload}


@pytest.mark.asyncio
async def test_provision_tenant_from_billing_applies_defaults_and_bootstrap() -> None:
    repo = DummyProvisioningRepo()

    result = await provision_tenant_from_billing(
        repo=repo,
        tenant_id=TEST_TENANT_ID,
        source="evt_test_1",
    )

    assert result["ok"] is True
    assert result["tenant_id"] == str(TEST_TENANT_ID)
    assert repo.created_jobs[0]["status"] == "running"
    assert repo.updated_jobs[-1]["status"] == "completed"
    assert repo.config["webchat"]["inactivity_minutes"] == 15
    assert repo.config["webchat"]["calendar"]["resource_id"] == "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    assert repo.updated_orgs[0]["activo"] is True
    assert repo.created_permissions
    assert repo.created_roles[0]["nombre"] == "owner"
    assert repo.role_permissions
    assert repo.created_departments
    assert repo.created_positions
    assert len(repo.created_stages) == 7
