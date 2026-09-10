from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from starlette.requests import Request

from app.api.routes import tenant as tenant_routes


def _request_with_headers(headers: dict[str, str] | None = None) -> Request:
    raw_headers = [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()]
    return Request({"type": "http", "headers": raw_headers})


@pytest.mark.asyncio
async def test_require_tenant_context_prefers_public_usuarios_over_auth_metadata() -> None:
    user_id = uuid4()
    db_org = uuid4()
    metadata_org = uuid4()

    class DummyPlatformRepository:
        async def auth_get_user(self, *, user_token: str) -> dict[str, object]:
            return {
                "id": str(user_id),
                "user_metadata": {"organizacion_id": str(metadata_org)},
            }

    class DummyCRMRepository:
        async def get_usuario_organizacion_id(self, *, usuario_id: UUID) -> UUID | None:
            assert usuario_id == user_id
            return db_org

    context = await tenant_routes.require_tenant_context(
        request=_request_with_headers(),
        user_token="token",
        platform_repo=DummyPlatformRepository(),
        crm_repo=DummyCRMRepository(),
    )

    assert context.user_id == user_id
    assert context.organizacion_id == db_org


@pytest.mark.asyncio
async def test_require_tenant_context_falls_back_to_auth_metadata_when_public_usuario_missing() -> None:
    user_id = uuid4()
    metadata_org = uuid4()

    class DummyPlatformRepository:
        async def auth_get_user(self, *, user_token: str) -> dict[str, object]:
            return {
                "id": str(user_id),
                "app_metadata": {"organizacion_id": str(metadata_org)},
            }

    class DummyCRMRepository:
        async def get_usuario_organizacion_id(self, *, usuario_id: UUID) -> UUID | None:
            assert usuario_id == user_id
            return None

    context = await tenant_routes.require_tenant_context(
        request=_request_with_headers(),
        user_token="token",
        platform_repo=DummyPlatformRepository(),
        crm_repo=DummyCRMRepository(),
    )

    assert context.user_id == user_id
    assert context.organizacion_id == metadata_org


@pytest.mark.asyncio
async def test_require_tenant_context_allows_header_for_current_tenant() -> None:
    user_id = uuid4()
    organization_id = uuid4()

    class DummyPlatformRepository:
        async def auth_get_user(self, *, user_token: str) -> dict[str, object]:
            return {"id": str(user_id)}

        async def is_platform_admin(self, *, user_id: UUID) -> bool:
            raise AssertionError("no debe validar admin para el tenant propio")

    class DummyCRMRepository:
        async def get_usuario_organizacion_id(self, *, usuario_id: UUID) -> UUID | None:
            return organization_id

    context = await tenant_routes.require_tenant_context(
        request=_request_with_headers({"x-organizacion-id": str(organization_id)}),
        user_token="token",
        platform_repo=DummyPlatformRepository(),
        crm_repo=DummyCRMRepository(),
    )

    assert context.organizacion_id == organization_id
