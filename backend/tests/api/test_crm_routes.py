import uuid
from typing import Any, AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

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

    async def list_activities(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_activities", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "tipo": "llamada",
                "canal": "telefono",
                "asunto": "Seguimiento",
                "descripcion": None,
                "estado": "pendiente",
                "prioridad": "alta",
                "fecha_vencimiento": None,
                "inicio_en": "2024-01-02T12:00:00Z",
                "fin_en": None,
                "sla_horas": None,
                "recordatorio_en": None,
                "cuenta_id": None,
                "contacto_id": None,
                "oportunidad_id": None,
                "creado_por_usuario_id": None,
                "asignado_a_usuario_id": None,
                "metadata": {},
                "creado_en": "2024-01-01T00:00:00Z",
                "actualizado_en": "2024-01-01T00:00:00Z",
            }
        ]

    async def create_activity(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_activity", kwargs))
        return {
            "id": str(uuid.uuid4()),
            "organizacion_id": str(kwargs["organizacion_id"]),
            **kwargs["payload"],
            "estado": kwargs["payload"].get("estado", "pendiente"),
            "prioridad": kwargs["payload"].get("prioridad", "media"),
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }

    async def get_activity(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_activity", kwargs))
        if kwargs["activity_id"] == uuid.UUID(int=1):
            return None
        return {
            "id": str(kwargs["activity_id"]),
            "organizacion_id": str(kwargs["organizacion_id"]),
            "tipo": "llamada",
            "canal": "telefono",
            "asunto": "Seguimiento",
            "descripcion": None,
            "estado": "pendiente",
            "prioridad": "media",
            "fecha_vencimiento": None,
            "inicio_en": "2024-01-02T12:00:00Z",
            "fin_en": None,
            "sla_horas": None,
            "recordatorio_en": None,
            "cuenta_id": None,
            "contacto_id": None,
            "oportunidad_id": None,
            "creado_por_usuario_id": None,
            "asignado_a_usuario_id": None,
            "metadata": {},
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }

    async def list_tickets(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_tickets", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "asunto": "Incidencia",
                "descripcion": None,
                "estado": "abierto",
                "prioridad": "media",
                "canal_origen": "whatsapp",
                "cuenta_id": None,
                "contacto_id": None,
                "asignado_a_usuario_id": None,
                "metadata": {},
                "creado_en": "2024-01-01T00:00:00Z",
                "actualizado_en": "2024-01-01T00:00:00Z",
                "cerrado_en": None,
            }
        ]

    async def create_ticket(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_ticket", kwargs))
        return {
            "id": str(uuid.uuid4()),
            "organizacion_id": str(kwargs["organizacion_id"]),
            **kwargs["payload"],
            "estado": kwargs["payload"].get("estado", "abierto"),
            "prioridad": kwargs["payload"].get("prioridad", "media"),
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
        }

    async def get_ticket(self, **kwargs: Any) -> dict[str, Any] | None:
        self.calls.append(("get_ticket", kwargs))
        if kwargs["ticket_id"] == uuid.UUID(int=1):
            return None
        return {
            "id": str(kwargs["ticket_id"]),
            "organizacion_id": str(kwargs["organizacion_id"]),
            "asunto": "Incidencia",
            "descripcion": None,
            "estado": "abierto",
            "prioridad": "media",
            "canal_origen": "whatsapp",
            "cuenta_id": None,
            "contacto_id": None,
            "asignado_a_usuario_id": None,
            "metadata": {},
            "creado_en": "2024-01-01T00:00:00Z",
            "actualizado_en": "2024-01-01T00:00:00Z",
            "cerrado_en": None,
        }

    async def list_ticket_comments(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append(("list_ticket_comments", kwargs))
        return [
            {
                "id": str(uuid.uuid4()),
                "organizacion_id": str(kwargs["organizacion_id"]),
                "ticket_id": str(kwargs["ticket_id"]),
                "autor_usuario_id": str(uuid.uuid4()),
                "autor_cliente_id": None,
                "mensaje": "Comentario",
                "metadata": {},
                "creado_en": "2024-01-01T00:00:00Z",
            }
        ]

    async def create_ticket_comment(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_ticket_comment", kwargs))
        return {
            "id": str(uuid.uuid4()),
            "organizacion_id": str(kwargs["organizacion_id"]),
            **kwargs["payload"],
            "mensaje": kwargs["payload"]["mensaje"],
            "metadata": kwargs["payload"].get("metadata", {}),
            "creado_en": "2024-01-01T00:00:00Z",
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
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as session:
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


@pytest.mark.asyncio
async def test_list_activities(client: AsyncClient) -> None:
    resp = await client.get("/crm/actividades", headers=_headers())
    assert resp.status_code == 200
    assert resp.json()["items"]


@pytest.mark.asyncio
async def test_create_activity(client: AsyncClient) -> None:
    body = {"tipo": "llamada", "asunto": "Seguimiento"}
    resp = await client.post("/crm/actividades", headers=_headers(), json=body)
    assert resp.status_code == 201
    assert resp.json()["tipo"] == "llamada"


@pytest.mark.asyncio
async def test_get_activity_not_found(client: AsyncClient) -> None:
    resp = await client.get(f"/crm/actividades/{uuid.UUID(int=1)}", headers=_headers())
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_tickets(client: AsyncClient) -> None:
    resp = await client.get("/crm/tickets", headers=_headers())
    assert resp.status_code == 200
    assert resp.json()["items"]


@pytest.mark.asyncio
async def test_create_ticket(client: AsyncClient) -> None:
    resp = await client.post("/crm/tickets", headers=_headers(), json={"asunto": "Incidencia"})
    assert resp.status_code == 201
    assert resp.json()["asunto"] == "Incidencia"


@pytest.mark.asyncio
async def test_get_ticket_not_found(client: AsyncClient) -> None:
    resp = await client.get(f"/crm/tickets/{uuid.UUID(int=1)}", headers=_headers())
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_ticket_comments(client: AsyncClient) -> None:
    ticket_id = uuid.uuid4()
    resp = await client.get(f"/crm/tickets/{ticket_id}/comentarios", headers=_headers())
    assert resp.status_code == 200
    assert resp.json()[0]["ticket_id"] == str(ticket_id)


@pytest.mark.asyncio
async def test_create_ticket_comment(client: AsyncClient) -> None:
    ticket_id = uuid.uuid4()
    body = {"ticket_id": str(ticket_id), "mensaje": "Seguimiento"}
    resp = await client.post(f"/crm/tickets/{ticket_id}/comentarios", headers=_headers(), json=body)
    assert resp.status_code == 201
    assert resp.json()["mensaje"] == "Seguimiento"


@pytest.mark.asyncio
async def test_create_ticket_comment_mismatch(client: AsyncClient) -> None:
    ticket_id = uuid.uuid4()
    other_id = uuid.uuid4()
    body = {"ticket_id": str(other_id), "mensaje": "Error"}
    resp = await client.post(f"/crm/tickets/{ticket_id}/comentarios", headers=_headers(), json=body)
    assert resp.status_code == 400
