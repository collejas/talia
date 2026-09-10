import uuid
from typing import Any

import pytest
from fastapi import HTTPException

from app.api.routes import crm as crm_routes


class ImportRepositoryFake:
    def __init__(self, *, allowed_role: str | None = "vendedor") -> None:
        self.allowed_role = allowed_role
        self.created: list[dict[str, Any]] = []

    async def get_permission_context(self) -> dict[str, Any]:
        return {"es_admin": False, "es_owner": False}

    async def user_has_role(self, *, usuario_id: uuid.UUID, role_code: str) -> bool:
        return role_code == self.allowed_role

    async def get_persona_by_email(self, *, email: str, organizacion_id: uuid.UUID) -> dict[str, Any] | None:
        return None

    async def get_persona_by_phone_e164(self, *, phone_e164: str, organizacion_id: uuid.UUID) -> dict[str, Any] | None:
        return None

    async def create_persona(self, *, organizacion_id: uuid.UUID, payload: dict[str, Any]) -> dict[str, Any]:
        self.created.append(payload)
        return {"id": str(uuid.uuid4()), **payload}


@pytest.mark.asyncio
async def test_import_personas_assigns_session_user_and_skips_file_duplicates(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = ImportRepositoryFake()
    monkeypatch.setattr(crm_routes, "CRMRepository", lambda user_token=None: fake)
    actor_id = uuid.uuid4()
    organization_id = uuid.uuid4()
    payload = crm_routes.CRMContactImportPayload(
        items=[
            crm_routes.CRMContactImportItem(nombre="Ana", correo_principal="ANA@example.com"),
            crm_routes.CRMContactImportItem(nombre="Otra", correo_principal="ana@example.com"),
        ]
    )

    result = await crm_routes.import_personas(
        repo=fake,
        user_token="test-token",
        organizacion_id=organization_id,
        usuario_id=actor_id,
        payload=payload,
    )

    assert result["created"] == 1
    assert result["skipped"] == 1
    assert result["failed"] == 0
    assert fake.created[0]["propietario_usuario_id"] == str(actor_id)


@pytest.mark.asyncio
async def test_import_personas_rejects_non_commercial_role(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = ImportRepositoryFake(allowed_role=None)
    monkeypatch.setattr(crm_routes, "CRMRepository", lambda user_token=None: fake)

    with pytest.raises(HTTPException) as error:
        await crm_routes.import_personas(
            repo=fake,
            user_token="test-token",
            organizacion_id=uuid.uuid4(),
            usuario_id=uuid.uuid4(),
            payload=crm_routes.CRMContactImportPayload(
                items=[crm_routes.CRMContactImportItem(nombre="Ana")]
            ),
        )

    assert error.value.status_code == 403
    assert error.value.detail == "contact_import_role_required"
