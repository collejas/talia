import pytest

from httpx import AsyncClient
from typing import Any, Sequence
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

from app.api.routes.admin import get_platform_repo, require_platform_admin
from app.main import app
from app.repositories.platform_admin import PlatformRepositoryError


TEST_PLATFORM_ADMIN_ID = UUID("00000000-0000-0000-0000-000000000001")


class DummyRepo:
    def __init__(self, fail_route: bool = False) -> None:
        self.fail_route = fail_route
        self.created_tenant: dict[str, Any] | None = None
        self.role_id = uuid4()
        self.department_id = uuid4()
        self.position_id = uuid4()

    async def create_organizacion(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        self.created_tenant = payload
        return {"id": str(uuid4())}

    async def create_channel_route(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        if self.fail_route:
            raise PlatformRepositoryError("route_conflict")
        return {"id": str(uuid4())}

    async def create_permissions(
        self, *, organizacion_id: UUID, permisos: Sequence[dict[str, str]]
    ) -> list[dict[str, Any]]:
        return [{"id": str(uuid4()), **perm} for perm in permisos]

    async def create_role(
        self, *, organizacion_id: UUID, nombre: str, descripcion: str | None
    ) -> dict[str, Any]:
        return {"id": str(self.role_id), "nombre": nombre, "descripcion": descripcion}

    async def create_role_permission(
        self, *, organizacion_id: UUID, rol_id: UUID, permiso_id: UUID
    ) -> None:
        return None

    async def create_department(self, *, organizacion_id: UUID, nombre: str) -> dict[str, Any]:
        return {"id": str(self.department_id), "nombre": nombre}

    async def create_position(self, *, organizacion_id: UUID, nombre: str) -> dict[str, Any]:
        return {"id": str(self.position_id), "nombre": nombre}

    async def upsert_usuario(
        self,
        *,
        usuario_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return {"id": str(usuario_id), **payload}

    async def assign_user_role(self, *, usuario_id: UUID, rol_id: UUID, organizacion_id: UUID) -> dict[str, Any]:
        return {"usuario_id": str(usuario_id), "rol_id": str(rol_id)}

    async def create_employee(
        self,
        *,
        usuario_id: UUID,
        departamento_id: UUID | None,
        puesto_id: UUID | None,
        organizacion_id: UUID,
    ) -> dict[str, Any]:
        return {"usuario_id": str(usuario_id)}


def apply_dependency_overrides(repo: DummyRepo) -> None:
    app.dependency_overrides[require_platform_admin] = lambda: TEST_PLATFORM_ADMIN_ID
    app.dependency_overrides[get_platform_repo] = lambda: repo


@pytest.fixture
def clear_overrides() -> None:
    yield
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_tenant_with_admin_success(async_client: AsyncClient, clear_overrides: None):
    repo = DummyRepo()
    apply_dependency_overrides(repo)
    payload = {
        "tenant": {
            "nombre": "Cliente X",
            "config": {"features": {"webchat": {"enabled": True}}},
            "webchat_alias": "cliente-x",
        },
        "admin": {
            "correo": "admin@cliente.test",
            "nombre_completo": "Admin Cliente",
            "telefono": "+521234567890",
            "estado": "activo",
        },
        "seed": {
            "departamento": "Administración",
            "puesto": "Admin CRM",
            "rol_nombre": "Admin",
            "rol_descripcion": "Administrador principal",
            "permisos": [
                {"codigo": "usuarios.write", "descripcion": "Gestionar usuarios"},
                {"codigo": "roles.write", "descripcion": "Gestionar roles"},
            ],
        },
    }

    test_user_id = uuid4()
    with patch("app.api.routes.admin.create_supabase_user", AsyncMock(return_value=(str(test_user_id), "+521234567890"))):
        response = await async_client.post("/admin/tenants/con_usuario", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert UUID(data["tenant_id"])
    assert UUID(data["usuario_id"]) == test_user_id
    assert data["seed"]["rol_id"] == str(repo.role_id)
    assert len(data["seed"]["permisos_ids"]) == 2
    assert data["seed"]["departamento_id"] == str(repo.department_id)
    assert data["seed"]["puesto_id"] == str(repo.position_id)
    assert data["recovery_email_sent"] is True


@pytest.mark.asyncio
async def test_create_tenant_with_admin_alias_conflict(async_client: AsyncClient, clear_overrides: None):
    repo = DummyRepo(fail_route=True)
    apply_dependency_overrides(repo)
    payload = {
        "tenant": {"nombre": "Cliente Y", "webchat_alias": "conflict"},
        "admin": {
            "correo": "admin@y.test",
            "nombre_completo": "Admin Y",
        },
        "seed": {
            "departamento": "Administración",
            "puesto": "Admin CRM",
            "rol_nombre": "Admin",
            "permisos": [{"codigo": "usuarios.write", "descripcion": "Usuarios"}],
        },
    }

    response = await async_client.post("/admin/tenants/con_usuario", json=payload)
    assert response.status_code == 409
