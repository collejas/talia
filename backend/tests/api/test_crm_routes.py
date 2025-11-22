import uuid
from typing import Any, AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import AsyncClient

from app.api.routes import crm as crm_routes
from app.repositories.crm import CRMRepository


class DummyCRMRepository(CRMRepository):
    """Repo falso que permite inyectar respuestas predecibles."""

    def __init__(self) -> None:  # pragma: no cover - simple init
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def list_accounts(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_accounts", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "nombre": "Cuenta Demo",
                "alias": None,
                "tipo": None,
                "industria": None,
                "tamano": None,
                "sitio_web": None,
                "telefono": None,
                "correo": None,
                "direccion": {},
                "propietario_usuario_id": None,
                "metadata": {},
                "creado_en": "2024-01-01T00:00:00Z",
                "actualizado_en": "2024-01-01T00:00:00Z",
            }
        ]

    async def create_account(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_account", kwargs))
        body = kwargs["payload"].copy()
        body.setdefault("id", str(uuid.uuid4()))
        body["organizacion_id"] = str(kwargs["organizacion_id"])
        body.setdefault("creado_en", "2024-01-01T00:00:00Z")
        body.setdefault("actualizado_en", "2024-01-01T00:00:00Z")
        return body

    async def get_account(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_account", kwargs))
        if kwargs["account_id"] == uuid.UUID(int=1):
            return None
        return {
            "id": str(kwargs["account_id"]),
            "organizacion_id": str(kwargs["organizacion_id"]),
            "nombre": "Cuenta Demo",
            "alias": None,
            "tipo": None,
            "industria": None,
            "tamano": None,
            "sitio_web": None,
            "telefono": None,
            "correo": None,
            "direccion": {},
            "propietario_usuario_id": None,
            "metadata": {},
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }


@pytest.fixture()
def fake_repo() -> DummyCRMRepository:
    return DummyCRMRepository()


@pytest.fixture()
def app(fake_repo: DummyCRMRepository) -> FastAPI:
    fastapi_app = FastAPI()
    fastapi_app.include_router(crm_routes.router)
    fastapi_app.dependency_overrides[crm_routes.get_repository] = lambda: fake_repo
    return fastapi_app


@pytest.fixture()
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(app=app, base_url="http://testserver") as session:
        yield session


def _headers() -> dict[str, str]:
    return {"X-Organizacion-Id": str(uuid.uuid4()), "X-Usuario-Id": str(uuid.uuid4())}


@pytest.mark.asyncio
async def test_list_accounts(client: AsyncClient) -> None:
    resp = await client.get("/crm/cuentas", headers=_headers())
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["items"]
    assert payload["limit"] == 50
    assert payload["offset"] == 0


@pytest.mark.asyncio
async def test_create_account(client: AsyncClient) -> None:
    body = {"nombre": "Nueva Cuenta", "tipo": "cliente"}
    resp = await client.post("/crm/cuentas", headers=_headers(), json=body)
    assert resp.status_code == 201
    data = resp.json()
    assert data["nombre"] == "Nueva Cuenta"
    assert data["tipo"] == "cliente"


@pytest.mark.asyncio
async def test_get_account_not_found(client: AsyncClient) -> None:
    headers = _headers()
    resp = await client.get(
        f"/crm/cuentas/{uuid.UUID(int=1)}",
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_missing_org_header_returns_400(client: AsyncClient) -> None:
    resp = await client.get("/crm/cuentas")
    assert resp.status_code == 422  # FastAPI validation error for header
