import uuid
from typing import Any

import pytest
from fastapi import HTTPException

from app.api.routes import crm as crm_routes


class ImportRepositoryFake:
    def __init__(self, *, permission: bool = True, admin: bool = False, owner: bool = False, email_required: bool = True) -> None:
        self.permission = permission
        self.admin = admin
        self.owner = owner
        self.email_required = email_required
        self.created: list[dict[str, Any]] = []

    async def get_permission_context(self) -> dict[str, Any]:
        return {
            "es_admin": self.admin,
            "es_owner": self.owner,
            "permisos": ["contacts.import"] if self.permission else [],
        }

    async def get_organizacion_contact_email_required(self, *, organizacion_id: uuid.UUID) -> bool:
        return self.email_required

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
async def test_import_personas_rejects_without_import_permission(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = ImportRepositoryFake(permission=False)
    monkeypatch.setattr(crm_routes, "CRMRepository", lambda user_token=None: fake)

    with pytest.raises(HTTPException) as error:
        await crm_routes.import_personas(
            repo=fake,
            user_token="test-token",
            organizacion_id=uuid.uuid4(),
            usuario_id=uuid.uuid4(),
            payload=crm_routes.CRMContactImportPayload(
                items=[crm_routes.CRMContactImportItem(nombre="Ana", correo_principal="ana@example.com")]
            ),
        )

    assert error.value.status_code == 403
    assert error.value.detail == "contact_import_permission_required"


@pytest.mark.asyncio
async def test_import_personas_allows_admin_without_import_permission(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = ImportRepositoryFake(permission=False, admin=True)
    monkeypatch.setattr(crm_routes, "CRMRepository", lambda user_token=None: fake)

    result = await crm_routes.import_personas(
        repo=fake,
        user_token="test-token",
        organizacion_id=uuid.uuid4(),
        usuario_id=uuid.uuid4(),
        payload=crm_routes.CRMContactImportPayload(
            items=[crm_routes.CRMContactImportItem(nombre="Ana", correo_principal="ana@example.com")]
        ),
    )

    assert result["created"] == 1


@pytest.mark.asyncio
async def test_import_personas_allows_missing_email_when_tenant_makes_it_optional(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = ImportRepositoryFake(email_required=False)
    monkeypatch.setattr(crm_routes, "CRMRepository", lambda user_token=None: fake)

    result = await crm_routes.import_personas(
        repo=fake,
        user_token="test-token",
        organizacion_id=uuid.uuid4(),
        usuario_id=uuid.uuid4(),
        payload=crm_routes.CRMContactImportPayload(
            items=[crm_routes.CRMContactImportItem(nombre="Ana")]
        ),
    )

    assert result["created"] == 1
    assert "correo_principal" not in fake.created[0]
