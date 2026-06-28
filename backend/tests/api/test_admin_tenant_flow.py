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
        self.updated_config: dict[str, Any] | None = None
        self.created_stages: list[dict[str, Any]] = []
        self.role_id = uuid4()
        self.department_id = uuid4()
        self.position_id = uuid4()
        self.owner_role_id = uuid4()
        self.permission_rows: list[dict[str, Any]] = []

    async def create_organizacion(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        self.created_tenant = payload
        return {"id": str(uuid4())}

    async def create_channel_route(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        if self.fail_route:
            raise PlatformRepositoryError("route_conflict")
        return {"id": str(uuid4())}

    async def resolve_org_for_route(self, *, canal: str, clave: str) -> str | None:
        if self.fail_route and canal == "webchat" and clave:
            return str(uuid4())
        return None

    async def get_organizacion_config(self, *, organizacion_id: UUID) -> dict[str, Any]:
        return {}

    async def create_calendar_resource(
        self,
        *,
        organizacion_id: UUID,
        name: str,
        slug: str,
        timezone: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {"id": str(uuid4())}

    async def set_organizacion_config(self, *, organizacion_id: UUID, config: dict[str, Any]) -> dict[str, Any]:
        self.updated_config = config
        return {"id": str(organizacion_id), "config": config}

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
        stage = {
            "id": str(uuid4()),
            "organizacion_id": str(organizacion_id),
            "codigo": codigo,
            "nombre": nombre,
            "orden": orden,
            "probabilidad": probabilidad,
            "categoria": categoria,
            "metadata": metadata or {},
        }
        self.created_stages.append(stage)
        return stage

    async def delete_organizacion(self, *, organizacion_id: UUID) -> None:
        return None

    async def create_permissions(
        self, *, organizacion_id: UUID, permisos: Sequence[dict[str, str]]
    ) -> list[dict[str, Any]]:
        rows = [{"id": str(uuid4()), **perm} for perm in permisos]
        self.permission_rows.extend(rows)
        return rows

    async def list_permissions(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        return list(self.permission_rows)

    async def create_role(
        self, *, organizacion_id: UUID, nombre: str, descripcion: str | None
    ) -> dict[str, Any]:
        return {"id": str(self.role_id), "nombre": nombre, "descripcion": descripcion}

    async def create_role_permission(
        self, *, organizacion_id: UUID, rol_id: UUID, permiso_id: UUID
    ) -> None:
        return None

    async def list_roles(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        return [
            {"id": str(self.owner_role_id), "nombre": "owner"},
            {"id": str(self.role_id), "nombre": "Admin"},
        ]

    async def list_role_permissions(self, *, organizacion_id: UUID, rol_id: UUID) -> list[dict[str, Any]]:
        return []

    async def list_tenant_bootstrap_catalog(self, *, tipo: str) -> list[str]:
        if tipo == "departamento":
            return ["Administración"]
        if tipo == "puesto":
            return ["Admin CRM"]
        return []

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
    with (
        patch("app.api.routes.admin.is_email_registered", AsyncMock(return_value=False)),
        patch("app.api.routes.admin.create_supabase_user", AsyncMock(return_value=(str(test_user_id), "+521234567890"))),
    ):
        response = await async_client.post("/admin/tenants/con_usuario", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert UUID(data["tenant_id"])
    assert UUID(data["usuario_id"]) == test_user_id
    assert data["seed"]["rol_id"] == str(repo.owner_role_id)
    assert len(data["seed"]["permisos_ids"]) == 2
    assert data["seed"]["departamento_id"] == str(repo.department_id)
    assert data["seed"]["puesto_id"] == str(repo.position_id)
    assert data["invite_email_sent"] is True
    assert isinstance(repo.updated_config, dict)
    assert repo.updated_config.get("features", {}).get("webchat", {}).get("enabled") is True
    assert repo.updated_config.get("features", {}).get("catalog_backend", {}).get("enabled") is True
    assert repo.updated_config.get("webchat", {}).get("calendar", {}).get("resource_id")
    assert repo.updated_config.get("whatsapp", {}).get("provider") == "meta"
    assert [stage["codigo"] for stage in repo.created_stages] == [
        "captado",
        "precalificado",
        "demo",
        "propuesta",
        "negociacion",
        "cerrado_ganado",
        "cerrado_perdido",
    ]


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

    with patch("app.api.routes.admin.is_email_registered", AsyncMock(return_value=False)):
        response = await async_client.post("/admin/tenants/con_usuario", json=payload)
    assert response.status_code == 409
    assert repo.created_tenant is None


@pytest.mark.asyncio
async def test_create_tenant_with_admin_duplicate_email(async_client: AsyncClient, clear_overrides: None):
    repo = DummyRepo()
    apply_dependency_overrides(repo)
    payload = {
        "tenant": {"nombre": "Cliente Z"},
        "admin": {
            "correo": "admin@duplicado.test",
            "nombre_completo": "Admin Z",
        },
        "seed": {
            "departamento": "Administración",
            "puesto": "Admin CRM",
            "rol_nombre": "Admin",
            "permisos": [{"codigo": "usuarios.write", "descripcion": "Usuarios"}],
        },
    }

    with patch("app.api.routes.admin.is_email_registered", AsyncMock(return_value=True)):
        response = await async_client.post("/admin/tenants/con_usuario", json=payload)

    assert response.status_code == 409
    assert response.json()["detail"] == "email_already_registered"
    assert repo.created_tenant is None
