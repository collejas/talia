from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.routes import crm as crm_routes


def _build_request() -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/crm/testing",
        "query_string": b"",
        "headers": [],
    }
    return Request(scope)


@pytest.mark.asyncio
async def test_require_organizacion_id_allows_same_tenant(monkeypatch: pytest.MonkeyPatch) -> None:
    actor_org = uuid4()
    actor_user = uuid4()

    class DummyCRMRepository:
        def __init__(self, user_token: str | None = None) -> None:
            self.user_token = user_token

        async def get_permission_context(self) -> dict[str, str]:
            return {
                "organizacion_id": str(actor_org),
                "usuario_id": str(actor_user),
            }

    class FailingPlatformRepository:
        def __init__(self, *args, **kwargs) -> None:
            raise AssertionError("PlatformRepository no debe invocarse en same-tenant")

    monkeypatch.setattr(crm_routes, "_is_pytest_runtime", lambda: False)
    monkeypatch.setattr(crm_routes.settings, "environment", "development")
    monkeypatch.setattr(crm_routes, "CRMRepository", DummyCRMRepository)
    monkeypatch.setattr(crm_routes, "PlatformRepository", FailingPlatformRepository)

    result = await crm_routes.require_organizacion_id(
        x_organizacion_id=str(actor_org),
        request=_build_request(),
        user_token="token",
    )

    assert result == actor_org


@pytest.mark.asyncio
async def test_require_organizacion_id_denies_cross_tenant_for_non_platform_admin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_org = uuid4()
    requested_org = uuid4()
    actor_user = uuid4()

    class DummyCRMRepository:
        def __init__(self, user_token: str | None = None) -> None:
            self.user_token = user_token

        async def get_permission_context(self) -> dict[str, str]:
            return {
                "organizacion_id": str(actor_org),
                "usuario_id": str(actor_user),
            }

    class DummyPlatformRepository:
        async def auth_get_user(self, *, user_token: str) -> dict[str, str]:
            return {"id": str(actor_user)}

        async def is_platform_admin(self, *, user_id: UUID) -> bool:
            return False

    monkeypatch.setattr(crm_routes, "_is_pytest_runtime", lambda: False)
    monkeypatch.setattr(crm_routes.settings, "environment", "development")
    monkeypatch.setattr(crm_routes, "CRMRepository", DummyCRMRepository)
    monkeypatch.setattr(crm_routes, "PlatformRepository", DummyPlatformRepository)

    with pytest.raises(HTTPException) as excinfo:
        await crm_routes.require_organizacion_id(
            x_organizacion_id=str(requested_org),
            request=_build_request(),
            user_token="token",
        )

    assert excinfo.value.status_code == 403
    assert excinfo.value.detail == "owner_scope_violation"


@pytest.mark.asyncio
async def test_require_organizacion_id_allows_cross_tenant_for_platform_admin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_org = uuid4()
    requested_org = uuid4()
    actor_user = uuid4()

    class DummyCRMRepository:
        def __init__(self, user_token: str | None = None) -> None:
            self.user_token = user_token

        async def get_permission_context(self) -> dict[str, str]:
            return {
                "organizacion_id": str(actor_org),
                "usuario_id": str(actor_user),
            }

    class DummyPlatformRepository:
        async def auth_get_user(self, *, user_token: str) -> dict[str, str]:
            return {"id": str(actor_user)}

        async def is_platform_admin(self, *, user_id: UUID) -> bool:
            return True

    monkeypatch.setattr(crm_routes, "_is_pytest_runtime", lambda: False)
    monkeypatch.setattr(crm_routes.settings, "environment", "development")
    monkeypatch.setattr(crm_routes, "CRMRepository", DummyCRMRepository)
    monkeypatch.setattr(crm_routes, "PlatformRepository", DummyPlatformRepository)

    result = await crm_routes.require_organizacion_id(
        x_organizacion_id=str(requested_org),
        request=_build_request(),
        user_token="token",
    )

    assert result == requested_org
